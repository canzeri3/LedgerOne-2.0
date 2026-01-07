// Full-screen blurred loader overlay used by App Router `loading.tsx` files.
// Keep this component free of client hooks so it can render as a server component.

export default function FullScreenPageLoader() {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/45 backdrop-blur-md">
      <div className="lg1-page-loader">
        <div className="lg1-loader-orbit">
          <div className="lg1-triangle1" />
          <div className="lg1-triangle2" />
        </div>
        <div className="lg1-loader-text">Preparing your LedgerOne workspace…</div>
      </div>
    </div>
  )
}

