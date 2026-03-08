'use client'

import { useEffect, useRef } from 'react'

type ParticleNetworkBackgroundProps = {
  className?: string
}

type NodePoint = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  glow: number
  alpha: number
}

const MAX_DPR = 2
const BASE_LINK_DISTANCE = 140
const BASE_PADDING = 18

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function fieldStrengthAt(x: number, y: number, width: number, height: number) {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)

  const nx = x / safeWidth
  const ny = y / safeHeight

  const rightBias = 0.58 + Math.pow(nx, 1.08) * 0.42
  const centerBias = Math.exp(-Math.pow((nx - 0.58) / 0.28, 2))
  const headerBand = Math.exp(-Math.pow((ny - 0.16) / 0.18, 2))
  const heroBand = Math.exp(-Math.pow((ny - 0.48) / 0.26, 2))
  const lowerBand = Math.exp(-Math.pow((ny - 0.78) / 0.28, 2))

  return clamp(
    rightBias * 0.42 + centerBias * 0.22 + headerBand * 0.2 + heroBand * 0.12 + lowerBand * 0.04,
    0,
    1
  )
}

function sampleNodePosition(width: number, height: number) {
  const usableWidth = Math.max(1, width - BASE_PADDING * 2)
  const usableHeight = Math.max(1, height - BASE_PADDING * 2)

  let bestX = BASE_PADDING + usableWidth * 0.58
  let bestY = BASE_PADDING + usableHeight * 0.28
  let bestScore = -1

  for (let i = 0; i < 7; i += 1) {
    const xSeed = Math.random()
    const xBias = clamp(0.08 + (1 - Math.pow(xSeed, 2.1)) * 0.92, 0, 1)

    let yBias = 0.18 + Math.random() * 0.64

    const bandRoll = Math.random()
    if (bandRoll < 0.34) {
      yBias = 0.05 + Math.random() * 0.22
    } else if (bandRoll < 0.74) {
      yBias = 0.24 + Math.random() * 0.34
    } else {
      yBias = 0.5 + Math.random() * 0.42
    }

    const x = BASE_PADDING + xBias * usableWidth
    const y = BASE_PADDING + yBias * usableHeight
    const strength = fieldStrengthAt(x, y, width, height)
    const score = strength + Math.random() * 0.14

    if (score > bestScore) {
      bestScore = score
      bestX = x
      bestY = y
    }
  }

  return {
    x: bestX,
    y: bestY,
    strength: fieldStrengthAt(bestX, bestY, width, height),
  }
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
      const area = width * height
      const targetCount = clamp(Math.round(area / 14200), 34, 62)
      const minEdge = Math.min(width, height)
      const baseSpeed = reducedMotion ? 0.018 : 0.055

      nodes = Array.from({ length: targetCount }, () => {
        const angle = Math.random() * Math.PI * 2
        const speed = baseSpeed * (0.45 + Math.random() * 0.9)
        const sampled = sampleNodePosition(width, height)
        const strength = sampled.strength

        return {
          x: sampled.x,
          y: sampled.y,
          vx: Math.cos(angle) * speed + (0.004 + Math.random() * 0.008) * (0.35 + strength * 0.65),
          vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 0.01,
          radius:
            minEdge < 420
              ? 1.2 + Math.random() * 1.9 + strength * 0.45
              : 1.45 + Math.random() * 3.0 + strength * 0.72,
          glow: 6 + Math.random() * 13 + strength * 5.5,
          alpha: 0.16 + Math.random() * 0.2 + strength * 0.28,
        }
      })
    }

    const updateNodes = () => {
      const padding = BASE_PADDING

      for (const node of nodes) {
        node.x += node.vx
        node.y += node.vy

        if (node.x <= padding || node.x >= width - padding) {
          node.vx *= -1
          node.x = clamp(node.x, padding, width - padding)
        }

        if (node.y <= padding || node.y >= height - padding) {
          node.vy *= -1
          node.y = clamp(node.y, padding, height - padding)
        }
      }
    }

const drawBackdrop = () => {
  const topGlow = ctx.createRadialGradient(
    width * 0.56,
    height * 0.16,
    0,
    width * 0.56,
    height * 0.16,
    Math.max(width, height) * 0.62
  )
  topGlow.addColorStop(0, 'rgba(37, 99, 235, 0.08)')
  topGlow.addColorStop(0.28, 'rgba(49, 46, 129, 0.08)')
  topGlow.addColorStop(0.6, 'rgba(15, 23, 42, 0.05)')
  topGlow.addColorStop(0.84, 'rgba(2, 6, 23, 0.00)')

  ctx.fillStyle = topGlow
  ctx.fillRect(0, 0, width, height)

  const heroGlow = ctx.createRadialGradient(
    width * 0.62,
    height * 0.5,
    0,
    width * 0.62,
    height * 0.5,
    Math.max(width, height) * 0.64
  )
  heroGlow.addColorStop(0, 'rgba(30, 64, 175, 0.07)')
  heroGlow.addColorStop(0.36, 'rgba(30, 41, 59, 0.06)')
  heroGlow.addColorStop(0.76, 'rgba(2, 6, 23, 0.00)')

  ctx.fillStyle = heroGlow
  ctx.fillRect(0, 0, width, height)
}

    const drawConnections = () => {
      const distanceLimit = Math.min(BASE_LINK_DISTANCE + 28, Math.max(118, width * 0.235))

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const distance = Math.hypot(dx, dy)

          if (distance > distanceLimit) continue

          const linkStrength = 1 - distance / distanceLimit
          const fieldStrength =
            (fieldStrengthAt(a.x, a.y, width, height) + fieldStrengthAt(b.x, b.y, width, height)) / 2

          const opacity = (0.02 + linkStrength ** 1.45 * 0.19) * (0.34 + fieldStrength * 0.78)

          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(219, 234, 254, ${opacity.toFixed(4)})`
          ctx.lineWidth = distance < distanceLimit * 0.38 ? 1.08 : 0.82
          ctx.shadowColor = 'rgba(96, 165, 250, 0.2)'
          ctx.shadowBlur = 3 + fieldStrength * 2
          ctx.stroke()
          ctx.shadowBlur = 0
        }
      }
    }

    const drawNodes = () => {
      for (const node of nodes) {
        const strength = fieldStrengthAt(node.x, node.y, width, height)
        const alpha = node.alpha * (0.38 + strength * 0.78)

        if (alpha <= 0.02) continue

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(239, 246, 255, ${alpha.toFixed(4)})`
        ctx.shadowColor = 'rgba(96, 165, 250, 0.95)'
        ctx.shadowBlur = node.glow * (0.58 + strength * 0.52)
        ctx.fill()

        ctx.beginPath()
        ctx.arc(node.x, node.y, Math.max(1, node.radius * 0.42), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.52 + strength * 0.34).toFixed(4)})`
        ctx.shadowBlur = 0
        ctx.fill()
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      drawBackdrop()
      drawConnections()
      drawNodes()
      updateNodes()
      animationFrameId = window.requestAnimationFrame(render)
    }

    const resetScene = () => {
      setCanvasSize()
      createNodes()
    }

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches
      createNodes()
    }

    resetScene()
    render()

    const resizeObserver = new ResizeObserver(() => {
      resetScene()
    })

    resizeObserver.observe(canvas)
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange)
    }
  }, [])

  const maskImage =
    'linear-gradient(to_bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,1) 12%, rgba(0,0,0,1) 86%, rgba(0,0,0,0.88) 94%, rgba(0,0,0,0) 100%)'

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_56%_14%,rgba(49,46,129,0.10),transparent_34%)]" />
<div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_48%,rgba(30,64,175,0.07),transparent_42%)]" />
<div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.05)_18%,rgba(2,6,23,0.08)_72%,rgba(2,6,23,0.52)_100%)]" />
<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(2,6,23,0.52)_100%)]" />    </div>
  )
}