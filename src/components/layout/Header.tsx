'use client'
import { RolePill } from '@/components/ui/RolePill'
import { useOrgContext } from '@/contexts/OrgContext'
import type { Profile } from '@/types/app.types'

interface HeaderProps {
  profile: Profile | null
  onLogout: () => void
}

export function Header({ profile, onLogout }: HeaderProps) {
  const { activeOrg, orgs, setActiveOrg } = useOrgContext()

  return (
    <div className="px-6 pt-5 pb-0 border-b border-studio-border bg-gradient-to-b from-[#12100a] to-transparent">
      <div className="flex justify-between items-center mb-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-studio-gold to-studio-gold-dim flex items-center justify-center text-[15px] shadow-[0_0_16px_#E8C54744]">
            ♪
          </div>
          <div>
            <div className="text-[17px] text-studio-gold tracking-wide leading-tight">Chœur Studio</div>
            {activeOrg && (
              <div className="text-[10px] text-studio-muted tracking-widest uppercase truncate max-w-[140px]">
                {activeOrg.name}
              </div>
            )}
          </div>
        </div>

        {/* Right: org switcher + user */}
        <div className="flex items-center gap-2">
          {/* Org switcher (if multiple orgs) */}
          {orgs.length > 1 && activeOrg && (
            <select
              value={activeOrg.id}
              onChange={e => {
                const found = orgs.find(o => o.id === e.target.value)
                if (found) setActiveOrg(found)
              }}
              className="text-[10px] bg-studio-surface border border-studio-border rounded px-2 py-1 text-studio-muted font-serif outline-none max-w-[100px] truncate cursor-pointer"
            >
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}

          {profile && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-studio-muted max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap hidden sm:block">
                {profile.email}
              </span>
              <RolePill role={profile.role} />
              <button
                onClick={onLogout}
                className="bg-transparent border border-studio-border2 rounded px-2 py-1 text-studio-muted text-[10px] cursor-pointer hover:text-studio-text transition-colors font-serif"
                title="Se déconnecter"
              >
                ↪ Déco
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
