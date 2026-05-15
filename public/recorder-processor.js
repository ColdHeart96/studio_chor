class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
    this.recording = false

    this.port.onmessage = (e) => {
      if (e.data.type === 'START') {
        this.recording = true
        this.buffer = new Float32Array(this.bufferSize)
        this.bufferIndex = 0
      } else if (e.data.type === 'STOP') {
        this.recording = false
        // Flush remaining partial buffer
        if (this.bufferIndex > 0) {
          const toSend = this.buffer.slice(0, this.bufferIndex)
          this.port.postMessage({ type: 'AUDIO_CHUNK', samples: toSend }, [toSend.buffer])
          this.bufferIndex = 0
        }
        this.port.postMessage({ type: 'STOPPED' })
      }
    }
  }

  process(inputs) {
    if (!this.recording) return true
    const input = inputs[0]
    if (input && input.length > 0) {
      const channelData = input[0]
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i]
        if (this.bufferIndex >= this.bufferSize) {
          const toSend = this.buffer
          this.port.postMessage({ type: 'AUDIO_CHUNK', samples: toSend }, [toSend.buffer])
          this.buffer = new Float32Array(this.bufferSize)
          this.bufferIndex = 0
        }
      }
    }
    return true
  }
}

registerProcessor('recorder-processor', RecorderProcessor)
