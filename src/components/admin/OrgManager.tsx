'use client'
import { useState } from 'react'
import { useOrgContext } from '@/contexts/OrgContext'
import { createOrg, regenerateInviteCode, deleteOrg, updateOrgName } from '@/lib/orgs'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { MAX_ORGS_PER_ADMIN } from '@/lib/constants'

export function OrgManager() {
  const { user } = useAuth()
  const { orgs, reload, setActiveOrg } = useOrgContext()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [error, setError]           = useState('')
  const [busy, setBusy]             = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)

  async function handleCreate() {
    if (!user || !newName.trim()) return
    setBusy(true); setError('')
    try {
      const org = await createOrg(newName.trim(), user.id)
      await reload()
      setActiveOrg(org)
      setShowCreate(false)
      setNewName('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function handleRegenCode(orgId: string) {
    try {
      await regenerateInviteCode(orgId)
      await reload()
    } catch {}
  }

  async function handleDelete(orgId: string) {
    if (!confirm('Supprimer cette organisation ? Toutes les pistes et prises associées seront perdues.')) return
    try {
      await deleteOrg(orgId)
      await reload()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur')
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-studio-muted uppercase tracking-widest">
          Organisations ({orgs.length}/{MAX_ORGS_PER_ADMIN})
        </div>
        {orgs.length < MAX_ORGS_PER_ADMIN && (
          <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
            + Créer
          </Button>
        )}
      </div>

      {orgs.length === 0 && (
        <div className="text-center py-8 text-[#444]">
          <div className="text-2xl mb-2">🎼</div>
          <div className="text-sm">Aucune organisation</div>
        </div>
      )}

      <div className="space-y-3">
        {orgs.map(org => (
          <Card key={org.id} className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm text-studio-text">{org.name}</div>
                <div className="text-[10px] text-studio-muted mt-0.5">
                  Créé le {new Date(org.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <button
                onClick={() => handleDelete(org.id)}
                className="text-[11px] text-studio-muted hover:text-studio-red transition-colors"
              >
                Supprimer
              </button>
            </div>

            {/* Invite code */}
            <div className="flex items-center gap-2 bg-studio-surface2 border border-studio-border rounded-lg px-3 py-2">
              <span className="text-[11px] text-studio-muted">Code d&apos;invitation :</span>
              <span className="text-sm text-studio-gold font-mono tracking-widest flex-1">{org.invite_code}</span>
              <button
                onClick={() => copyCode(org.invite_code)}
                className="text-[10px] px-2 py-0.5 border border-studio-border2 rounded text-studio-muted hover:text-studio-text transition-colors"
              >
                {copied === org.invite_code ? '✓ Copié' : 'Copier'}
              </button>
              <button
                onClick={() => handleRegenCode(org.id)}
                className="text-[10px] px-2 py-0.5 border border-studio-border2 rounded text-studio-muted hover:text-studio-text transition-colors"
                title="Générer un nouveau code"
              >
                ↻
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouvelle organisation">
        {error && <p className="text-xs text-studio-red mb-3">{error}</p>}
        <input
          type="text"
          placeholder="Nom de l'organisation"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="w-full px-3.5 py-2.5 bg-studio-surface2 border border-studio-border rounded-lg text-studio-text font-serif text-sm outline-none focus:border-studio-gold/40 placeholder:text-studio-muted mb-4"
          autoFocus
        />
        <Button variant="gold" size="lg" loading={busy} onClick={handleCreate}>
          Créer
        </Button>
      </Modal>
    </div>
  )
}
