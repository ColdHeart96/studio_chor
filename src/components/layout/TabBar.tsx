'use client'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types/app.types'

interface Tab {
  href: string
  label: string
  icon: string
}

const APP_TABS: Tab[] = [
  { href: '/app/player', label: 'Lecteur',     icon: '♪'  },
  { href: '/app/record', label: 'Enregistrer', icon: '⏺' },
  { href: '/app/takes',  label: 'Prises',       icon: '◈'  },
]

const ADMIN_TABS: Tab[] = [
  { href: '/admin/organizations', label: 'Organisations', icon: '🎼' },
  { href: '/admin/tracks',        label: 'Pistes',         icon: '♪'  },
  { href: '/admin/users',         label: 'Choristes',      icon: '👥' },
  { href: '/admin/takes-review',  label: 'Écoute',         icon: '⏺' },
]

export function TabBar({ role, takesCount }: { role: UserRole; takesCount?: number }) {
  const pathname = usePathname()
  const router   = useRouter()

  const isAdmin = pathname.startsWith('/admin')
  const tabs = isAdmin ? ADMIN_TABS : APP_TABS

  return (
    <div className="flex border-b border-studio-border overflow-x-auto">
      {tabs.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <button
            key={tab.href}
            onClick={() => router.push(tab.href)}
            className={cn(
              'px-3.5 py-2.5 bg-transparent border-b-2 text-[11px] uppercase tracking-[0.12em] font-serif cursor-pointer transition-all whitespace-nowrap flex-shrink-0',
              active
                ? 'border-b-studio-gold text-studio-gold'
                : 'border-b-transparent text-studio-muted hover:text-[#888]'
            )}
          >
            {tab.icon}&nbsp;&nbsp;{tab.label}
            {tab.href === '/app/takes' && takesCount !== undefined && takesCount > 0 && (
              <span className="ml-1 text-[9px] text-studio-muted">({takesCount})</span>
            )}
          </button>
        )
      })}

      {/* Switch admin ↔ app for admin users */}
      {role === 'admin' && (
        <button
          onClick={() => router.push(isAdmin ? '/app/player' : '/admin/organizations')}
          className="ml-auto px-3 py-2.5 text-[10px] text-studio-muted hover:text-studio-gold transition-colors whitespace-nowrap flex-shrink-0 border-b-2 border-b-transparent"
        >
          {isAdmin ? '← Retour app' : '⚙ Admin →'}
        </button>
      )}
    </div>
  )
}
