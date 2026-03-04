'use client'
import { formatTime } from '@/lib/utils'
import type { TakeComment } from '@/types/app.types'

interface CommentThreadProps {
  comments: TakeComment[]
  onDelete?: (id: number) => void
  isAdmin?: boolean
}

export function CommentThread({ comments, onDelete, isAdmin }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <div className="text-[11px] text-[#333] py-2">Aucun commentaire</div>
    )
  }

  return (
    <div className="space-y-1.5 mt-2">
      {comments.map(comment => (
        <div
          key={comment.id}
          className="flex items-start gap-2 px-2 py-1.5 bg-studio-surface2 border border-studio-border rounded-md"
        >
          {/* Temporal badge */}
          {comment.time_position !== null && (
            <span className="text-[9px] text-studio-gold bg-[#E8C54718] border border-[#E8C54733] px-1.5 py-0.5 rounded tabular-nums flex-shrink-0 mt-0.5">
              {formatTime(comment.time_position)}
            </span>
          )}
          {comment.time_position === null && (
            <span className="text-[9px] text-studio-muted bg-studio-border px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
              Global
            </span>
          )}

          <span className="text-[12px] text-studio-text flex-1 leading-relaxed">
            {comment.note}
          </span>

          {isAdmin && onDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="text-[11px] text-studio-muted hover:text-studio-red transition-colors flex-shrink-0"
              title="Supprimer"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
