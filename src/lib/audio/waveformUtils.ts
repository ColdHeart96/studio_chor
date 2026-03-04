/**
 * Extract normalized peak values from an AudioBuffer for waveform rendering.
 * Returns an array of N values in range [0, 1].
 */
export function extractPeaks(buffer: AudioBuffer, samples = 200): number[] {
  const channelData = buffer.getChannelData(0)
  const blockSize   = Math.floor(channelData.length / samples)
  const peaks: number[] = []

  for (let i = 0; i < samples; i++) {
    let max = 0
    const start = i * blockSize
    for (let j = 0; j < blockSize; j++) {
      const val = Math.abs(channelData[start + j] ?? 0)
      if (val > max) max = val
    }
    peaks.push(max)
  }

  // Normalize to [0, 1]
  const maxPeak = Math.max(...peaks, 0.001)
  return peaks.map(p => p / maxPeak)
}

/**
 * Draw waveform peaks onto a canvas.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  options: {
    color?: string
    bgColor?: string
    progress?: number       // 0-1, for progress coloring
    progressColor?: string
    height?: number
    barWidth?: number
    gap?: number
  } = {}
): void {
  const {
    color         = '#2a2418',
    bgColor       = 'transparent',
    progress      = 0,
    progressColor = '#E8C547',
    barWidth      = 2,
    gap           = 1,
  } = options

  const ctx    = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, w, h)
  }

  const totalBars = Math.floor(w / (barWidth + gap))
  const samplesPerBar = peaks.length / totalBars
  const progressX = progress * w

  for (let i = 0; i < totalBars; i++) {
    const peakIndex = Math.floor(i * samplesPerBar)
    const peak = peaks[Math.min(peakIndex, peaks.length - 1)] ?? 0
    const barHeight = Math.max(2, peak * h)
    const x = i * (barWidth + gap)
    const y = (h - barHeight) / 2

    ctx.fillStyle = x < progressX ? progressColor : color
    ctx.fillRect(x, y, barWidth, barHeight)
  }
}

/**
 * Draw waveform for a single voice track (for multi-track display).
 */
export function drawVoiceWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  color: string,
  progress = 0
): void {
  drawWaveform(canvas, peaks, {
    color: color + '44',
    progressColor: color,
    progress,
    barWidth: 2,
    gap: 1,
  })
}
