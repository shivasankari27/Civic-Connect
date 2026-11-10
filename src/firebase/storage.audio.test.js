
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateComplaintAudio,
  uploadComplaintAudio,
  MAX_AUDIO_DURATION_SECONDS,
} from './storage'

vi.mock('./config', () => ({
  default: {
    apiKey: 'mock-api-key',
    authDomain: 'civicconnect-dev.firebaseapp.com',
    projectId: 'civicconnect-dev',
    storageBucket: 'civicconnect-dev.firebasestorage.app',
    messagingSenderId: '12345',
    appId: '1:12345:web:mock',
  },
}))

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  connectAuthEmulator: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  connectFirestoreEmulator: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
  ref: vi.fn((_storage, path) => ({ _path: path })),
  uploadBytes: vi.fn(() => Promise.resolve({})),
  getDownloadURL: vi.fn(() =>
    Promise.resolve('https://storage.googleapis.com/test-bucket/audio.webm')
  ),
}))

vi.mock('./services', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
}))

describe('Firebase Audio Storage Helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateComplaintAudio', () => {
    it('rejects when no audio is provided', () => {
      const result = validateComplaintAudio(null, 10)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Please record an audio note.')
    })

    it('rejects an empty audio recording', () => {
      const audio = new Blob([], { type: 'audio/webm' })
      const result = validateComplaintAudio(audio, 10)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('The audio recording is empty.')
    })

    it('rejects unsupported audio formats', () => {
      const audio = new Blob(['voice'], { type: 'text/plain' })
      const result = validateComplaintAudio(audio, 10)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Unsupported audio format')
    })

    it('rejects recordings longer than 60 seconds', () => {
      const audio = new Blob(['voice'], { type: 'audio/webm' })
      const result = validateComplaintAudio(audio, 61)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('60 seconds')
    })

    it('rejects zero-second recordings', () => {
      const audio = new Blob(['voice'], { type: 'audio/webm' })
      const result = validateComplaintAudio(audio, 0)

      expect(result.valid).toBe(false)
    })

    it('accepts a valid audio recording', () => {
      const audio = new Blob(['voice'], { type: 'audio/webm' })
      const result = validateComplaintAudio(audio, 30)

      expect(result.valid).toBe(true)
    })

    it('allows a recording of exactly 60 seconds', () => {
      const audio = new Blob(['voice'], { type: 'audio/webm' })
      const result = validateComplaintAudio(
        audio,
        MAX_AUDIO_DURATION_SECONDS
      )

      expect(result.valid).toBe(true)
    })
  })

  describe('uploadComplaintAudio', () => {
    it('uploads audio to the complaint audio folder', async () => {
      const { ref, uploadBytes, getDownloadURL } =
        await import('firebase/storage')

      const fakeStorage = {}
      const audio = new Blob(['voice-content'], {
        type: 'audio/webm',
      })

      const result = await uploadComplaintAudio(
        audio,
        'CMP-2026-0001',
        30,
        fakeStorage
      )

      expect(ref).toHaveBeenCalledWith(
        fakeStorage,
        expect.stringMatching(
          /^complaint-audio\/CMP-2026-0001\/voice-note-\d+\.webm$/
        )
      )

      expect(uploadBytes).toHaveBeenCalledWith(
        expect.anything(),
        audio,
        { contentType: 'audio/webm' }
      )

      expect(getDownloadURL).toHaveBeenCalled()

      expect(result.downloadUrl).toBe(
        'https://storage.googleapis.com/test-bucket/audio.webm'
      )
      expect(result.durationSeconds).toBe(30)
      expect(result.contentType).toBe('audio/webm')
      expect(result.path).toMatch(
        /^complaint-audio\/CMP-2026-0001\/voice-note-\d+\.webm$/
      )
    })

    it('rejects upload when complaint ID is missing', async () => {
      const audio = new Blob(['voice'], { type: 'audio/webm' })

      await expect(
        uploadComplaintAudio(audio, '', 10, {})
      ).rejects.toThrow('A valid complaint ID is required for audio upload.')
    })

    it('does not upload invalid audio', async () => {
      const { uploadBytes } = await import('firebase/storage')
      const audio = new Blob(['voice'], { type: 'text/plain' })

      await expect(
        uploadComplaintAudio(audio, 'CMP-2026-0001', 10, {})
      ).rejects.toThrow('Unsupported audio format')

      expect(uploadBytes).not.toHaveBeenCalled()
    })
  })
})
