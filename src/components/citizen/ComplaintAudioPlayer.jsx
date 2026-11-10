
import { Headphones } from 'lucide-react'

export default function ComplaintAudioPlayer({ audioNote }) {
  if (!audioNote?.url) return null

  const duration = Number(audioNote.durationSeconds) || 0

  return (
    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
        <Headphones className="h-4 w-4 text-primary-600 dark:text-primary-400" />
        Voice Note
      </h3>

      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
        <audio
          controls
          preload="metadata"
          src={audioNote.url}
          className="w-full"
          aria-label="Complaint voice note"
        >
          Your browser does not support audio playback.
        </audio>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Duration: {Math.floor(duration / 60)}:
          {String(duration % 60).padStart(2, '0')}
        </p>
      </div>
    </div>
  )
}
