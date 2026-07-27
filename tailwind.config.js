// tailwind.config.ts
import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        // Make `font-sans` resolve to Inter first (from next/font via --font-inter)
        sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
        // App design-system fonts: `font-display` = Sora, `font-plex` = IBM Plex Sans
        display: ['var(--font-sora)', ...defaultTheme.fontFamily.sans],
        plex: ['var(--font-plex)', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}
export default config

