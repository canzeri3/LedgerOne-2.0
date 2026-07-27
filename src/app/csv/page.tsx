import { Sora, DM_Sans, JetBrains_Mono } from 'next/font/google'
import CSVClient from './CSVClient'
import '../settings/settings-skin.css'
import './csv-skin.css'

const sora = Sora({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--st-sora', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--st-dmsans', display: 'swap' })
const jbMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--st-jbmono', display: 'swap' })

export default function CSVPage() {
  return (
    <div className={`st ${sora.variable} ${dmSans.variable} ${jbMono.variable}`}>
      <div className="mx-auto w-full max-w-[920px]">
        <CSVClient />
      </div>
    </div>
  )
}
