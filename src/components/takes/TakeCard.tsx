'use client'
import { useState, useRef } from 'react'
import { TakePlayer } from '@/components/takes/TakePlayer'
import { CommentThread } from '@/components/takes/CommentThread'
import { useComments } from '@/hooks/useComments'
import { useAuth } from '@/hooks/useAuth'
import { getTakeUrl } from '@/lib/storage'
import { formatTime } from '@/lib/utils'
import type { Take } from '@/types/app.types'

interface TakeCardProps {
  take: Take
  onDelete: (take: Take) => void
  onToggleFavorite: (take: Take) => void
  onRename: (take: Take, newName: string) => Promise<void>
  onRate: (take: Take, rating: number) => Promise<void>
}

export function TakeCard({ take, onDelete, onToggleFavorite, onRename, onRate }: TakeCardProps) {
  const { user } = useAuth()

  const [showPlayer, setShowPlayer]   = useState(false)
  const [isRenaming, setIsRenaming]   = useState(false)
  const [renameValue, setRenameValue] = useState(take.name)
  const [downloading, setDownloading] = useState(false)

  // ── Comment state ──────────────────────────────────────────────────────────
  const [markerMode, setMarkerMode]         = useState(false)
  const [isAddingComment, setIsAddingComment] = useState(false)
  const [pendingMarkerTime, setPendingMarkerTime] = useState<number | null>(null)
  const [commentText, setCommentText]       = useState('')
  const [saving, setSaving]                 = useState(false)

  const renameInputRef  = useRef<HTMLInputElement>(null)
  const commentInputRef = useRef<HTMLInputElement>(null)

  // Load comments whenever the player is open (needed for waveform markers)
  const { comments, addComment, deleteComment } = useComments(showPlayer ? take.id : null)

  // ── Rename ─────────────────────────────────────────────────────────────────
  function startRename(e: React.MouseEvent) {
    e.stopPropagation()
    setRenameValue(take.name)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.focus(), 0)
  }

  async function commitRename() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== take.name) await onRename(take, trimmed)
    setIsRenaming(false)
  }

  function handleRenameKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  commitRename()
    if (e.key === 'Escape') setIsRenaming(false)
  }

  // ── Download ───────────────────────────────────────────────────────────────
  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    if (!take.storage_path || downloading) return
    setDownloading(true)
    try {
      const url    = await getTakeUrl(take.storage_path)
      const resp   = await fetch(url)
      const dlBlob = await resp.blob()
      const objUrl = URL.createObjectURL(dlBlob)
      const a      = document.createElement('a')
      a.href       = objUrl
      const ext    = dlBlob.type.includes('mpeg') ? 'mp3'
                   : dlBlob.type.includes('wav')  ? 'wav'
                   : dlBlob.type.includes('webm') ? 'webm'
                   : 'mp4'
      a.download   = `${take.name}.${ext}`
      a.click()
      URL.revokeObjectURL(objUrl)
    } catch { /* ignore */ } finally {
      setDownloading(false)
    }
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  function handleMarkerPlace(time: number) {
    setPendingMarkerTime(time)
    setIsAddingComment(true)
    setMarkerMode(false)
    setTimeout(() => commentInputRef.current?.focus(), 0)
  }

  function startGlobalComment(e: React.MouseEvent) {
    e.stopPropagation()
    setPendingMarkerTime(null)
    setIsAddingComment(true)
    setMarkerMode(false)
    setTimeout(() => commentInputRef.current?.focus(), 0)
  }

  function cancelComment() {
    setIsAddingComment(false)
    setPendingMarkerTime(null)
    setCommentText('')
    setMarkerMode(false)
  }

  async function submitComment() {
    if (!user || !commentText.trim()) return
    setSaving(true)
    try {
      await addComment(user.id, commentText.trim(), pendingMarkerTime)
      setCommentText('')
      setIsAddingComment(false)
      setPendingMarkerTime(null)
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  function handleCommentKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() }
    if (e.key === 'Escape') cancelComment()
  }

  const rating = take.rating ?? 0
  const ownCommentIds = new Set(comments.filter(c => c.user_id === user?.id).map(c => c.id))

  return (
    <div
      className={`bg-studio-surface border rounded-xl mb-2 transition-all ${
        showPlayer
          ? 'border-[rgb(var(--gold)/0.3)] bg-[rgb(var(--gold)/0.03)]'
          : 'border-studio-border hover:border-studio-border2'
      }`}
    >
      {/* ── Main row ──────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 p-3.5 w-full cursor-pointer"
        onClick={() => setShowPlayer(p => !p)}
      >
        {/* Play indicator */}
        <div
          className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[15px] transition-all ${
            showPlayer
              ? 'bg-gradient-to-br from-studio-gold to-studio-gold-dim border-none text-studio-ink'
              : 'bg-studio-raised border border-studio-border2 text-studio-soft'
          }`}
        >
          {showPlayer ? '⏸' : '▶'}
        </div>

        {/* Info / rename input */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              onClick={e => e.stopPropagation()}
              className="w-full bg-studio-raised border border-studio-gold rounded px-2 py-0.5 text-[13px] text-studio-text outline-none"
            />
          ) : (
            <>
              <div className="text-[13px] text-studio-text truncate">{take.name}</div>
              <div className="text-[10px] text-studio-muted mt-0.5">{take.date} · {take.duration}</div>
              <div className="flex items-center mt-0.5" role="radiogroup" aria-label="Note de la prise">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={e => { e.stopPropagation(); void onRate(take, rating === n ? 0 : n).catch(() => {}) }}
                    className={`text-[17px] leading-none px-0.5 py-1 transition-colors ${n <= rating ? 'text-studio-gold' : 'text-studio-border2 hover:text-studio-muted'}`}
                    title={rating === n ? 'Retirer la note' : `${n} étoile${n > 1 ? 's' : ''}`}
                    aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                    role="radio"
                    aria-checked={rating === n}
                  >★</button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Action icons */}
        <button onClick={e => { e.stopPropagation(); onToggleFavorite(take) }}
          className={`text-sm transition-colors ${take.favorite ? 'text-studio-pink' : 'text-studio-border2 hover:text-studio-faint'}`}
          title={take.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>♥</button>
        <button onClick={startRename}
          className="text-[12px] text-studio-muted2 hover:text-studio-gold transition-colors"
          title="Renommer">✎</button>
        <button onClick={handleDownload} disabled={downloading}
          className="text-[12px] text-studio-muted2 hover:text-studio-blue transition-colors disabled:opacity-40"
          title="Télécharger">{downloading ? '…' : '↓'}</button>
        <button onClick={e => { e.stopPropagation(); onDelete(take) }}
          className="text-[11px] text-studio-muted2 hover:text-studio-red transition-colors"
          title="Supprimer">✕</button>
      </div>

      {/* ── Player + comments ─────────────────────────────────────────────────── */}
      {showPlayer && take.storage_path && (
        <div className="px-3.5 pb-3.5 space-y-3">

          {/* Waveform player */}
          <TakePlayer
            storagePath={take.storage_path}
            duration={take.duration}
            comments={comments}
            onMarkerPlace={markerMode ? handleMarkerPlace : undefined}
          />

          {/* Marker mode hint */}
          {markerMode && !isAddingComment && (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgb(var(--orange))' }}>
              <span className="animate-pulse">◈</span>
              Cliquez sur la forme d&apos;onde pour placer un marqueur
              <button onClick={cancelComment} className="ml-auto text-studio-muted hover:text-studio-muted">Annuler</button>
            </div>
          )}

          {/* Inline comment form */}
          {isAddingComment && (
            <div className="bg-studio-surface border border-studio-border2 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                {pendingMarkerTime !== null ? (
                  <span className="text-[10px] px-2 py-0.5 rounded tabular-nums" style={{ background: 'rgb(var(--orange) / 0.13)', border: '1px solid rgb(var(--orange) / 0.33)', color: 'rgb(var(--orange))' }}>
                    ◈ {formatTime(pendingMarkerTime)}
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-studio-border border border-studio-border text-studio-muted">
                    Global
                  </span>
                )}
                <span className="text-[11px] text-studio-muted">Votre commentaire</span>
              </div>
              <input
                ref={commentInputRef}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={handleCommentKey}
                placeholder="Écrivez votre commentaire…"
                className="w-full bg-studio-bg border border-studio-border rounded-lg px-3 py-2 text-[13px] text-studio-text placeholder-studio-muted2 outline-none focus:border-[rgb(var(--gold)/0.33)] mb-2"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={cancelComment} className="text-[11px] text-studio-muted hover:text-studio-soft px-2 py-1">
                  Annuler
                </button>
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim() || saving}
                  className="text-[11px] px-3 py-1 rounded-lg transition-all disabled:opacity-40"
                  style={{ background: 'rgb(var(--gold) / 0.13)', border: '1px solid rgb(var(--gold) / 0.33)', color: 'rgb(var(--gold))' }}
                >
                  {saving ? '…' : '✓ Ajouter'}
                </button>
              </div>
            </div>
          )}

          {/* Add comment buttons */}
          {!isAddingComment && (
            <div className="flex gap-2">
              <button
                onClick={() => { setMarkerMode(m => !m); setIsAddingComment(false) }}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all"
                style={markerMode
                  ? { border: '1px solid rgb(var(--orange) / 0.4)', background: 'rgb(var(--orange) / 0.07)', color: 'rgb(var(--orange))' }
                  : { border: '1px solid rgb(var(--border))', background: 'transparent', color: 'rgb(var(--muted))' }
                }
                title="Placer un marqueur temporel"
              >
                <span>◈</span> Marqueur
              </button>
              <button
                onClick={startGlobalComment}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-studio-border text-studio-muted hover:text-studio-muted hover:border-studio-border2 transition-all"
                title="Commentaire sans marqueur"
              >
                + Commentaire
              </button>
            </div>
          )}

          {/* Comments list */}
          {comments.length > 0 && (
            <CommentThread
              comments={comments}
              onDelete={id => ownCommentIds.has(id) ? deleteComment(id) : undefined}
              isAdmin={false}
              showDeleteForIds={ownCommentIds}
            />
          )}
        </div>
      )}
    </div>
  )
}
