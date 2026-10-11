/**
 * AudioWorkletProcessor : capture le micro en PCM 16 bits, sur la MÊME horloge
 * que la lecture des pistes (currentFrame de l'AudioContext).
 *
 * Chaque message contient l'index absolu de la première frame du bloc, ce qui
 * permet de recaler la voix à l'échantillon près sur le démarrage des pistes.
 */
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Int16Array(4096)
    this.n = 0
    this.startFrame = 0
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this.flush()
        this.port.postMessage({ done: true })
      }
    }
  }

  flush() {
    if (this.n === 0) return
    const out = this.buf.slice(0, this.n)
    this.port.postMessage({ frame: this.startFrame, data: out }, [out.buffer])
    this.n = 0
  }

  process(inputs) {
    const input = inputs[0]
    const ch = input && input[0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      if (this.n === 0) this.startFrame = currentFrame + i
      let s = ch[i]
      s = s < -1 ? -1 : s > 1 ? 1 : s
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.n === this.buf.length) this.flush()
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
