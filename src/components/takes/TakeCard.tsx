'use client'
import { useState } from 'react'
import { TakePlayer } from '@/components/takes/TakePlayer'
import { CommentThread } from '@/components/takes/CommentThread'
import { useComments } from '@/hooks/useComments'
import { formatDate } from '@/lib/utils'
import type { Take } from '@/types/app.types'

interface TakeCardProps {
  take: Take
  onDelete: (take: Take) => void
  onToggleFavorite: (take: Take) => void
}

export function TakeCard({ take, onDelete, onToggleFavorite }: TakeCardProps) {
  const [expanded, setExpanded]       = useState(false)
  const [showPlayer, setShowPlayer]   = useState(false)
  const [showComments, setShowComments] = useState(false)
  const { comments, loading: commentsLoading } = useComments(expanded ? take.id : null)

  const hasComments = comments.length > 0

  return (
    <div
      className={`bg-studio-surface border rounded-xl mb-2 cursor-pointer transition-all ${
        showPlayer
          ? 'border-[rgba(232,197,71,0.3)] bg-[rgba(232,197,71,0.03)]'
          : 'border-studio-border hover:border-studio-border2'
      }`}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 p-3.5 w-full"
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

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-studio-text truncate">{take.name}</div>
          <div className="text-[10px] text-studio-muted mt-0.5">
            {take.date} · {take.duration}
          </div>
        </div>

        {/* Favorite */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(take) }}
          className={`text-sm transition-colors ${take.favorite ? 'text-studio-gold' : 'text-[#2a2418] hover:text-[#444]'}`}
          title={take.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          ★
        </button>

        {/* Delete */}
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
