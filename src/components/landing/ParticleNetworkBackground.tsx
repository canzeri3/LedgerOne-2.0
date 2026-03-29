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
  driftMultiplier?: number
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

type BackdropCache = {
  bitmap: HTMLCanvasElement
}

type ParticlePerformanceProfile = {
  lowPower: boolean
  maxDpr: number
  targetFps: number
  densityMultiplier: number
  lineShadowBlur: number
}

// FIX 2: Numeric keys eliminate per-frame string allocation from Map<string, …>
type SpatialBucketMap = Map<number, NodePoint[]>

const DEFAULT_PROFILE: ParticlePerformanceProfile = {
  lowPower: false,
  maxDpr: 1.5,
  targetFps: 45,
  densityMultiplier: 1,
  lineShadowBlur: 2,
}

const CONNECTION_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
]

// FIX 3: Connection batching — 16 opacity levels × 2 line widths = 32 buckets
// Connections are accumulated into flat number[] buffers (x1,y1,x2,y2,…)
// then flushed with one ctx.stroke() per non-empty bucket instead of one per connection.
const OPACITY_LEVELS = 16
const CONN_OPACITY_MIN = 0.024   // minimum reachable connection opacity
const CONN_OPACITY_RANGE = 0.186 // max (0.21) − min (0.024)
const SEGMENT_BUCKET_COUNT = OPACITY_LEVELS * 2 // thin buckets [0..15], wide [16..31]

// FIX 2: Integer spatial bucket key — avoids `${col}:${row}` string per node per frame.
// offset=100 safely handles nodes that drift up to 100 cells off-canvas edge.
const BUCKET_KEY_STRIDE = 65536
const BUCKET_KEY_OFFSET = 100

function getBucketKey(col: number, row: number): number {
  return (col + BUCKET_KEY_OFFSET) * BUCKET_KEY_STRIDE + (row + BUCKET_KEY_OFFSET)
}

function decodeBucketCol(key: number): number {
  return Math.floor(key / BUCKET_KEY_STRIDE) - BUCKET_KEY_OFFSET
}

function decodeBucketRow(key: number): number {
  return (key % BUCKET_KEY_STRIDE) - BUCKET_KEY_OFFSET
}

function getParticlePerformanceProfile(): ParticlePerformanceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return DEFAULT_PROFILE
  }

  const hardwareConcurrency = navigator.hardwareConcurrency || 8
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const lowPower = coarsePointer || hardwareConcurrency <= 4 || deviceMemory <= 4

  if (!lowPower) return DEFAULT_PROFILE

  return {
    lowPower: true,
    maxDpr: 1.1,
    targetFps: 36,
    densityMultiplier: 0.72,
    lineShadowBlur: 0,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const CLUSTER_LAYOUT: ClusterSpec[] = [
  {
    id: 'Middle-right',
    kind: 'small',
    centerX: 0.9,
    centerY: 0.40,
    radiusX: 0.075,
    radiusY: 0.065,
    rotation: 0.7,
    minDots: 15,
    maxDots: 20,
    linkDistance: 80,
  },
  {
    id: 'hero-big',
    kind: 'big',
    centerX: 0.65,
    centerY: 0.22,
    radiusX: 0.235,
    radiusY: 0.19,
    rotation: -0.06,
    driftMultiplier: 1.6,
    minDots: 40,
    maxDots: 60,
    linkDistance: 150,
  },
  {
    id: 'middle-right-tiny',
    kind: 'small',
    centerX: 0.962,
    centerY: 0.46,
    radiusX: 0.014,
    radiusY: 0.08,
    driftMultiplier: 1.6,
    rotation: 0,
    minDots: 0,
    maxDots: 0,
    linkDistance: 60,
  },
  {
    id: 'right-lower-card',
    kind: 'small',
    centerX: 0.68,
    centerY: 0.6,
    radiusX: 0.2,
    radiusY: 0.17,
    rotation: 0.22,
    driftMultiplier: 1.6,
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

function pickDotCount(
  spec: ClusterSpec,
  width: number,
  height: number,
  reducedMotion: boolean,
  densityMultiplier: number
) {
  const areaScale = clamp((width * height) / 1_600_000, 0.9, 1.1)
  const densityScale = (reducedMotion ? 0.82 : 0.9) * densityMultiplier
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
  const driftMultiplier = spec.driftMultiplier ?? 1
  const angle = Math.random() * Math.PI * 2
  const isBig = spec.kind === 'big'
  return {
    x: sampled.x + (Math.random() - 0.5) * (isBig ? 9 : 5),
    y: sampled.y + (Math.random() - 0.5) * (isBig ? 9 : 5),
    homeX: sampled.x,
    homeY: sampled.y,
    vx: Math.cos(angle) * driftSpeed * driftMultiplier * (0.45 + Math.random() * 0.9),
    vy: Math.sin(angle) * driftSpeed * driftMultiplier * (0.45 + Math.random() * 0.9),
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

function createBackdropCache(width: number, height: number): BackdropCache {
  const bitmap = document.createElement('canvas')
  bitmap.width = Math.max(1, Math.round(width))
  bitmap.height = Math.max(1, Math.round(height))

  const bitmapCtx = bitmap.getContext('2d')
  if (!bitmapCtx) {
    return { bitmap }
  }

  const topGlow = bitmapCtx.createRadialGradient(
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

  const heroGlow = bitmapCtx.createRadialGradient(
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

  const nightWash = bitmapCtx.createLinearGradient(0, 0, 0, height)
  nightWash.addColorStop(0, 'rgba(2, 6, 23, 0.18)')
  nightWash.addColorStop(0.26, 'rgba(2, 6, 23, 0.08)')
  nightWash.addColorStop(0.72, 'rgba(2, 6, 23, 0.14)')
  nightWash.addColorStop(1, 'rgba(2, 6, 23, 0.3)')

  bitmapCtx.fillStyle = topGlow
  bitmapCtx.fillRect(0, 0, width, height)

  bitmapCtx.fillStyle = heroGlow
  bitmapCtx.fillRect(0, 0, width, height)

  bitmapCtx.fillStyle = nightWash
  bitmapCtx.fillRect(0, 0, width, height)

  return { bitmap }
}

// FIX 2: buildSpatialBuckets now uses numeric keys (no string allocation)
function buildSpatialBuckets(clusterNodes: NodePoint[], cellSize: number): SpatialBucketMap {
  const buckets: SpatialBucketMap = new Map()

  for (const node of clusterNodes) {
    const col = Math.floor(node.x / cellSize)
    const row = Math.floor(node.y / cellSize)
    const key = getBucketKey(col, row)
    const bucket = buckets.get(key)

    if (bucket) {
      bucket.push(node)
    } else {
      buckets.set(key, [node])
    }
  }

  return buckets
}

export function ParticleNetworkBackground({ className = '' }: ParticleNetworkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    })
    if (!ctx) return

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const profile = getParticlePerformanceProfile()

    let reducedMotion = reducedMotionQuery.matches
    let animationFrameId = 0
    let width = 0
    let height = 0
    let dpr = 1
    let nodes: NodePoint[] = []
    let nodesByCluster = new Map<string, NodePoint[]>()
    let backdropCache: BackdropCache | null = null
    let lastFrameTime = 0
    let frameMs = 1000 / profile.targetFps
    let sceneInView = true
    let destroyed = false

    // FIX 3: Pre-allocated segment buffers (flat x1,y1,x2,y2 arrays), reused every frame.
    // Index [0..OPACITY_LEVELS-1] = thin lines (0.72px), [OPACITY_LEVELS..31] = wide (0.96px).
    const segBuckets: number[][] = Array.from({ length: SEGMENT_BUCKET_COUNT }, () => [])

    // FIX 3: Replaces drawConnectionPair — pushes segment coords into the right bucket
    // instead of issuing an immediate ctx.stroke() per connection.
    const accumulateConnection = (a: NodePoint, b: NodePoint) => {
      const dx = a.x - b.x
      const dy = a.y - b.y
      const distanceLimit = Math.min(a.linkDistance, b.linkDistance)
      const distanceLimitSq = distanceLimit * distanceLimit
      const distanceSq = dx * dx + dy * dy

      if (distanceSq > distanceLimitSq) return

      const distance = Math.sqrt(distanceSq)
      const linkStrength = 1 - distance / distanceLimit
      const opacity =
        (0.03 + Math.pow(linkStrength, 1.45) * 0.18) * Math.min(a.lineAlphaScale, b.lineAlphaScale)

      const opacIdx = clamp(
        Math.floor(((opacity - CONN_OPACITY_MIN) / CONN_OPACITY_RANGE) * OPACITY_LEVELS),
        0,
        OPACITY_LEVELS - 1,
      )
      const isWide = distance < distanceLimit * 0.42
      const bucketIdx = isWide ? OPACITY_LEVELS + opacIdx : opacIdx

      const seg = segBuckets[bucketIdx]
      seg.push(a.x, a.y, b.x, b.y)
    }

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

    const rebuildBackdropCache = () => {
      backdropCache = createBackdropCache(width, height)
    }

    const setCanvasSize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      dpr = Math.min(window.devicePixelRatio || 1, profile.maxDpr)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      rebuildBackdropCache()
    }

    const createNodes = () => {
      const nextNodes: NodePoint[] = []
      const nextByCluster = new Map<string, NodePoint[]>()

      for (const spec of CLUSTER_LAYOUT) {
        const count = pickDotCount(spec, width, height, reducedMotion, profile.densityMultiplier)
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
      if (!backdropCache) return
      ctx.drawImage(backdropCache.bitmap, 0, 0, width, height)
    }

    const drawConnections = () => {
      // Clear segment buckets (reuse allocated arrays, avoid GC)
      for (let i = 0; i < SEGMENT_BUCKET_COUNT; i++) segBuckets[i].length = 0

      if (profile.lineShadowBlur > 0) {
        ctx.shadowColor = 'rgba(96, 165, 250, 0.18)'
        ctx.shadowBlur = profile.lineShadowBlur
      } else {
        ctx.shadowBlur = 0
      }

      // Accumulate all connection segments into opacity/width buckets
      for (const clusterNodes of nodesByCluster.values()) {
        if (clusterNodes.length < 2) continue

        const cellSize = Math.max(18, clusterNodes[0]?.linkDistance || 18)
        const buckets = buildSpatialBuckets(clusterNodes, cellSize)

        for (const [key, bucket] of buckets) {
          // FIX 2: decode integer key instead of key.split(':')
          const col = decodeBucketCol(key)
          const row = decodeBucketRow(key)

          for (const [offsetX, offsetY] of CONNECTION_NEIGHBOR_OFFSETS) {
            const neighbor = buckets.get(getBucketKey(col + offsetX, row + offsetY))
            if (!neighbor) continue

            if (offsetX === 0 && offsetY === 0) {
              for (let i = 0; i < bucket.length; i += 1) {
                const a = bucket[i]
                for (let j = i + 1; j < bucket.length; j += 1) {
                  accumulateConnection(a, bucket[j])
                }
              }

              continue
            }

            for (const a of bucket) {
              for (const b of neighbor) {
                accumulateConnection(a, b)
              }
            }
          }
        }
      }

      // FIX 3: Flush — one ctx.stroke() per non-empty bucket (≤32 calls/frame vs. 300-500)
      for (let bi = 0; bi < SEGMENT_BUCKET_COUNT; bi++) {
        const segs = segBuckets[bi]
        if (segs.length === 0) continue

        const isWide = bi >= OPACITY_LEVELS
        const opacIdx = isWide ? bi - OPACITY_LEVELS : bi
        const opacity = CONN_OPACITY_MIN + (opacIdx / (OPACITY_LEVELS - 1)) * CONN_OPACITY_RANGE

        ctx.lineWidth = isWide ? 0.96 : 0.72
        ctx.strokeStyle = `rgba(219, 234, 254, ${opacity.toFixed(4)})`
        ctx.beginPath()
        for (let i = 0; i < segs.length; i += 4) {
          ctx.moveTo(segs[i], segs[i + 1])
          ctx.lineTo(segs[i + 2], segs[i + 3])
        }
        ctx.stroke()
      }

      ctx.shadowBlur = 0
    }

    // FIX 1: Two-pass node drawing — shadowColor set once, shadowBlur=0 set once,
    // inner-dot fillStyle set once. Eliminates N redundant GPU state writes per frame.
    const drawNodes = () => {
      // Pass 1: outer glowing circles
      ctx.shadowColor = 'rgba(96, 165, 250, 0.92)'
      for (const node of nodes) {
        if (node.alpha <= 0.02) continue
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(239, 246, 255, ${node.alpha.toFixed(4)})`
        ctx.shadowBlur = node.glow
        ctx.fill()
      }

      // Pass 2: inner bright dots — shadow off, fillStyle constant
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
      for (const node of nodes) {
        if (node.alpha <= 0.02) continue
        ctx.beginPath()
        ctx.arc(node.x, node.y, Math.max(1, node.radius * 0.42), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const render = (now: number) => {
      animationFrameId = 0
      if (!shouldAnimate()) return

      if (lastFrameTime && now - lastFrameTime < frameMs) {
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
      frameMs = 1000 / (reducedMotion ? 24 : profile.targetFps)
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

    frameMs = 1000 / (reducedMotion ? 24 : profile.targetFps)

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
          contain: 'layout paint size',
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
