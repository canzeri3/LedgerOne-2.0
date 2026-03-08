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
      const targetCount = clamp(Math.round(area / 19000), 22, 42)
      const minEdge = Math.min(width, height)
      const baseSpeed = reducedMotion ? 0.018 : 0.055

      nodes = Array.from({ length: targetCount }, () => {
        const angle = Math.random() * Math.PI * 2
        const speed = baseSpeed * (0.45 + Math.random() * 0.9)

        return {
          x: BASE_PADDING + Math.random() * Math.max(1, width - BASE_PADDING * 2),
          y: BASE_PADDING + Math.random() * Math.max(1, height - BASE_PADDING * 2),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: minEdge < 420 ? 1.8 + Math.random() * 2.8 : 2.1 + Math.random() * 4.8,
          glow: 8 + Math.random() * 18,
          alpha: 0.48 + Math.random() * 0.5,
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
      const glow = ctx.createRadialGradient(
        width * 0.52,
        height * 0.48,
        0,
        width * 0.52,
        height * 0.48,
        Math.max(width, height) * 0.58
      )
      glow.addColorStop(0, 'rgba(96, 165, 250, 0.11)')
      glow.addColorStop(0.36, 'rgba(59, 130, 246, 0.06)')
      glow.addColorStop(0.75, 'rgba(15, 23, 42, 0.00)')

      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)
    }

    const drawConnections = () => {
      const distanceLimit = Math.min(BASE_LINK_DISTANCE, Math.max(100, width * 0.2))

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const distance = Math.hypot(dx, dy)

          if (distance > distanceLimit) continue

          const opacity = ((1 - distance / distanceLimit) ** 1.7) * 0.18
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `rgba(219, 234, 254, ${opacity.toFixed(4)})`
          ctx.lineWidth = distance < distanceLimit * 0.38 ? 1.1 : 0.8
          ctx.stroke()
        }
      }
    }

    const drawNodes = () => {
      for (const node of nodes) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(239, 246, 255, ${node.alpha.toFixed(4)})`
        ctx.shadowColor = 'rgba(96, 165, 250, 0.95)'
        ctx.shadowBlur = node.glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(node.x, node.y, Math.max(1, node.radius * 0.42), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
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

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-95 [mask-image:radial-gradient(circle_at_center,transparent_0%,black_18%,black_72%,transparent_100%)]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(96,165,250,0.10),transparent_42%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(2,6,23,0.44)_100%)]" />
    </div>
  )
}
