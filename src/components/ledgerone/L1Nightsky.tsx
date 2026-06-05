'use client'

import { useEffect, useRef } from 'react'

export function L1Nightsky() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const seed = (n: number) => {
      const x = Math.sin(n * 9301 + 49297) * 233280
      return x - Math.floor(x)
    }

    const isMobile = w <= 600
    const CLUSTERS = isMobile ? 5 : 16
    const SCATTERED = isMobile ? 15 : 70
    const nodes: {
      x: number; y: number; rad: number; vx: number; vy: number
      tw: number; tws: number; clustered: boolean
    }[] = []
    let nid = 0

    for (let c = 0; c < CLUSTERS; c++) {
      const cx = (0.1 + seed(c + 11) * 0.8) * w
      const cy = (0.08 + seed(c + 23) * 0.84) * h
      const count = 9 + Math.floor(seed(c + 41) * 8)
      const radius = 70 + seed(c + 67) * 70
      for (let i = 0; i < count; i++) {
        const u = seed(nid * 3 + 101), v = seed(nid * 3 + 233)
        const r = Math.sqrt(u) * radius, a = v * Math.PI * 2
        nodes.push({
          x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
          rad: 0.7 + seed(nid + 401) * 0.9,
          vx: (seed(nid + 503) - 0.5) * 0.16,
          vy: (seed(nid + 607) - 0.5) * 0.16,
          tw: seed(nid + 709) * Math.PI * 2,
          tws: 0.3 + seed(nid + 811) * 0.6,
          clustered: true,
        })
        nid++
      }
    }
    for (let i = 0; i < SCATTERED; i++) {
      nodes.push({
        x: seed(nid + 901) * w, y: seed(nid + 1009) * h,
        rad: 0.5 + seed(nid + 1103) * 0.7,
        vx: (seed(nid + 1217) - 0.5) * 0.14,
        vy: (seed(nid + 1303) - 0.5) * 0.14,
        tw: seed(nid + 1409) * Math.PI * 2,
        tws: 0.3 + seed(nid + 1511) * 0.6,
        clustered: false,
      })
      nid++
    }

    const LINK_DIST = 95, CELL = LINK_DIST
    let raf = 0, last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(64, now - last); last = now
      ctx.clearRect(0, 0, w, h)

      for (const p of nodes) {
        p.x += p.vx * dt * 0.05; p.y += p.vy * dt * 0.05
        p.tw += dt * 0.001 * p.tws
        if (p.x < -30) p.x = w + 30; if (p.x > w + 30) p.x = -30
        if (p.y < -30) p.y = h + 30; if (p.y > h + 30) p.y = -30
      }

      const cols = Math.max(1, Math.ceil(w / CELL))
      const rows = Math.max(1, Math.ceil(h / CELL))
      const grid: number[][] | null[] = new Array(cols * rows).fill(null)

      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i]
        const cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / CELL)))
        const cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / CELL)))
        const k = cy * cols + cx
        if (!grid[k]) grid[k] = []
        ;(grid[k] as number[]).push(i)
      }

      ctx.lineWidth = 0.5
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const bucket = grid[cy * cols + cx] as number[] | null
          if (!bucket) continue
          for (let dy = 0; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx < 0) continue
              const nx = cx + dx, ny = cy + dy
              if (nx < 0 || nx >= cols || ny >= rows) continue
              const other = grid[ny * cols + nx] as number[] | null
              if (!other) continue
              for (let ii = 0; ii < bucket.length; ii++) {
                const a = nodes[bucket[ii]]
                const startJ = bucket === other ? ii + 1 : 0
                for (let jj = startJ; jj < other.length; jj++) {
                  const b = nodes[other[jj]]
                  const ddx = a.x - b.x, ddy = a.y - b.y
                  const d2 = ddx * ddx + ddy * ddy
                  if (d2 < LINK_DIST * LINK_DIST) {
                    const d = Math.sqrt(d2)
                    const o = (1 - d / LINK_DIST) * 0.28
                    ctx.strokeStyle = `rgba(210, 220, 245, ${o})`
                    ctx.beginPath()
                    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
                    ctx.stroke()
                  }
                }
              }
            }
          }
        }
      }

      for (const p of nodes) {
        const tw = 0.55 + 0.45 * Math.sin(p.tw)
        if (p.clustered && p.rad > 1.2) {
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rad * 5)
          grd.addColorStop(0, `rgba(220, 228, 250, ${0.30 * tw})`)
          grd.addColorStop(1, 'rgba(220, 228, 250, 0)')
          ctx.fillStyle = grd
          ctx.beginPath(); ctx.arc(p.x, p.y, p.rad * 5, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = `rgba(230, 234, 250, ${0.85 * tw})`
        ctx.beginPath(); ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2); ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
