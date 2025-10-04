import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Download, Trash2, Share2, RefreshCw, Image as ImageIcon, File as FileIcon } from 'lucide-react'

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export default function DownloadResult({
  file = { name: '', size: 0, format: '', url: '' },
  previewUrl = '', // optional image preview URL (blob or public path)
  original = { size: null, format: '' },
  tookSeconds = null,
  onDownload,
  onDelete,
  onConvertAnother,
  onShareCopy,
  className = ''
}) {
  const sizeReduction = (() => {
    if (!original?.size || !file?.size || original.size <= 0) return null
    const diff = original.size - file.size
    const pct = Math.max(0, Math.round((diff / original.size) * 100))
    return { diff, pct }
  })()

  useEffect(() => {
    // Placeholder for any mount side-effects if needed
  }, [])

  const isImage = /^(png|jpg|jpeg|gif|webp|bmp|tiff|avif|ico)$/i.test(file?.format || '')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className={[
        'relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/20',
        className,
      ].join(' ')}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 opacity-15">
        <CheckCircle2 className="h-28 w-28 text-emerald-400" />
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">Conversion complete!</h3>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-200/80">{original?.format?.toUpperCase()} → {file?.format?.toUpperCase()} • {tookSeconds ? `${Math.round(tookSeconds)}s` : ''}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onConvertAnother}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
          >
            <RefreshCw className="h-4 w-4" />
            Convert another file
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex items-center justify-between rounded-lg bg-white/70 p-4 backdrop-blur dark:bg-emerald-900/30">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                {isImage ? <ImageIcon className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-emerald-900 dark:text-emerald-100">{file?.name || 'download'}</div>
                <div className="text-xs text-emerald-700/80 dark:text-emerald-200/70">
                  {file?.format?.toUpperCase()} • {formatBytes(file?.size)}
                  {sizeReduction && sizeReduction.pct > 0 ? (
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">
                      −{sizeReduction.pct}%
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onShareCopy}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                title="Copy link"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
                title="Delete file"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={onDownload}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 dark:shadow-none"
            >
              <Download className="h-5 w-5 transition-transform group-hover:scale-110" />
              Download file
            </button>
          </div>
        </div>

        <div>
          <div className="overflow-hidden rounded-lg border border-emerald-200 bg-white/70 p-3 backdrop-blur dark:border-emerald-900/40 dark:bg-emerald-900/30">
            <div className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">Preview</div>
            <div className="grid place-items-center overflow-hidden rounded-md bg-emerald-50 p-2 dark:bg-emerald-900/40">
              <AnimatePresence mode="wait" initial={false}>
                {isImage && previewUrl ? (
                  <motion.img
                    key={previewUrl}
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-48 rounded"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-emerald-600 dark:text-emerald-300">
                    <FileIcon className="h-8 w-8" />
                    <div className="text-xs opacity-80">No preview available</div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
