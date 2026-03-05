'use client'
import { formatTime } from '@/lib/utils'
import type { TakeComment } from '@/types/app.types'

interface CommentThreadProps {
  comments: TakeComment[]
  onDelete?: (id: number) => void
  isAdmin?: boolean
  showDeleteForIds?: Set<number>  // ids the current user can delete (own comments)
}

export function CommentThread({ comments, onDelete, isAdmin, showDeleteForIds }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <div className="text-[11px] text-[#333] py-2">Aucun commentaire</div>
    )
  }

  return (
    <div className="space-y-1.5 mt-2">
      {comments.map(comment => {
        const canDelete = isAdmin || (showDeleteForIds?.has(comment.id) && !!onDelete)
        return (
          <div
            key={comment.id}
            className="flex items-start gap-2 px-2 py-1.5 bg-studio-surface2 border border-studio-border rounded-md"
          >
            {/* Time badge */}
            {comment.time_position !== null ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded tabular-nums flex-shrink-0 mt-0.5"
                style={{ background: '#FF994418', border: '1px solid #FF994433', color: '#FF9944' }}>
                ◈ {formatTime(comment.time_position)}
              </span>
            ) : (
              <span className="text-[9px] text-studio-muted bg-studio-border px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                Global
              </span>
            )}

            <span className="text-[12px] text-studio-text flex-1 leading-relaxed">
              {comment.note}
            </span>

            {canDelete && onDelete && (
              <button
                onClick={() => onDelete(comment.id)}
                className="text-[11px] text-studio-muted hover:text-studio-red transition-colors flex-shrink-0"
                title="Supprimer"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
