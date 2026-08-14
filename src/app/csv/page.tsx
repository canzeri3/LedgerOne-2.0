import CSVClient from './CSVClient'
import '../settings/settings-skin.css'
import './csv-skin.css'

export default function CSVPage() {
  return (
    <div className="st">
      <div className="mx-auto w-full max-w-[920px]">
        <CSVClient />
      </div>
    </div>
  )
}
