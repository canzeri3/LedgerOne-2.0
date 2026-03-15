'use client'

import { useEffect, useRef } from 'react'

type ParticleNetworkBackgroundProps = {
  className?: string
}

type ClusterKind = 'big' | 'small'

type ClusterSpec = {
  id: string
  kind: ClusterKind
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
  rotation?: number
  minDots: number
  maxDots: number
  linkDistance: number
}

type NodePoint = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  glow: number
  alpha: number
  homeX: number
  homeY: number
  pull: number
  clusterId: string
  linkDistance: number
  lineAlphaScale: number
}

const MAX_DPR = 1.5
const TARGET_FPS = 45
const FRAME_MS = 1000 / TARGET_FPS

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const CLUSTER_LAYOUT: ClusterSpec[] = [
  {
    id: 'top-left',
    kind: 'small',
    centerX: 0.93,
    centerY: 0.175,
    radiusX: 0.025,
    radiusY: 0.065,
    rotation: 0,
    minDots: 5,
    maxDots: 10,
    linkDistance: 78,
  },
  {
    id: 'hero-big',
    kind: 'big',
    centerX: 0.65,
    centerY: 0.22,
    radiusX: 0.235,
    radiusY: 0.19,
    rotation: -0.06,
    minDots: 40,
    maxDots: 60,
    linkDistance: 150,
  },
  {
    id: 'top-right-tiny',
    kind: 'small',
    centerX: 0.972,
    centerY: 0.23,
    radiusX: 0.014,
    radiusY: 0.008,
    rotation: 0,
    minDots: 4,
    maxDots: 6,
    linkDistance: 20,
  },
  {
    id: 'right-lower-card',
    kind: 'small',
    centerX: 0.68,
    centerY: 0.6,
    radiusX: 0.2,
    radiusY: 0.17,
    rotation: 0.22,
    minDots: 45,
    maxDots: 50,
    linkDistance: 150,
  },
  {
    id: 'center-left-mid',
    kind: 'small',
    centerX: 0.41,
    centerY: 0.68,
    radiusX: 0.045,
    radiusY: 0.09,
    rotation: -0.35,
    minDots: 6,
    maxDots: 10,
    linkDistance: 80,
  },
  {
    id: 'bottom-right',
    kind: 'small',
    centerX: 0.89,
    centerY: 0.79,
    radiusX: 0.055,
    radiusY: 0.115,
    rotation: 0.24,
    minDots: 7,
    maxDots: 13,
    linkDistance: 84,
  },
]

function pickDotCount(spec: ClusterSpec, width: number, height: number, reducedMotion: boolean) {
  const areaScale = clamp((width * height) / 1_600_000, 0.9, 1.1)
  const densityScale = reducedMotion ? 0.82 : 0.9
  const raw =
    spec.minDots +
    Math.round((spec.maxDots - spec.minDots) * areaScale * densityScale * (0.45 + Math.random() * 0.32))

  return clamp(raw, spec.minDots, spec.maxDots)
}

function samplePointInEllipse(spec: ClusterSpec, width: number, height: number) {
  const cx = spec.centerX * width
  const cy = spec.centerY * height
  const rx = spec.radiusX * width
  const ry = spec.radiusY * height
  const rotation = spec.rotation ?? 0

  const angle = Math.random() * Math.PI * 2
  const distance = Math.sqrt(Math.random())

  const localX = Math.cos(angle) * rx * distance
  const localY = Math.sin(angle) * ry * distance

  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  return {
    x: cx + localX * cos - localY * sin,
    y: cy + localX * sin + localY * cos,
  }
}

function makeNode(spec: ClusterSpec, width: number, height: number, reducedMotion: boolean): NodePoint {
  const sampled = samplePointInEllipse(spec, width, height)
  const minEdge = Math.min(width, height)

  const driftSpeed = reducedMotion ? 0.018 : 0.085
  const angle = Math.random() * Math.PI * 2
  const isBig = spec.kind === 'big'

  return {
    x: sampled.x + (Math.random() - 0.5) * (isBig ? 9 : 5),
    y: sampled.y + (Math.random() - 0.5) * (isBig ? 9 : 5),
    homeX: sampled.x,
    homeY: sampled.y,
    vx: Math.cos(angle) * driftSpeed * (0.45 + Math.random() * 0.9),
    vy: Math.sin(angle) * driftSpeed * (0.45 + Math.random() * 0.9),
    pull: isBig ? 0.0036 + Math.random() * 0.0014 : 0.0048 + Math.random() * 0.0022,
    radius: isBig
      ? (minEdge < 420 ? 1.25 : 1.45) + Math.random() * 2.1
      : (minEdge < 420 ? 1.0 : 1.15) + Math.random() * 1.45,
    glow: isBig ? 7 + Math.random() * 10 : 4 + Math.random() * 7,
    alpha: isBig ? 0.16 + Math.random() * 0.16 : 0.14 + Math.random() * 0.14,
    clusterId: spec.id,
    linkDistance: spec.linkDistance,
    lineAlphaScale: isBig ? 1 : 0.82,
  }
}

function addNodeToClusterMap(map: Map<string, NodePoint[]>, node: NodePoint) {
  const existing = map.get(node.clusterId)
  if (existing) {
    existing.push(node)
    return
  }
  map.set(node.clusterId, [node])
}

export function ParticleNetworkBackground({ className = '' }: ParticleNetworkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = reducedMotionQuery.matches
    let animationFrameId = 0
    let width = 0
    let height = 0
    let dpr = 1
    let nodes: NodePoint[] = []
    let nodesByCluster = new Map<string, NodePoint[]>()
    let lastFrameTime = 0
    let sceneInView = true
    let destroyed = false

    const shouldAnimate = () => !destroyed && sceneInView && !document.hidden

    const stopAnimation = () => {
      if (!animationFrameId) return
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = 0
    }

    const queueFrame = () => {
      if (animationFrameId || !shouldAnimate()) return
      animationFrameId = window.requestAnimationFrame(render)
    }

    const setCanvasSize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const createNodes = () => {
      const nextNodes: NodePoint[] = []
      const nextByCluster = new Map<string, NodePoint[]>()

      for (const spec of CLUSTER_LAYOUT) {
        const count = pickDotCount(spec, width, height, reducedMotion)
        for (let i = 0; i < count; i += 1) {
          const node = makeNode(spec, width, height, reducedMotion)
          nextNodes.push(node)
          addNodeToClusterMap(nextByCluster, node)
        }
      }

      nodes = nextNodes
      nodesByCluster = nextByCluster
    }

    const updateNodes = () => {
      for (const node of nodes) {
        node.vx += (node.homeX - node.x) * node.pull
        node.vy += (node.homeY - node.y) * node.pull
        node.vx *= 0.996
        node.vy *= 0.996
        node.x += node.vx
        node.y += node.vy
      }
    }

    const drawBackdrop = () => {
      const topGlow = ctx.createRadialGradient(
        width * 0.56,
        height * 0.14,
        0,
        width * 0.56,
        height * 0.14,
        Math.max(width, height) * 0.58
      )
      topGlow.addColorStop(0, 'rgba(59, 130, 246, 0.035)')
      topGlow.addColorStop(0.24, 'rgba(49, 46, 129, 0.04)')
      topGlow.addColorStop(0.52, 'rgba(15, 23, 42, 0.04)')
      topGlow.addColorStop(0.82, 'rgba(2, 6, 23, 0.00)')
      ctx.fillStyle = topGlow
      ctx.fillRect(0, 0, width, height)

      const heroGlow = ctx.createRadialGradient(
        width * 0.6,
        height * 0.48,
        0,
        width * 0.6,
        height * 0.48,
        Math.max(width, height) * 0.6
      )
      heroGlow.addColorStop(0, 'rgba(37, 99, 235, 0.03)')
      heroGlow.addColorStop(0.32, 'rgba(30, 41, 59, 0.04)')
      heroGlow.addColorStop(0.72, 'rgba(2, 6, 23, 0.00)')
      ctx.fillStyle = heroGlow
      ctx.fillRect(0, 0, width, height)

      const nightWash = ctx.createLinearGradient(0, 0, 0, height)
      nightWash.addColorStop(0, 'rgba(2, 6, 23, 0.18)')
      nightWash.addColorStop(0.26, 'rgba(2, 6, 23, 0.08)')
      nightWash.addColorStop(0.72, 'rgba(2, 6, 23, 0.14)')
      nightWash.addColorStop(1, 'rgba(2, 6, 23, 0.3)')
      ctx.fillStyle = nightWash
      ctx.fillRect(0, 0, width, height)
    }

    const drawConnections = () => {
      for (const clusterNodes of nodesByCluster.values()) {
        for (let i = 0; i < clusterNodes.length; i += 1) {
          const a = clusterNodes[i]

          for (let j = i + 1; j < clusterNodes.length; j += 1) {
            const b = clusterNodes[j]
            const dx = a.x - b.x
            const dy = a.y - b.y
            const distanceLimit = Math.min(a.linkDistance, b.linkDistance)
            const distanceLimitSq = distanceLimit * distanceLimit
            const distanceSq = dx * dx + dy * dy

            if (distanceSq > distanceLimitSq) continue

            const distance = Math.sqrt(distanceSq)
            const linkStrength = 1 - distance / distanceLimit
            const opacity =
              (0.03 + Math.pow(linkStrength, 1.45) * 0.18) * Math.min(a.lineAlphaScale, b.lineAlphaScale)

            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(219, 234, 254, ${opacity.toFixed(4)})`
            ctx.lineWidth = distance < distanceLimit * 0.42 ? 0.96 : 0.72
            ctx.shadowColor = 'rgba(96, 165, 250, 0.18)'
            ctx.shadowBlur = 2
            ctx.stroke()
            ctx.shadowBlur = 0
          }
        }
      }
    }

    const drawNodes = () => {
      for (const node of nodes) {
        if (node.alpha <= 0.02) continue

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(239, 246, 255, ${node.alpha.toFixed(4)})`
        ctx.shadowColor = 'rgba(96, 165, 250, 0.92)'
        ctx.shadowBlur = node.glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(node.x, node.y, Math.max(1, node.radius * 0.42), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
        ctx.shadowBlur = 0
        ctx.fill()
      }
    }

    const render = (now: number) => {
      animationFrameId = 0
      if (!shouldAnimate()) return

      if (lastFrameTime && now - lastFrameTime < FRAME_MS) {
        queueFrame()
        return
      }

      lastFrameTime = now
      ctx.clearRect(0, 0, width, height)
      drawBackdrop()
      drawConnections()
      drawNodes()
      updateNodes()
      queueFrame()
    }

    const resetScene = () => {
      setCanvasSize()
      createNodes()
      lastFrameTime = 0
      queueFrame()
    }

    const syncAnimationState = () => {
      if (shouldAnimate()) {
        lastFrameTime = 0
        queueFrame()
      } else {
        stopAnimation()
      }
    }

    const handleReducedMotionChange = () => {
      reducedMotion = reducedMotionQuery.matches
      createNodes()
      syncAnimationState()
    }

    const resizeTarget = canvas.parentElement ?? canvas
    const resizeObserver = new ResizeObserver(() => {
      resetScene()
    })

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        sceneInView = Boolean(entries[0]?.isIntersecting)
        syncAnimationState()
      },
      {
        threshold: 0,
        rootMargin: '20% 0px 20% 0px',
      }
    )

    const onVisibilityChange = () => {
      syncAnimationState()
    }

    resetScene()
    resizeObserver.observe(resizeTarget)
    intersectionObserver.observe(canvas)

    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
    } else {
      // eslint-disable-next-line deprecation/deprecation
      reducedMotionQuery.addListener(handleReducedMotionChange)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    syncAnimationState()

    return () => {
      destroyed = true
      stopAnimation()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)

      if (typeof reducedMotionQuery.removeEventListener === 'function') {
        reducedMotionQuery.removeEventListener('change', handleReducedMotionChange)
      } else {
        // eslint-disable-next-line deprecation/deprecation
        reducedMotionQuery.removeListener(handleReducedMotionChange)
      }
    }
  }, [])

  const maskImage =
    'linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,1) 86%, rgba(0,0,0,0.88) 94%, rgba(0,0,0,0) 100%)'

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-[0.98]"
        style={{
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_56%_14%,rgba(49,46,129,0.055),transparent_32%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_48%,rgba(30,64,175,0.04),transparent_40%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.24)_0%,rgba(2,6,23,0.1)_20%,rgba(2,6,23,0.16)_72%,rgba(2,6,23,0.62)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(2,6,23,0.52)_100%)]" />
    </div>
  )
}