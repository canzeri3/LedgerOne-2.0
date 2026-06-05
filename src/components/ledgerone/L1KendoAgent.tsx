'use client'

export function L1KendoAgent({ caption = 'AGENT · LIVE · DISCIPLINED' }: { caption?: string }) {
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

        {/* Faint via grid */}
        <g opacity="0.16">
          {Array.from({ length: 6 }, (_, row) =>
            Array.from({ length: 9 }, (_, col) => (
              <circle key={`v-${row}-${col}`} cx={26 + col * 38} cy={32 + row * 70} r="0.8" fill="#9B8BFF" />
            ))
          )}
        </g>

        {/* Traces */}
        <g stroke="#9B8BFF" strokeOpacity="0.32" strokeWidth="0.9" fill="none" strokeLinejoin="miter">
          <path d="M 132 150 L 132 96 L 78 96 L 78 44" />
          <path d="M 154 150 L 154 74" />
          <path d="M 176 150 L 176 60 L 218 60 L 218 32" />
          <path d="M 198 150 L 198 108 L 262 108 L 262 72" />
          <path d="M 220 150 L 220 90 L 306 90 L 306 52" />
          <path d="M 132 290 L 132 344 L 70 344" />
          <path d="M 154 290 L 154 376" />
          <path d="M 176 290 L 176 362 L 232 362" />
          <path d="M 198 290 L 198 408" />
          <path d="M 220 290 L 220 352 L 296 352 L 296 392" />
          <path d="M 110 178 L 60 178 L 60 140" />
          <path d="M 110 200 L 36 200" />
          <path d="M 110 222 L 76 222 L 76 254" />
          <path d="M 110 244 L 50 244" />
          <path d="M 110 266 L 92 266 L 92 296" />
          <path d="M 250 178 L 312 178 L 312 138" />
          <path d="M 250 200 L 340 200" />
          <path d="M 250 222 L 294 222 L 294 260" />
          <path d="M 250 244 L 326 244" />
          <path d="M 250 266 L 280 266 L 280 300" />
        </g>

        {/* Junction dots */}
        <g fill="#9B8BFF" opacity="0.55">
          {[
            [132,96],[78,96],[176,60],[218,60],[198,108],[262,108],
            [220,90],[306,90],[132,344],[176,362],[220,352],[296,352],
            [60,178],[76,222],[76,254],[92,266],[92,296],
            [312,178],[294,222],[294,260],[280,266],[280,300],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="1.4" />
          ))}
        </g>

        {/* Glowing endpoints */}
        {[[78,44],[306,52],[340,200],[70,344],[296,392]].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="7" fill="#9B8BFF" opacity="0.18" filter="url(#pcb-glow)" />
            <circle cx={cx} cy={cy} r="2.4" fill="#9B8BFF" opacity="0.9" />
            <circle cx={cx} cy={cy} r="1" fill="#FFFFFF" />
          </g>
        ))}

        {/* Satellite chip left */}
        <g>
          <rect x="14" y="118" width="36" height="22" fill="url(#cpu-body)" stroke="#9B8BFF" strokeOpacity="0.45" strokeWidth="0.6" />
          {Array.from({ length: 5 }, (_, i) => (
            <line key={i} x1="14" y1={122 + i * 4} x2="10" y2={122 + i * 4} stroke="#9B8BFF" strokeOpacity="0.55" strokeWidth="0.7" />
          ))}
        </g>

        {/* Satellite chip bottom-right */}
        <g>
          <rect x="248" y="378" width="44" height="28" fill="url(#cpu-body)" stroke="#9B8BFF" strokeOpacity="0.45" strokeWidth="0.6" />
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={252 + i * 7} y1="406" x2={252 + i * 7} y2="410" stroke="#9B8BFF" strokeOpacity="0.55" strokeWidth="0.7" />
          ))}
          <text x="270" y="396" textAnchor="middle" style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: '5.5px', letterSpacing: '0.22em', fill: '#9B8BFF', fillOpacity: 0.5 }}>CTRL·02</text>
        </g>

        {/* Capacitors top */}
        {[[40,22,16,7],[232,22,14,7],[296,26,18,7]].map(([x,y,w,h], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill="#1A1B26" stroke="#9B8BFF" strokeOpacity="0.4" strokeWidth="0.5" />
            <rect x={x+1} y={y+1} width="2" height={h-2} fill="#9B8BFF" opacity="0.55" />
            <rect x={x+w-3} y={y+1} width="2" height={h-2} fill="#9B8BFF" opacity="0.3" />
          </g>
        ))}

        {/* Resistor right */}
        <g>
          <line x1="295" y1="142" x2="340" y2="142" stroke="#9B8BFF" strokeOpacity="0.35" strokeWidth="0.7" />
          <rect x="306" y="138" width="20" height="8" fill="#1A1B26" stroke="#9B8BFF" strokeOpacity="0.5" strokeWidth="0.5" />
          <line x1="310" y1="138" x2="310" y2="146" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.6" />
          <line x1="316" y1="138" x2="316" y2="146" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.6" />
          <line x1="322" y1="138" x2="322" y2="146" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.6" />
        </g>

        {/* CPU pin pads */}
        <g fill="#3A3550" stroke="#9B8BFF" strokeOpacity="0.5" strokeWidth="0.4">
          {Array.from({ length: 11 }, (_, i) => <rect key={`pt-${i}`} x={123 + i * 11.5} y="146" width="6" height="6" />)}
          {Array.from({ length: 11 }, (_, i) => <rect key={`pb-${i}`} x={123 + i * 11.5} y="288" width="6" height="6" />)}
          {Array.from({ length: 11 }, (_, i) => <rect key={`pl-${i}`} x="104" y={173 + i * 11.5} width="6" height="6" />)}
          {Array.from({ length: 11 }, (_, i) => <rect key={`pr-${i}`} x="250" y={173 + i * 11.5} width="6" height="6" />)}
        </g>

        {/* CPU package */}
        <rect x="118" y="158" width="124" height="124" fill="url(#cpu-body)" stroke="url(#pcb-rim)" strokeWidth="1.2" />
        <rect x="118" y="158" width="124" height="124" fill="none" stroke="#9B8BFF" strokeOpacity="0.35" strokeWidth="0.5" />
        <path d="M 118 168 L 128 158" stroke="#9B8BFF" strokeOpacity="0.7" strokeWidth="0.8" fill="none" />

        {/* CPU die */}
        <rect x="146" y="186" width="68" height="68" fill="#0A0B11" stroke="#5E54C0" strokeOpacity="0.7" strokeWidth="0.8" />
        <rect x="146" y="186" width="68" height="68" fill="url(#cpu-die)" />
        <g stroke="#9B8BFF" strokeOpacity="0.10" strokeWidth="0.4">
          {Array.from({ length: 5 }, (_, i) => <line key={`dgv-${i}`} x1={146+(i+1)*11.3} y1="186" x2={146+(i+1)*11.3} y2="254" />)}
          {Array.from({ length: 5 }, (_, i) => <line key={`dgh-${i}`} x1="146" y1={186+(i+1)*11.3} x2="214" y2={186+(i+1)*11.3} />)}
        </g>

        {/* L1 monogram */}
        <g transform="translate(180 220)">
          <path d="M -11 -11 L -11 9 L -1 9" stroke="#E6E0FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 4 -7 L 9 -11 L 9 9 M 2 9 L 16 9" stroke="#E6E0FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>

        <text x="180" y="274" textAnchor="middle" style={{ fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: '6px', letterSpacing: '0.28em', fill: '#9B8BFF', fillOpacity: 0.55 }}>L1·ENGINE·A4</text>

        {/* Corner fiducials */}
        {[[16,16],[344,16],[16,440],[344,440]].map(([cx,cy], i) => (
          <g key={i} stroke="#9B8BFF" strokeOpacity="0.4" strokeWidth="0.6" fill="none">
            <circle cx={cx} cy={cy} r="3" />
            <line x1={cx-5} y1={cy} x2={cx+5} y2={cy} />
            <line x1={cx} y1={cy-5} x2={cx} y2={cy+5} />
          </g>
        ))}
      </svg>
      <div className="l1-agent-platform" />
      <div className="l1-agent-caption">{caption}</div>
    </div>
  )
}
