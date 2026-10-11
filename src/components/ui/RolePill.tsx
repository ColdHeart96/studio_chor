import type { UserRole } from '@/types/app.types'

export function RolePill({ role }: { role: UserRole }) {
  return (
    <span
      className={
        role === 'admin'
          ? 'text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest bg-[rgb(var(--gold)/0.13)] border border-[rgb(var(--gold)/0.27)] text-studio-gold'
          : 'text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest bg-[rgb(var(--green)/0.13)] border border-[rgb(var(--green)/0.27)] text-studio-green'
      }
    >
      {role}
    </span>
  )
}
