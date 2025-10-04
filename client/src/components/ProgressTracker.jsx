import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, PauseCircle, Loader2 } from 'lucide-react'

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.floor(n)))

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  const m = Math.floor((sec / 60) % 60).toString().padStart(2, '0')
  const h = Math.floor(sec / 3600)
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

export default function ProgressTracker({
  mode = 'linear', // 'linear' | 'circular'
  percent = 0,
  status = 'queued', // queued | processing | completed | failed
  step = 'Initializing',
  message = '',
  filename = '',
  etaSeconds = null,
  onCancel,
  className = ''
}) {
  const p = clamp(percent)
  const [startTs] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (status === 'processing') {
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTs) / 1000)), 500)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [status, startTs])

  const color = useMemo(() => {
    switch (status) {
      case 'processing': return 'text-blue-600';
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'queued':
      default: return 'text-gray-500';
    }
  }, [status])

  const barBg = 'bg-gray-200 dark:bg-gray-700'
  const barFg = status === 'completed' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : status === 'queued' ? 'bg-gray-400' : 'bg-blue-500'

  const spinner = <Loader2 className="h-4 w-4 animate-spin" />
  const icon = status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : status === 'failed' ? <XCircle className="h-5 w-5" /> : status === 'queued' ? <PauseCircle className="h-5 w-5" /> : spinner

  return (
    <div className={["rounded-lg border border-gray-200 p-4 dark:border-gray-800", className].join(' ')}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={[color, 'inline-flex items-center gap-2 font-medium'].join(' ')}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={status} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.2 }} className="inline-flex items-center gap-2">
                {icon}
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </motion.span>
            </AnimatePresence>
          </span>
          {filename ? <span className="truncate text-sm text-gray-600 dark:text-gray-300">• {filename}</span> : null}
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-200">{p}%</div>
      </div>

      {mode === 'linear' ? (
        <div className={`h-2 w-full overflow-hidden rounded-full ${barBg}`}>
          <motion.div
            className={`h-full ${barFg}`}
            initial={{ width: 0 }}
            animate={{ width: `${p}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      ) : (
        <div className="mx-auto my-2 grid place-items-center">
          <div className="relative h-20 w-20">
            <svg viewBox="0 0 36 36" className="h-20 w-20">
              <path className="text-gray-200 dark:text-gray-700" stroke="currentColor" strokeWidth="3" fill="none" d="M18 2 a 16 16 0 0 1 0 32 a 16 16 0 0 1 0 -32" />
              <motion.path
                className={barFg.replace('bg-', 'text-')}
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: p / 100 }}
                transition={{ duration: 0.3 }}
                d="M18 2 a 16 16 0 0 1 0 32 a 16 16 0 0 1 0 -32"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-sm font-medium">{p}%</div>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-2">
          <span>Step:</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={step} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.2 }} className="font-medium">
              {step}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-4">
          <span>Elapsed: {formatTime(elapsed)}</span>
          <span>ETA: {formatTime(etaSeconds)}</span>
        </div>
      </div>

      <AnimatePresence>
        {(message && status !== 'failed') ? (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between">
        <div className="h-5">
          <AnimatePresence>
            {status === 'completed' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium text-green-600">
                Completed successfully
              </motion.div>
            )}
            {status === 'failed' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium text-red-600">
                Something went wrong
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div>
          {status === 'processing' && typeof onCancel === 'function' && (
            <button onClick={onCancel} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
