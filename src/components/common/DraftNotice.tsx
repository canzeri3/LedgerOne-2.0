'use client'

type Props = {
  draft: { dirty: boolean; restored: boolean; warning: string | null }
  onDiscard: () => void
  disabled?: boolean
}

export default function DraftNotice({ draft, onDiscard, disabled }: Props) {
  if (!draft.dirty && !draft.warning) return null
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] leading-5 text-slate-400">
      <p role={draft.warning ? 'alert' : 'status'} className="min-w-0 flex-1">
        {draft.warning ?? (draft.restored ? 'Unsaved draft restored. Review before saving.' : 'Draft kept in this tab for 24 hours. Nothing submitted.')}
      </p>
      {draft.dirty ? <button type="button" disabled={disabled} onClick={onDiscard}
        className="min-h-11 shrink-0 rounded-md px-2 font-medium text-[rgb(137,128,213)] hover:text-slate-200 focus-visible:outline focus-visible:outline-2 disabled:opacity-50">
        Discard draft
      </button> : null}
    </div>
  )
}
