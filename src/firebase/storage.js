
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from './services'

export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/jpg']

/**
 * Validates a photo file for complaint attachment.
 * - Must be within 5MB limit
 * - Must be image/jpeg or image/png format
 *
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateComplaintPhoto(file) {
  if (!file) {
    return { valid: false, error: 'Please select a photo file.' }
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'The selected file is empty. Please select a valid photo.',
    }
  }

  const normalizedType = (file.type || '').toLowerCase()
  const ext = (file.name || '').split('.').pop()?.toLowerCase()
  const isAllowedType =
    ALLOWED_PHOTO_TYPES.includes(normalizedType) ||
    (!normalizedType && ['jpg', 'jpeg', 'png'].includes(ext))

  if (!isAllowedType) {
    return {
      valid: false,
      error: 'Invalid file format. Only JPG and PNG images are supported.',
    }
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return {
      valid: false,
      error: 'File size exceeds 5MB limit. Please select a smaller photo.',
    }
  }

  return { valid: true }
}

/**
 * Sanitizes a filename to prevent path traversal or invalid characters.
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name = 'photo.jpg') {
  const base = name.replace(/^.*[\\/]/, '')
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  return safe || 'photo.jpg'
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    if (typeof FileReader === 'undefined') {
      resolve('https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800')
      return
    }

    const reader = new FileReader()
    reader.onerror = () => {
      resolve('https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800')
    }
    reader.onload = () => {
      const result = reader.result
      // Non-string or already compact data URL
      if (typeof result !== 'string' || result.length < 256 * 1024) {
        resolve(result)
        return
      }

      // In browser runtime, downscale large dev mock images to keep Firestore doc comfortably under 1MB limit
      if (typeof window !== 'undefined' && typeof Image !== 'undefined' && typeof document !== 'undefined') {
        try {
          const img = new Image()
          img.onload = () => {
            const maxDim = 800
            let { width, height } = img
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width)
                width = maxDim
              } else {
                width = Math.round((width * maxDim) / height)
                height = maxDim
              }
            }
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height)
              resolve(canvas.toDataURL('image/jpeg', 0.8))
              return
            }
            resolve(result)
          }
          img.onerror = () => resolve(result)
          img.src = result
          return
        } catch {
          resolve(result)
          return
        }
      }

      resolve(result)
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Uploads a complaint photo to Firebase Cloud Storage.
 * Path: complaint-photos/{complaintId}/{filename}
 *
 * In local dev without storage backend, setting VITE_MOCK_STORAGE=true
 * allows testing the full attachment UI, previews, and zoom without blocking.
 *
 * @param {File} file
 * @param {string} complaintId
 * @param {object} [customStorage] - Optional storage instance for testing
 * @returns {Promise<{ downloadUrl: string, path: string, filename: string }>}
 */
export async function uploadComplaintPhoto(file, complaintId, customStorage = storage) {
  if (!complaintId) {
    throw new Error('A valid complaint ID is required for photo upload.')
  }

  const validation = validateComplaintPhoto(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const cleanFilename = sanitizeFilename(file.name)
  const storagePath = `complaint-photos/${complaintId}/${cleanFilename}`

  // Dev fixture mode: stub upload with data URL so frontend UI/state testing is unblocked.
  // In automated test runs (MODE === 'test'), do not bypass when custom test storage is passed.
  const isDevFixture =
    import.meta.env.VITE_MOCK_STORAGE === 'true' &&
    (import.meta.env.MODE !== 'test' || customStorage === storage || !customStorage)

  if (isDevFixture) {
    const downloadUrl = await readFileAsDataURL(file)
    return {
      downloadUrl,
      path: storagePath,
      filename: cleanFilename,
    }
  }

  try {
    const storageRef = ref(customStorage, storagePath)
    await uploadBytes(storageRef, file, {
      contentType: file.type || 'image/jpeg',
    })

    const downloadUrl = await getDownloadURL(storageRef)

    return {
      downloadUrl,
      path: storagePath,
      filename: cleanFilename,
    }
  } catch (err) {
    if (
      import.meta.env.DEV &&
      import.meta.env.MODE !== 'test' &&
      import.meta.env.VITE_USE_EMULATORS !== 'true'
    ) {
      console.warn(
        'Firebase Storage upload failed; falling back to dev fixture data URL so filing is unblocked:',
        err
      )
      const downloadUrl = await readFileAsDataURL(file)
      return {
        downloadUrl,
        path: storagePath,
        filename: cleanFilename,
      }
    }
    throw err
  }
}

// ============================================================
// AUDIO RECORDING CONFIGURATION
// ============================================================

export const MAX_AUDIO_DURATION_SECONDS = 60

export const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/aac',
]

/**
 * Validates a complaint voice recording.
 */
export function validateComplaintAudio(audioBlob, durationSeconds) {
  if (!audioBlob) {
    return { valid: false, error: 'Please record an audio note.' }
  }

  if (audioBlob.size === 0) {
    return { valid: false, error: 'The audio recording is empty.' }
  }

  const mimeType = (audioBlob.type || '').toLowerCase().split(';')[0].trim()

  if (!ALLOWED_AUDIO_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: 'Unsupported audio format. Please record in a supported audio format.',
    }
  }

  if (
    durationSeconds !== undefined &&
    (!Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > MAX_AUDIO_DURATION_SECONDS)
  ) {
    return {
      valid: false,
      error: 'Audio recording must be between 1 and 60 seconds.',
    }
  }

  return { valid: true }
}

/**
 * Uploads a complaint voice recording to Firebase Storage.
 * Path: complaint-audio/{complaintId}/{filename}
 */
export async function uploadComplaintAudio(
  audioBlob,
  complaintId,
  durationSeconds,
  customStorage = storage
) {
  if (!complaintId) {
    throw new Error('A valid complaint ID is required for audio upload.')
  }

  const validation = validateComplaintAudio(audioBlob, durationSeconds)

  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const mimeType = (audioBlob.type || '').toLowerCase().split(';')[0].trim()

  const extensions = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
  }

  const extension = extensions[mimeType]
  const filename = sanitizeFilename(
    `voice-note-${Date.now()}.${extension}`
  )

  const storagePath = `complaint-audio/${complaintId}/${filename}`
  const storageRef = ref(customStorage, storagePath)

  await uploadBytes(storageRef, audioBlob, {
    contentType: mimeType,
  })

  const downloadUrl = await getDownloadURL(storageRef)

  return {
    downloadUrl,
    path: storagePath,
    filename,
    durationSeconds,
    contentType: mimeType,
  }
}
