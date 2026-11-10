import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RotateCcw, Play, Pause, Trash2 } from 'lucide-react'

const MAX_DURATION = 60

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''

  const formats = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]

  return formats.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

export default function VoiceRecorder({ onRecordingComplete, disabled = false }) {
  const [status, setStatus] = useState('idle')
  const [seconds, setSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState('')
  const [error, setError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const audioRef = useRef(null)
  const secondsRef = useRef(0)
  const mountedRef = useRef(true)
  const audioUrlRef = useRef('')

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      clearInterval(timerRef.current)

      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }

      streamRef.current?.getTracks().forEach((track) => track.stop())

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
      }
    }
  }, [])

  const stopMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }

  const startRecording = async () => {
    setError('')

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      chunksRef.current = []
      secondsRef.current = 0
      setSeconds(0)

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )

      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        clearInterval(timerRef.current)
        stopMicrophone()

        if (mountedRef.current) {
          setStatus('idle')
          setError('An error occurred while recording. Please try again.')
        }
      }

      recorder.onstop = () => {
        clearInterval(timerRef.current)
        stopMicrophone()

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })

        if (!mountedRef.current) return

        if (blob.size === 0) {
          setStatus('idle')
          setError('No audio was recorded. Please try again.')
          return
        }

        const url = URL.createObjectURL(blob)

        setAudioUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl)
          audioUrlRef.current = url
          return url
        })

        setStatus('recorded')

        onRecordingComplete?.({
          blob,
          durationSeconds: secondsRef.current,
          contentType: blob.type,
        })
      }

      recorder.start()
      setStatus('recording')

      timerRef.current = setInterval(() => {
        secondsRef.current += 1
        setSeconds(secondsRef.current)

        if (secondsRef.current >= MAX_DURATION) {
          stopRecording()
        }
      }, 1000)
    } catch (err) {
      stopMicrophone()

      if (mountedRef.current) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Microphone permission denied. Please allow microphone access.')
        } else if (err.name === 'NotFoundError') {
          setError('No microphone was found on this device.')
        } else {
          setError('Unable to access the microphone. Please try again.')
        }

        setStatus('idle')
      }
    }
  }

  const discardRecording = () => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl)

    setAudioUrl('')
    audioUrlRef.current = ''
    setSeconds(0)
    secondsRef.current = 0
    setIsPlaying(false)
    setStatus('idle')
    setError('')
    onRecordingComplete?.(null)
  }

  const togglePlayback = async () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch {
        setError('Unable to play this recording.')
      }
    }
  }

  const formatTime = (value) => {
    const minutes = Math.floor(value / 60)
    const remainingSeconds = value % 60

    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Voice note</h3>
        <span className="text-sm text-gray-500">
          Maximum 60 seconds
        </span>
      </div>

      <div className="mb-4 flex items-center justify-center gap-3">
        <span
          className={`font-mono text-2xl font-semibold ${
            status === 'recording' ? 'text-red-600' : 'text-gray-700'
          }`}
        >
          {formatTime(seconds)}
        </span>

        {status === 'recording' && (
          <span className="flex items-center gap-1 text-sm text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
            Recording
          </span>
        )}
      </div>

      <div
        className="mb-4 flex h-12 items-center justify-center gap-1"
        aria-label="Audio waveform visualization"
      >
        {Array.from({ length: 30 }, (_, index) => (
          <span
            key={index}
            className={`w-1 rounded-full transition-all ${
              status === 'recording' ? 'animate-pulse bg-red-500' : 'bg-gray-300'
            }`}
            style={{
              height: status === 'recording'
                ? `${12 + ((index * 17) % 25)}px`
                : '8px',
              animationDelay: `${index * 35}ms`,
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {status === 'idle' && (
          <button
            type="button"
            disabled={disabled}
            onClick={startRecording}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic size={18} />
            Start recording
          </button>
        )}

        {status === 'recording' && (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-lg bg-gray-800 px-5 py-2.5 font-medium text-white hover:bg-gray-900"
          >
            <Square size={16} />
            Stop recording
          </button>
        )}

        {status === 'recorded' && (
          <>
            <button
              type="button"
              onClick={togglePlayback}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>

            <button
              type="button"
              onClick={discardRecording}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-100"
            >
              <Trash2 size={18} />
              Discard
            </button>

            <button
              type="button"
              onClick={discardRecording}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-100"
            >
              <RotateCcw size={18} />
              Record again
            </button>
          </>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <p className="mt-3 text-center text-xs text-gray-500">
        Allow microphone access when your browser asks.
      </p>
    </div>
  )
}
