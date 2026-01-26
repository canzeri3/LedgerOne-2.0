'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useAmountVisibility } from '@/lib/amountVisibility'

export default function AmountVisibilityToggle() {
  const { hidden, toggle } = useAmountVisibility()

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-lg border border-[#0b1830] bg-[#081427] px-2.5 py-2 text-slate-200 hover:bg-[#0a162c]"
      title={hidden ? 'Show amounts' : 'Hide amounts'}
      aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )
}

