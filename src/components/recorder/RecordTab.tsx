'use client'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useOrgContext } from '@/contexts/OrgContext'
import { useRecorder } from '@/hooks/useRecorder'
import { useTakes } from '@/hooks/useTakes'
import { uploadTake } from '@/lib/storage'
import { formatTime } from '@/lib/utils'
import { Card, SectionLabel } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { VUMeter } from '@/components/recorder/VUMeter'
import { RecordButton } from '@/components/recorder/RecordButton'
import { CountdownOverlay } from '@/components/recorder/CountdownOverlay'
import { ReviewPanel } from '@/components/recorder/ReviewPanel'

export function RecordTab() {
  const { user } = useAuth()
  const { activeOrg } = useOrgContext()
  const { saveTake } = useTakes(user?.id, activeOrg?.id)
  const {
    state, countdown, elapsed, stream, blob, mimeType, error,
    startCountdown, stopRecording, restartRecording, discardRecording,
  } = useRecorder()

  const [saveError, setSaveError] = useState('')

  async function handleSave() {
    if (!blob || !user) return
    setSaveError('')
    try {
      const path = await uploadTake(user.id, blob, mimeType)
      await saveTake({
        name: `Prise ${new Date().toLocaleDateString('fr-FR')}`,
        duration: formatTime(elapsed),
        storagePath: path,
        backingSnapshot: {},
        orgId: activeOrg?.id,
      })
      discardRecording()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    }
  }

  // ── Countdown ────────────────────────────────────────────────────────────
  if (state === 'countdown') {
    return <CountdownOverlay count={countdown} />
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  if (state === 'recording') {
    return (
      <div>
        <RecordButton recording={true} onClick={() => {}} />
        <div className="text-center mb-5">
          <div className="text-[11px] text-studio-red tracking-[0.2em] uppercase">
            Enregistrement en cours
          </div>
          <div className="text-[32px] text-studio-text tabular-nums mt-1">
            {formatTime(elapsed)}
          </div>
        </div>

        <Card className="mb-4">
          <div className="flex items-center gap-3 mb-2.5">
            <span className="text-xs text-[#888]">Micro</span>
            <VUMeter stream={stream} />
          </div>
          <div className="h-1 bg-studio-border rounded">
            <div
              className="h-full rounded transition-[width] duration-100"
              style={{
                width: `${(elapsed / 600) * 100}%`,
                background: 'linear-gradient(90deg, #CC2222, #FF6644)',
              }}
            />
          </div>
        </Card>

        <Button variant="ghost" size="lg" onClick={stopRecording}>
          ⏹ &nbsp;Arrêter
        </Button>
      </div>
    )
  }

  // ── Review ────────────────────────────────────────────────────────────────
  if (state === 'reviewing' && blob) {
    return (
      <div>
        {saveError && <p className="text-xs text-studio-red mb-3">{saveError}</p>}
        <ReviewPanel
          blob={blob}
          elapsed={elapsed}
          onSave={handleSave}
          onRetry={restartRecording}
          onDiscard={discardRecording}
        />
      </div>
    )
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {error && (
        <div className="p-4 bg-[#1a1010] border border-[#2a1010] rounded-xl text-[13px] text-[#886655] mb-4">
          ⚠ {error}
        </div>
      )}

      <SectionLabel>Microphone</SectionLabel>
      <Card className="flex items-center gap-3.5 mb-4">
        <span className="text-2xl">🎤</span>
        <span className="text-[11px] text-studio-muted">
          {stream ? 'Micro actif' : 'En attente'}
        </span>
        {stream && <VUMeter stream={stream} />}
      </Card>

      <Button variant="red" size="lg" onClick={startCountdown}>
        ⏺ &nbsp;Démarrer l&apos;enregistrement
      </Button>
    </div>
  )
}
