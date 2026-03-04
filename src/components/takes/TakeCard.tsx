'use client'
import { useState, useRef } from 'react'
import { TakePlayer } from '@/components/takes/TakePlayer'
import { CommentThread } from '@/components/takes/CommentThread'
import { useComments } from '@/hooks/useComments'
import { getTakeUrl } from '@/lib/storage'
import type { Take } from '@/types/app.types'

interface TakeCardProps {
  take: Take
  onDelete: (take: Take) => void
  onToggleFavorite: (take: Take) => void
  onRename: (take: Take, newName: string) => Promise<void>
}

export function TakeCard({ take, onDelete, onToggleFavorite, onRename }: TakeCardProps) {
  const [expanded, setExpanded]         = useState(false)
  const [showPlayer, setShowPlayer]     = useState(false)
  const [showComments, setShowComments] = useState(false)

  const [isRenaming, setIsRenaming]   = useState(false)
  const [renameValue, setRenameValue] = useState(take.name)
  const [downloading, setDownloading] = useState(false)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const { comments, loading: commentsLoading } = useComments(expanded ? take.id : null)

  function startRename(e: React.MouseEvent) {
    e.stopPropagation()
    setRenameValue(take.name)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.focus(), 0)
  }

  async function commitRename() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== take.name) {
      await onRename(take, trimmed)
    }
    setIsRenaming(false)
  }

  function handleRenameKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  commitRename()
    if (e.key === 'Escape') setIsRenaming(false)
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    if (!take.storage_path || downloading) return
    setDownloading(true)
    try {
      const url  = await getTakeUrl(take.storage_path)
      const resp = await fetch(url)
      const dlBlob = await resp.blob()
      const objUrl = URL.createObjectURL(dlBlob)
      const a = document.createElement('a')
      a.href = objUrl
      // Infer extension from mime type returned by storage
      const ext = dlBlob.type.includes('wav') ? 'wav' : dlBlob.type.includes('webm') ? 'webm' : 'mp4'
      a.download = `${take.name}.${ext}`
      a.click()
      URL.revokeObjectURL(objUrl)
    } catch { /* ignore */ } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className={`bg-studio-surface border rounded-xl mb-2 transition-all ${
        showPlayer
          ? 'border-[rgba(232,197,71,0.3)] bg-[rgba(232,197,71,0.03)]'
          : 'border-studio-border hover:border-studio-border2'
      }`}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 p-3.5 w-full cursor-pointer"
        onClick={() => {
          setShowPlayer(p => !p)
          setExpanded(true)
        }}
      >
        {/* Play button */}
        <div
          className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[15px] transition-all ${
            showPlayer
              ? 'bg-gradient-to-br from-studio-gold to-studio-gold-dim border-none text-studio-bg'
              : 'bg-[#1a1814] border border-studio-border2 text-[#666]'
          }`}
        >
          {showPlayer ? '⏸' : '▶'}
        </div>

        {/* Info or rename input */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              onClick={e => e.stopPropagation()}
              className="w-full bg-[#1a1814] border border-studio-gold rounded px-2 py-0.5 text-[13px] text-studio-text outline-none"
            />
          ) : (
            <>
              <div className="text-[13px] text-studio-text truncate">{take.name}</div>
              <div className="text-[10px] text-studio-muted mt-0.5">
                {take.date} · {take.duration}
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(take) }}
          className={`text-sm transition-colors ${take.favorite ? 'text-studio-gold' : 'text-[#2a2418] hover:text-[#444]'}`}
          title={take.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          ★
        </button>

        <button
          onClick={startRename}
          className="text-[12px] text-[#333] hover:text-studio-gold transition-colors"
          title="Renommer"
        >
          ✎
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="text-[12px] text-[#333] hover:text-[#47A8E8] transition-colors disabled:opacity-40"
          title="Télécharger"
        >
          {downloading ? '…' : '↓'}
        </button>

        <button
          onClick={e => { e.stopPropagation(); onDelete(take) }}
          className="text-[11px] text-[#333] hover:text-studio-red transition-colors"
          title="Supprimer"
        >
          ✕
        </button>
      </div>

      {/* Player */}
      {showPlayer && take.storage_path && (
        <div className="px-3.5 pb-3">
          <TakePlayer
            storagePath={take.storage_path}
            duration={take.duration}
            comments={comments}
          />
        </div>
      )}

      {/* Comments section */}
      {expanded && (
        <div className="px-3.5 pb-3 border-t border-studio-border pt-2">
          <button
            className="flex justify-between items-center w-full py-1 text-[11px] text-studio-muted hover:text-[#777] transition-colors"
            onClick={e => { e.stopPropagation(); setShowComments(p => !p) }}
          >
            <span>
              {commentsLoading
                ? 'Chargement…'
                : `${comments.length} commentaire${comments.length !== 1 ? 's' : ''} du chef de chœur`}
            </span>
            <span>{showComments ? '▲' : '▼'}</span>
          </button>

          {showComments && <CommentThread comments={comments} />}
        </div>
      )}
    </div>
  )
}
