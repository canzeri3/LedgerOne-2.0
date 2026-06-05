'use client'

type IconName =
  | 'grid' | 'shield' | 'target' | 'clock' | 'layers' | 'chart'
  | 'arrowRight' | 'arrowUpRight' | 'book' | 'lock' | 'audit' | 'sliders'
  | 'bolt' | 'cpu' | 'routes' | 'flag' | 'eye' | 'mail' | 'phone'
  | 'globe' | 'minus' | 'plus' | 'check' | 'play' | 'record' | 'refresh'

const PATHS: Record<IconName, React.ReactNode> = {
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
  refresh: <><path d="M3 12a9 9 0 0 1 15-6l3 3" /><path d="M21 4v5h-5" /><path d="M21 12a9 9 0 0 1-15 6l-3-3" /><path d="M3 20v-5h5" /></>,
}

export function L1Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  )
}
