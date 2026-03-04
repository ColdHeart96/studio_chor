import type { UserRole } from '@/types/app.types'

export function RolePill({ role }: { role: UserRole }) {
  return (
    <span
      className={
        role === 'admin'
          ? 'text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest bg-[#E8C54722] border border-[#E8C54744] text-studio-gold'
          : 'text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest bg-[#4ADE8022] border border-[#4ADE8044] text-studio-green'
      }
    >
      {role}
    </span>
  )
}
