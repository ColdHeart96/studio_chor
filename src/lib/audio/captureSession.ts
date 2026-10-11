/**
 * Capture du micro dans le MÊME AudioContext que la lecture des pistes.
 *
 * Pourquoi : avec MediaRecorder, la voix et les pistes n'ont aucune horloge
 * commune (le recorder démarre avant ou après le play(), avec un délai
 * d'encodeur variable). Ici, chaque échantillon vocal porte l'index de frame de
 * l'AudioContext, et les pistes sont lancées avec source.start(t0) : on sait donc
 * exactement quel échantillon de voix correspond au début des pistes.
 */

export interface CapturedVoice {
  /** PCM mono 16 bits. L'échantillon 0 correspond à t0 (début des pistes). */
  samples: Int16Array
  sampleRate: number
  /** Index absolu (frame de l'AudioContext) de samples[0]. */
  startFrame: number
}

interface Chunk {
  frame: number
  data: Int16Array
}

const loadedWorklets = new WeakSet<BaseAudioContext>()
const WORKLET_URL = '/worklets/pcm-capture.js'

export class CaptureSession {
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private chunks: Chunk[] = []
  private keepFrom = 0
  private flushWaiter: (() => void) | null = null
  private maxAbs = 0

  constructor(private readonly ctx: AudioContext) {}

  get sampleRate(): number {
    return this.ctx.sampleRate
  }

  /** Niveau crête (0–1) reçu du micro depuis l'ouverture. ~0 = micro muet ou non autorisé. */
  get peak(): number {
    return this.maxAbs / 32768
  }

  /** Branche le micro et commence à collecter (rien n'est gardé avant begin()). */
  async open(stream: MediaStream): Promise<void> {
    const ctx = this.ctx
    this.keepFrom = Math.floor(ctx.currentTime * ctx.sampleRate)

    this.source = ctx.createMediaStreamSource(stream)
    // La sortie est muette : le noeud doit être relié à destination pour être « tiré ».
    this.sink = ctx.createGain()
    this.sink.gain.value = 0
    this.sink.connect(ctx.destination)

    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      if (!loadedWorklets.has(ctx)) {
        await ctx.audioWorklet.addModule(WORKLET_URL)
        loadedWorklets.add(ctx)
      }
      const node = new AudioWorkletNode(ctx, 'pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })
      node.port.onmessage = (e: MessageEvent) => {
        const m = e.data as { done?: boolean; frame?: number; data?: Int16Array }
        if (m.done) {
          this.flushWaiter?.()
          this.flushWaiter = null
          return
        }
        if (typeof m.frame === 'number' && m.data) this.push(m.frame, m.data)
      }
      this.source.connect(node)
      node.connect(this.sink)
      this.node = node
      return
    }

    // Repli (très vieux navigateurs) : ScriptProcessor, même horloge mais moins précis.
    // L'erreur constante éventuelle est absorbée par la calibration (mesurée avec ce même chemin).
    const sp = ctx.createScriptProcessor(4096, 1, 1)
    let counter: number | null = null
    sp.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0)
      if (counter === null) counter = Math.round(ctx.currentTime * ctx.sampleRate) - input.length
      const pcm = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]))
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      this.push(counter, pcm)
      counter += input.length
    }
    this.source.connect(sp)
    sp.connect(this.sink)
    this.node = sp
  }

  /** Fixe l'instant (temps AudioContext, en secondes) qui sera l'échantillon 0. */
  begin(t0: number): void {
    this.keepFrom = Math.ceil(t0 * this.ctx.sampleRate)
    this.chunks = this.chunks.filter(c => c.frame + c.data.length > this.keepFrom)
  }

  private push(frame: number, data: Int16Array) {
    for (let i = 0; i < data.length; i++) {
      const a = data[i] < 0 ? -data[i] : data[i]
      if (a > this.maxAbs) this.maxAbs = a
    }
    if (frame + data.length <= this.keepFrom) return
    this.chunks.push({ frame, data })
  }

  /**
   * Arrête la capture. `tailMs` laisse arriver la fin de la dernière note
   * (la voix arrive avec la latence d'entrée du micro).
   */
  async finish(tailMs = 300): Promise<CapturedVoice> {
    if (tailMs > 0) await new Promise<void>(r => setTimeout(r, tailMs))

    if (this.node && 'port' in this.node) {
      const worklet = this.node
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 600)
        this.flushWaiter = () => { clearTimeout(timer); resolve() }
        worklet.port.postMessage('flush')
      })
    }

    const sorted = [...this.chunks].sort((a, b) => a.frame - b.frame)
    const last = sorted[sorted.length - 1]
    const total = last ? Math.max(0, last.frame + last.data.length - this.keepFrom) : 0
    const out = new Int16Array(total)
    for (const c of sorted) {
      const from = Math.max(c.frame, this.keepFrom)
      const to = c.frame + c.data.length
      if (to <= from) continue
      out.set(c.data.subarray(from - c.frame), from - this.keepFrom)
    }

    const voice: CapturedVoice = {
      samples: out,
      sampleRate: this.ctx.sampleRate,
      startFrame: this.keepFrom,
    }
    this.destroy()
    return voice
  }

  destroy(): void {
    try {
      if (this.node) {
        if ('port' in this.node) this.node.port.onmessage = null
        else this.node.onaudioprocess = null
        this.node.disconnect()
      }
      this.source?.disconnect()
      this.sink?.disconnect()
    } catch { /* déjà déconnecté */ }
    this.node = null
    this.source = null
    this.sink = null
    this.chunks = []
    this.flushWaiter = null
  }
}
