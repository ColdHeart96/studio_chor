'use client'
import { useState } from 'react'
import { TakePlayer } from '@/components/takes/TakePlayer'
import { CommentThread } from '@/components/takes/CommentThread'
import { useComments } from '@/hooks/useComments'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatTime, formatDate } from '@/lib/utils'
import type { Take } from '@/types/app.types'

interface TakeReviewPlayerProps {
  take: Take
  choriste: { email: string }
  onClose: () => void
}

export function TakeReviewPlayer({ take, choriste, onClose }: TakeReviewPlayerProps) {
  const { user } = useAuth()
  const { comments, loading, addComment, deleteComment } = useComments(take.id)

  const [pendingTime, setPendingTime]   = useState<number | null>(null)
  const [commentText, setCommentText]   = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  function handleMarkerPlace(time: number) {
    setPendingTime(time)
    setCommentText('')
    setShowModal(true)
  }

  async function handleSaveComment() {
    if (!user || !commentText.trim()) return
    setSaving(true); setError('')
    try {
      await addComment(user.id, commentText.trim(), pendingTime)
      setShowModal(false)
      setCommentText('')
      setPendingTime(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddGlobal() {
    setPendingTime(null)
    setCommentText('')
    setShowModal(true)
  }

  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl p-4 mb-4 animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-sm text-studio-text">{take.name}</div>
          <div className="text-[10px] text-studio-muted mt-0.5">
            {choriste.email} · {take.date} · {take.duration}
          </div>
        </div>
        <button onClick={onClose} className="text-studio-muted hover:text-studio-text transition-colors text-sm">✕</button>
      </div>

      {/* Player avec possibilité de placer des marqueurs */}
      {take.storage_path && (
        <div>
          <div className="text-[10px] text-studio-muted mb-1">
            Cliquez sur la forme d&apos;onde pour placer un commentaire temporel
          </div>
          <TakePlayer
            storagePath={take.storage_path}
            duration={take.duration}
            comments={comments}
            onMarkerPlace={handleMarkerPlace}
          />
        </div>
      )}

      {/* Add global comment */}
      <button
        onClick={handleAddGlobal}
        className="mt-3 w-full py-2 bg-transparent border border-dashed border-studio-border2 rounded-lg text-[11px] text-studio-muted hover:border-[#E8C54755] hover:text-studio-gold transition-all font-serif"
      >
        + Ajouter un commentaire global
      </button>

      {/* Comments */}
      <div className="mt-3">
        <div className="text-[10px] text-studio-muted mb-2">
          Commentaires ({comments.length})
        </div>
        <CommentThread
          comments={comments}
          onDelete={deleteComment}
          isAdmin={true}
        />
      </div>

      {/* Comment modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={pendingTime !== null ? `Commentaire à ${formatTime(pendingTime)}` : 'Commentaire global'}
      >
        {error && <p className="text-xs text-studio-red mb-2">{error}</p>}
        <textarea
          placeholder="Votre commentaire…"
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-studio-surface2 border border-studio-border rounded-lg text-studio-text font-serif text-sm outline-none focus:border-studio-gold/40 placeholder:text-studio-muted resize-none mb-4"
          autoFocus
        />
        <Button variant="gold" size="lg" loading={saving} onClick={handleSaveComment}>
          Enregistrer
        </Button>
      </Modal>
    </div>
  )
}
