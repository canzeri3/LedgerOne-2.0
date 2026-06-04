/* =============================================================
   LedgerOne · Shared chrome
   Nav, Footer, Nightsky (animated plexus), KendoAgent (liquid-
   metal samurai motif), Grain, Icons.
   Exposed on window for use across multi-page React entries.
   ============================================================= */
const { useState, useEffect, useRef, useMemo } = React;

/* -------- Icon set (Lucide-derived, currentColor) ---------- */
const L1Icon = ({ name, size = 22 }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    shield: <path d="M12 2 4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6l-8-4z" />,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 6-6" /></>,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
    book: <><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M4 16h16" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    audit: <><path d="M9 3h12v18H9z" /><path d="M3 7h6M3 12h6M3 17h6" /></>,
    sliders: <><path d="M4 21V14M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" /></>,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
    cpu: <><rect x="5" y="5" width="14" height="14" rx="1" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></>,
    routes: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M9 6h6a3 3 0 0 1 3 3v6" /></>,
    flag: <><path d="M4 21V4l8 2 8-2v10l-8 2-8-2" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    phone: <path d="M3 5c0 9 7 16 16 16l2-4-5-2-2 2c-2-1-4-3-5-5l2-2-2-5-4 0z" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 5 5 9-11" />,
    play: <path d="M6 4 20 12 6 20z" />,
    record: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6l3 3" /><path d="M21 4v5h-5" /><path d="M21 12a9 9 0 0 1-15 6l-3-3" /><path d="M3 20v-5h5" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || null}
    </svg>);

};

/* -------- Site grain (3-4% noise overlay) ---------- */
const L1Grain = () => <div className="l1-grain" aria-hidden="true" />;

/* -------- Animated plexus night sky ---------- */
function L1Nightsky() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0,h = 0;
    const resize = () => {
      w = window.innerWidth;h = window.innerHeight;
      canvas.width = Math.round(w * dpr);canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const seed = (n) => {let x = Math.sin(n * 9301 + 49297) * 233280;return x - Math.floor(x);};
    const CLUSTERS = 16;
    const nodes = [];
    let nid = 0;
    for (let c = 0; c < CLUSTERS; c++) {
      const cx = (0.1 + seed(c + 11) * 0.8) * w;
      const cy = (0.08 + seed(c + 23) * 0.84) * h;
      const count = 9 + Math.floor(seed(c + 41) * 8);
      const radius = 70 + seed(c + 67) * 70;
      for (let i = 0; i < count; i++) {
        const u = seed(nid * 3 + 101),v = seed(nid * 3 + 233);
        const r = Math.sqrt(u) * radius,a = v * Math.PI * 2;
        nodes.push({
          x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
          rad: 0.7 + seed(nid + 401) * 0.9,
          vx: (seed(nid + 503) - 0.5) * 0.16,
          vy: (seed(nid + 607) - 0.5) * 0.16,
          tw: seed(nid + 709) * Math.PI * 2,
          tws: 0.3 + seed(nid + 811) * 0.6,
          clustered: true
        });
        nid++;
      }
    }
    for (let i = 0; i < 70; i++) {
      nodes.push({
        x: seed(nid + 901) * w, y: seed(nid + 1009) * h,
        rad: 0.5 + seed(nid + 1103) * 0.7,
        vx: (seed(nid + 1217) - 0.5) * 0.14,
        vy: (seed(nid + 1303) - 0.5) * 0.14,
        tw: seed(nid + 1409) * Math.PI * 2,
        tws: 0.3 + seed(nid + 1511) * 0.6,
        clustered: false
      });
      nid++;
    }
    const LINK_DIST = 95,CELL = LINK_DIST;
    let raf = 0,last = performance.now();
    const tick = (now) => {
      const dt = Math.min(64, now - last);last = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of nodes) {
        p.x += p.vx * dt * 0.05;p.y += p.vy * dt * 0.05;
        p.tw += dt * 0.001 * p.tws;
        if (p.x < -30) p.x = w + 30;if (p.x > w + 30) p.x = -30;
        if (p.y < -30) p.y = h + 30;if (p.y > h + 30) p.y = -30;
      }
      const cols = Math.max(1, Math.ceil(w / CELL));
      const rows = Math.max(1, Math.ceil(h / CELL));
      const grid = new Array(cols * rows);
      for (let i = 0; i < grid.length; i++) grid[i] = null;
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        const cx = Math.max(0, Math.min(cols - 1, Math.floor(p.x / CELL)));
        const cy = Math.max(0, Math.min(rows - 1, Math.floor(p.y / CELL)));
        const k = cy * cols + cx;
        if (!grid[k]) grid[k] = [];
        grid[k].push(i);
      }
      ctx.lineWidth = 0.5;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const bucket = grid[cy * cols + cx];
          if (!bucket) continue;
          for (let dy = 0; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx < 0) continue;
              const nx = cx + dx,ny = cy + dy;
              if (nx < 0 || nx >= cols || ny >= rows) continue;
              const other = grid[ny * cols + nx];
              if (!other) continue;
              for (let ii = 0; ii < bucket.length; ii++) {
                const a = nodes[bucket[ii]];
                const startJ = bucket === other ? ii + 1 : 0;
                for (let jj = startJ; jj < other.length; jj++) {
                  const b = nodes[other[jj]];
                  const ddx = a.x - b.x,ddy = a.y - b.y;
                  const d2 = ddx * ddx + ddy * ddy;
                  if (d2 < LINK_DIST * LINK_DIST) {
                    const d = Math.sqrt(d2);
                    const o = (1 - d / LINK_DIST) * 0.28;
                    ctx.strokeStyle = `rgba(210, 220, 245, ${o})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                  }
                }
              }
            }
          }
        }
      }
      for (const p of nodes) {
        const tw = 0.55 + 0.45 * Math.sin(p.tw);
        if (p.clustered && p.rad > 1.2) {
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.rad * 5);
          grd.addColorStop(0, `rgba(220, 228, 250, ${0.30 * tw})`);
          grd.addColorStop(1, 'rgba(220, 228, 250, 0)');
          ctx.fillStyle = grd;
          ctx.beginPath();ctx.arc(p.x, p.y, p.rad * 5, 0, Math.PI * 2);ctx.fill();
        }
        ctx.fillStyle = `rgba(230, 234, 250, ${0.85 * tw})`;
        ctx.beginPath();ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {cancelAnimationFrame(raf);window.removeEventListener('resize', resize);};
  }, []);
  return <canvas ref={canvasRef} className="l1-nightsky" aria-hidden="true" />;
}

/* -------- Agent CPU — institutional motherboard motif ------------
   A restrained PCB scene: dark substrate, clean orthogonal traces in
   muted purple, a central CPU package with pin array and L1 monogram
   on the die, a few satellite components, sparse glowing endpoints,
   and a DIMM-style bank as the base. Calm, technical, never neon.
   ---------------------------------------------------------------- */
function L1KendoAgent({ caption = "AGENT · LIVE · DISCIPLINED" }) {
  return (
    <div className="l1-agent" aria-hidden="true">
      <div className="l1-agent-halo" />
      <svg viewBox="0 0 360 560" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pcb-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0E0F18" />
            <stop offset="50%" stopColor="#0A0B11" />
            <stop offset="100%" stopColor="#0E0F18" />
          </linearGradient>
          <radialGradient id="cpu-body" cx="0.5" cy="0.4" r="0.7">
            <stop offset="0%" stopColor="#3A3550" />
            <stop offset="55%" stopColor="#1F2030" />
            <stop offset="100%" stopColor="#0A0B11" />
          </radialGradient>
          <radialGradient id="cpu-die" cx="0.5" cy="0.5" r="0.7">
            <stop offset="0%" stopColor="#9B8BFF" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#5E54C0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0D0E14" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pcb-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E6E0FF" />
            <stop offset="50%" stopColor="#A89DD8" />
            <stop offset="100%" stopColor="#3A3550" />
          </linearGradient>
          <filter id="pcb-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Substrate removed — floats on page background */}

        {/* Faint via grid */}
        <g opacity="0.16">
          {Array.from({ length: 6 }, (_, row) =>
          Array.from({ length: 9 }, (_, col) =>
          <circle key={`v-${row}-${col}`}
          cx={26 + col * 38} cy={32 + row * 70}
          r="0.8" fill="#9B8BFF" />
          )
          )}
        </g>

        {/* Traces — clean orthogonal routing, muted purple */}
        <g stroke="#9B8BFF" strokeOpacity="0.32" strokeWidth="0.9" fill="none" strokeLinejoin="miter">
          {/* TOP fan-out */}
          <path d="M 132 150 L 132 96 L 78 96 L 78 44" />
          <path d="M 154 150 L 154 74" />
          <path d="M 176 150 L 176 60 L 218 60 L 218 32" />
          <path d="M 198 150 L 198 108 L 262 108 L 262 72" />
          <path d="M 220 150 L 220 90 L 306 90 L 306 52" />

          {/* BOTTOM fan-out */}
          <path d="M 132 290 L 132 344 L 70 344" />
          <path d="M 154 290 L 154 376" />
          <path d="M 176 290 L 176 362 L 232 362" />
          <path d="M 198 290 L 198 408" />
          <path d="M 220 290 L 220 352 L 296 352 L 296 392" />

          {/* LEFT fan-out */}
          <path d="M 110 178 L 60 178 L 60 140" />
          <path d="M 110 200 L 36 200" />
          <path d="M 110 222 L 76 222 L 76 254" />
          <path d="M 110 244 L 50 244" />
          <path d="M 110 266 L 92 266 L 92 296" />

          {/* RIGHT fan-out */}
          <path d="M 250 178 L 312 178 L 312 138" />
          <path d="M 250 200 L 340 200" />
          <path d="M 250 222 L 294 222 L 294 260" />
          <path d="M 250 244 L 326 244" />
          <path d="M 250 266 L 280 266 L 280 300" />
        </g>

        {/* Junction dots at corners */}
        <g fill="#9B8BFF" opacity="0.55">
          {[
          [132, 96], [78, 96], [176, 60], [218, 60], [198, 108], [262, 108],
          [220, 90], [306, 90], [132, 344], [176, 362], [220, 352], [296, 352],
          [60, 178], [76, 222], [76, 254], [92, 266], [92, 296],
          [312, 178], [294, 222], [294, 260], [280, 266], [280, 300]].
          map(([cx, cy], i) =>
          <circle key={i} cx={cx} cy={cy} r="1.4" />
          )}
        </g>

        {/* Sparse glowing endpoints — restrained */}
        {[[78, 44], [306, 52], [340, 200], [70, 344], [296, 392]].map(([cx, cy], i) =>
        <g key={i}>
            <circle cx={cx} cy={cy} r="7" fill="#9B8BFF" opacity="0.18" filter="url(#pcb-glow)" />
            <circle cx={cx} cy={cy} r="2.4" fill="#9B8BFF" opacity="0.9" />
            <circle cx={cx} cy={cy} r="1" fill="#FFFFFF" />
          </g>
        )}

        {/* Satellite chip — left */}
        <g>
          <rect x="14" y="118" width="36" height="22" fill="url(#cpu-body)" stroke="#9B8BFF" strokeOpacity="0.45" strokeWidth="0.6" />
          {Array.from({ length: 5 }, (_, i) =>
          <line key={`scl-${i}`} x1="14" y1={122 + i * 4} x2="10" y2={122 + i * 4} stroke="#9B8BFF" strokeOpacity="0.55" strokeWidth="0.7" />
          )}
        </g>
        {/* Satellite chip — bottom-right */}
        <g>
          <rect x="248" y="378" width="44" height="28" fill="url(#cpu-body)" stroke="#9B8BFF" strokeOpacity="0.45" strokeWidth="0.6" />
          {Array.from({ length: 6 }, (_, i) =>
          <line key={`scbr-${i}`} x1={252 + i * 7} y1="406" x2={252 + i * 7} y2="410" stroke="#9B8BFF" strokeOpacity="0.55" strokeWidth="0.7" />
          )}
          <text x="270" y="396" textAnchor="middle"
          style={{
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
            fontSize: '5.5px',
            letterSpacing: '0.22em',
            fill: '#9B8BFF',
            fillOpacity: 0.5
          }}>
            CTRL·02
          </text>
        </g>

        {/* Capacitors — top edge */}
        {[[40, 22, 16, 7], [232, 22, 14, 7], [296, 26, 18, 7]].map(([x, y, w, h], i) =>
        <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill="#1A1B26" stroke="#9B8BFF" strokeOpacity="0.4" strokeWidth="0.5" />
            <rect x={x + 1} y={y + 1} width="2" height={h - 2} fill="#9B8BFF" opacity="0.55" />
            <rect x={x + w - 3} y={y + 1} width="2" height={h - 2} fill="#9B8BFF" opacity="0.3" />
          </g>
        )}

        {/* Resistor — right side */}
        <g>
          <line x1="295" y1="142" x2="340" y2="142" stroke="#9B8BFF" strokeOpacity="0.35" strokeWidth="0.7" />
          <rect x="306" y="138" width="20" height="8" fill="#1A1B26" stroke="#9B8BFF" strokeOpacity="0.5" strokeWidth="0.5" />
          <line x1="310" y1="138" x2="310" y2="146" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.6" />
          <line x1="316" y1="138" x2="316" y2="146" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.6" />
          <line x1="322" y1="138" x2="322" y2="146" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.6" />
        </g>

        {/* CPU pin pads — top, bottom, left, right */}
        <g fill="#3A3550" stroke="#9B8BFF" strokeOpacity="0.5" strokeWidth="0.4">
          {Array.from({ length: 11 }, (_, i) =>
          <rect key={`pt-${i}`} x={123 + i * 11.5} y="146" width="6" height="6" />
          )}
          {Array.from({ length: 11 }, (_, i) =>
          <rect key={`pb-${i}`} x={123 + i * 11.5} y="288" width="6" height="6" />
          )}
          {Array.from({ length: 11 }, (_, i) =>
          <rect key={`pl-${i}`} x="104" y={173 + i * 11.5} width="6" height="6" />
          )}
          {Array.from({ length: 11 }, (_, i) =>
          <rect key={`pr-${i}`} x="250" y={173 + i * 11.5} width="6" height="6" />
          )}
        </g>

        {/* CPU package body */}
        <rect x="118" y="158" width="124" height="124" fill="url(#cpu-body)" stroke="url(#pcb-rim)" strokeWidth="1.2" />
        <rect x="118" y="158" width="124" height="124" fill="none" stroke="#9B8BFF" strokeOpacity="0.35" strokeWidth="0.5" />
        {/* Corner notch (pin-1 indicator) */}
        <path d="M 118 168 L 128 158" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.8" fill="none" />

        {/* CPU die — inner */}
        <rect x="146" y="186" width="68" height="68" fill="#0A0B11" stroke="#5E54C0" strokeOpacity="0.7" strokeWidth="0.8" />
        <rect x="146" y="186" width="68" height="68" fill="url(#cpu-die)" />

        {/* Die internal grid */}
        <g stroke="#9B8BFF" strokeOpacity="0.10" strokeWidth="0.4">
          {Array.from({ length: 5 }, (_, i) =>
          <line key={`dgv-${i}`} x1={146 + (i + 1) * 11.3} y1="186" x2={146 + (i + 1) * 11.3} y2="254" />
          )}
          {Array.from({ length: 5 }, (_, i) =>
          <line key={`dgh-${i}`} x1="146" y1={186 + (i + 1) * 11.3} x2="214" y2={186 + (i + 1) * 11.3} />
          )}
        </g>

        {/* L1 monogram on the die */}
        <g transform="translate(180 220)">
          <path d="M -11 -11 L -11 9 L -1 9" stroke="#E6E0FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 4 -7 L 9 -11 L 9 9 M 2 9 L 16 9" stroke="#E6E0FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>

        {/* CPU etched marking */}
        <text x="180" y="274" textAnchor="middle"
        style={{
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
          fontSize: '6px',
          letterSpacing: '0.28em',
          fill: '#9B8BFF',
          fillOpacity: 0.55
        }}>
          L1·ENGINE·A4
        </text>

        {/* Corner fiducials */}
        {[[16, 16], [344, 16], [16, 440], [344, 440]].map(([cx, cy], i) =>
        <g key={i} stroke="#9B8BFF" strokeOpacity="0.4" strokeWidth="0.6" fill="none">
            <circle cx={cx} cy={cy} r="3" />
            <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} />
            <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5} />
          </g>
        )}

        {/* DIMM bank removed per request */}
      </svg>

      <div className="l1-agent-platform" />
      <div className="l1-agent-caption">{caption}</div>
    </div>);

}

/* -------- Top Nav (multi-page) ---------- */
function L1Nav({ active = 'home' }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const links = [
  { id: 'home', label: 'Home', href: 'index.html' },
  { id: 'platform', label: 'Platform', href: 'platform.html' },
  { id: 'cases', label: 'Use cases', href: 'use-cases.html' },
  { id: 'contact', label: 'Contact', href: 'contact.html' }];

  return (
    <nav className={'l1-nav ' + (scrolled ? 'scrolled' : '')}>
      <div className="l1-wrap l1-nav-inner" style={{ maxWidth: "none", padding: "0 24px" }}>
        <a href="index.html" className="l1-nav-brand" aria-label="LedgerOne home">
          <img src="assets/ledgerone-logo.png" alt="LedgerOne" style={{ objectFit: "contain", height: "110px", width: "auto", display: "block" }} />
        </a>
        <div className="l1-nav-links">
          {links.map((l) =>
          <a key={l.id} href={l.href} className={'l1-nav-link ' + (l.id === active ? 'active' : '')} style={{ fontSize: "17px" }}>
              {l.label}
            </a>
          )}
        </div>
        <div className="l1-nav-cta">
          <a href="contact.html" className="l1-nav-signin">
            Sign In
            <L1Icon name="arrowUpRight" size={13} />
          </a>
        </div>
      </div>
    </nav>);

}

/* -------- Footer ---------- */
function L1Footer() {
  const cols = [
  { h: "Platform", links: ["Allocation engine", "Risk framework", "Rules engine", "Allocation agent", "Reporting", "API"] },
  { h: "Use cases", links: ["Long-term allocator", "Active investor", "Family office · advisor", "New allocator"] },
  { h: "Company", links: ["About", "Careers", "Press", "Contact"] },
  { h: "Trust", links: ["Security", "Institutional architecture", "Audits", "Disclosures", "Status"] }];

  return (
    <footer className="l1-footer">
      <div className="l1-wrap">
        <div className="l1-footer-grid">
          <div className="l1-footer-brand">
            <img src="assets/ledgerone-logo.png" alt="LedgerOne" style={{ height: "80px", width: "auto", objectFit: "contain", display: "block", margin: "64px 0 16px" }} />
          </div>
          {cols.map((c, i) =>
          <div key={i} className="l1-footer-col">
              <h5>{c.h}</h5>
              {c.links.map((l, j) => <a key={j}>{l}</a>)}
            </div>
          )}
        </div>
        <p style={{ margin: '40px 0 0', textAlign: 'center', letterSpacing: '0.5px', fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: 13 }}>Where volatility becomes strategy.</p>
        <div className="l1-footer-fine">
          <span>© 2026 LedgerOne. Planning & tracking tool — It does not provide investment advice.</span>
          <span>NYC · SG · Operations 24/7</span>
        </div>
      </div>
    </footer>);

}

/* -------- Shared "Closing CTA" block ---------- */
function L1ClosingCTA({ title = "Stop reacting. Start compounding.", body = "Define your risk profile and capital. The engine handles deployment, realization, and compounding across cycles — without intervention.", primary = "Request access", secondary = "Talk to our Team" }) {
  return (
    <section className="l1-wrap" data-screen-label="Closing CTA">
      <div className="l1-close">
        <span className="l1-tag">Get started</span>
        <h2 style={{ marginTop: 18 }}>{title}</h2>
        <p>{body}</p>
        <div className="l1-close-cta">
          <a href={primary && primary.toLowerCase() === "request access" ? "pricing.html" : "contact.html"} className="l1-btn l1-btn-primary l1-btn-lg" style={{ borderStyle: "solid" }}>{primary}</a>
          <a href={secondary && secondary.toLowerCase() === "request access" ? "pricing.html" : "contact.html"} className="l1-btn l1-btn-ghost l1-btn-lg">{secondary}</a>
        </div>
      </div>
    </section>);

}

/* -------- Liquid-metal divider (thin chrome ribbon) ---------- */
const L1Chrome = () => <div className="l1-wrap"><div className="l1-chrome" /></div>;

/* -------- Logo strip (shared) ---------- */
function L1LogoStrip({ label = "" }) {
  return (
    <div className="l1-strip" style={{ height: "17px" }}>
      <div className="l1-wrap l1-strip-row" style={{ width: "1080px" }}>
        <div className="l1-strip-label">{label}</div>
        <div className="l1-strip-marks">
          <span style={{ width: "162px" }}>Any Portfolio Size</span>
          <span style={{ width: "226px" }}>Long -Term Investments </span>
          <span style={{ width: "111px" }}>Rule Based </span>
          <span>Dicipline</span>
          <span style={{ width: "203px" }}>Risk Managemnt</span>
        </div>
      </div>
    </div>);

}

/* -------- Section head ---------- */
function L1SectionHead({ eyebrow, title, body, align = 'left' }) {
  return (
    <div className="l1-section-head" style={align === 'center' ? { textAlign: 'center', margin: '0 auto 56px', maxWidth: 720 } : undefined}>
      {eyebrow && <span className="l1-section-eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {body && <p style={align === 'center' ? { margin: '16px auto 0' } : undefined}>{body}</p>}
    </div>);

}

Object.assign(window, {
  L1Icon, L1Grain, L1Nightsky, L1KendoAgent,
  L1Nav, L1Footer, L1ClosingCTA, L1Chrome, L1LogoStrip, L1SectionHead
});