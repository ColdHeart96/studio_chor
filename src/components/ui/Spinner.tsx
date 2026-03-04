export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-3 h-3 border-2', md: 'w-5 h-5 border-2', lg: 'w-8 h-8 border-3' }[size]
  return (
    <span
      className={`inline-block rounded-full border-studio-border border-t-studio-gold animate-spin-sm ${s}`}
    />
  )
}

export function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-studio-bg">
      <Spinner size="lg" />
    </div>
  )
}
