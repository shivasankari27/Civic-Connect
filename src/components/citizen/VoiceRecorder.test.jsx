
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import VoiceRecorder from './VoiceRecorder'

if (typeof HTMLMediaElement === 'undefined') {
  globalThis.HTMLMediaElement = class HTMLMediaElement {
    pause() {}
    play() {
      return Promise.resolve()
    }
  }
} else {
  if (!HTMLMediaElement.prototype.pause) {
    HTMLMediaElement.prototype.pause = () => {}
  }
  if (!HTMLMediaElement.prototype.play) {
    HTMLMediaElement.prototype.play = () => Promise.resolve()
  }
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let mockRecorder
let mockStream
let mockTrack
let mockGetUserMedia

class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream
    this.options = options
    this.mimeType = options?.mimeType || 'audio/webm'
    this.state = 'inactive'
    this.ondataavailable = null
    this.onstop = null
    this.onerror = null
    mockRecorder = this
  }

  static isTypeSupported() {
    return true
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    if (this.state !== 'recording') return

    this.state = 'inactive'

    this.ondataavailable?.({
      data: new Blob(['test audio'], { type: this.mimeType }),
    })

    this.onstop?.()
  }
}

async function renderRecorder(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(<VoiceRecorder {...props} />)
  })
}

async function clickButton(label) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent.includes(label)
  )

  if (!button) {
    throw new Error(`Button "${label}" was not found`)
  }

  await act(async () => {
    button.click()
  })
}

beforeEach(() => {
  mockTrack = { stop: vi.fn() }

  mockStream = {
    getTracks: () => [mockTrack],
  }

  mockGetUserMedia = vi.fn().mockResolvedValue(mockStream)

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: mockGetUserMedia,
    },
  })

  globalThis.MediaRecorder = MockMediaRecorder

  globalThis.URL.createObjectURL = vi.fn(() => 'blob:test-audio')
  globalThis.URL.revokeObjectURL = vi.fn()

  if (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype) {
    if (!HTMLMediaElement.prototype.pause) {
      HTMLMediaElement.prototype.pause = () => {}
    }
    if (!HTMLMediaElement.prototype.play) {
      HTMLMediaElement.prototype.play = () => Promise.resolve()
    }
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  }
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }

  container?.remove()

  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('VoiceRecorder', () => {
  it('renders the voice recorder controls', async () => {
    await renderRecorder()

    expect(container.textContent).toContain('Voice note')
    expect(container.textContent).toContain('Maximum 60 seconds')
    expect(container.textContent).toContain('Start recording')
  })

  it('starts recording after microphone permission is granted', async () => {
    await renderRecorder()

    await clickButton('Start recording')

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(mockRecorder.state).toBe('recording')
    expect(container.textContent).toContain('Recording')
  })

  it('stops recording and returns the audio recording', async () => {
    const onRecordingComplete = vi.fn()

    await renderRecorder({ onRecordingComplete })

    await clickButton('Start recording')
    await clickButton('Stop recording')

    expect(mockRecorder.state).toBe('inactive')
    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: expect.any(Blob),
        durationSeconds: 0,
        contentType: 'audio/webm;codecs=opus',
      })
    )

    expect(mockTrack.stop).toHaveBeenCalled()
    expect(container.textContent).toContain('Play')
    expect(container.textContent).toContain('Discard')
  })

  it('shows an error when microphone permission is denied', async () => {
    mockGetUserMedia.mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError')
    )

    await renderRecorder()

    await clickButton('Start recording')

    expect(container.textContent).toContain(
      'Microphone permission denied'
    )
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('shows an error when no microphone is available', async () => {
    mockGetUserMedia.mockRejectedValue(
      new DOMException('No microphone', 'NotFoundError')
    )

    await renderRecorder()

    await clickButton('Start recording')

    expect(container.textContent).toContain(
      'No microphone was found'
    )
  })

  it('shows an error when recording is unsupported', async () => {
    globalThis.MediaRecorder = undefined

    await renderRecorder()

    await clickButton('Start recording')

    expect(container.textContent).toContain(
      'Audio recording is not supported'
    )
    expect(mockGetUserMedia).not.toHaveBeenCalled()
  })

  it('does not start recording when disabled', async () => {
    await renderRecorder({ disabled: true })

    const button = container.querySelector('button')

    expect(button.disabled).toBe(true)
    expect(mockGetUserMedia).not.toHaveBeenCalled()
  })

  it('discards a recording and clears the audio preview', async () => {
    const onRecordingComplete = vi.fn()

    await renderRecorder({ onRecordingComplete })

    await clickButton('Start recording')
    await clickButton('Stop recording')

    await clickButton('Discard')

    expect(container.textContent).toContain('Start recording')
    expect(container.textContent).not.toContain('Discard')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-audio')
    expect(onRecordingComplete).toHaveBeenLastCalledWith(null)
  })

  it('automatically stops recording after 60 seconds', async () => {
    vi.useFakeTimers()

    const onRecordingComplete = vi.fn()

    await renderRecorder({ onRecordingComplete })
    await clickButton('Start recording')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(mockRecorder.state).toBe('inactive')
    expect(onRecordingComplete).toHaveBeenCalled()
    expect(container.textContent).toContain('Play')
  })

  it('stops the microphone when the component unmounts', async () => {
    await renderRecorder()

    await clickButton('Start recording')

    await act(async () => {
      root.unmount()
      root = null
    })

    expect(mockTrack.stop).toHaveBeenCalled()
    expect(mockRecorder.state).toBe('inactive')
  })
})
