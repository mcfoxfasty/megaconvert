import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UploadCloud, X, Image as ImageIcon, File as FileIcon } from 'lucide-react'

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return ''
  const sizes = ['B','KB','MB','GB','TB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}

function buildAcceptAttr(acceptedFormats) {
  if (!acceptedFormats || !acceptedFormats.length) return undefined
  return acceptedFormats.join(',')
}

function isAccepted(file, acceptedFormats) {
  if (!acceptedFormats || acceptedFormats.length === 0) return true
  const name = file.name.toLowerCase()
  const type = (file.type || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  return acceptedFormats.some((rule) => {
    const r = rule.toLowerCase().trim()
    if (r.endsWith('/*')) {
      const prefix = r.slice(0, -1) // keep '/'
      return type.startsWith(prefix)
    }
    if (r.startsWith('.')) {
      return ext === r
    }
    // exact mime
    return type === r
  })
}

export default function FileUpload({
  acceptedFormats = [],
  maxFileSize = 500 * 1024 * 1024, // 500MB default
  multiple = false,
  onFileSelect,
  placeholder = 'Drag & drop files here, paste, or click to browse'
}) {
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState([]) // { file, error?, previewUrl? }
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef(null)
  const rootRef = useRef(null)

  const acceptAttr = useMemo(() => buildAcceptAttr(acceptedFormats), [acceptedFormats])

  const clearTransient = () => {
    setError('')
    setSuccess(false)
  }

  const validateAndPrepare = useCallback((selected) => {
    const prepared = []
    for (const f of selected) {
      if (!isAccepted(f, acceptedFormats)) {
        prepared.push({ file: f, error: 'Unsupported type' })
        continue
      }
      if (maxFileSize && f.size > maxFileSize) {
        prepared.push({ file: f, error: `File too large (max ${formatBytes(maxFileSize)})` })
        continue
      }
      const previewable = (f.type || '').startsWith('image/')
      const previewUrl = previewable ? URL.createObjectURL(f) : undefined
      prepared.push({ file: f, previewUrl })
    }
    return prepared
  }, [acceptedFormats, maxFileSize])

  const handleFiles = useCallback((fileList) => {
    clearTransient()
    const arr = Array.from(fileList)
    const prepared = validateAndPrepare(multiple ? arr : arr.slice(0,1))
    // surface component-level error if all invalid
    if (prepared.every(p => !!p.error)) {
      setError(prepared.map(p => `${p.file.name}: ${p.error}`).join('\n'))
    }
    setFiles(prepared)
    // auto start upload via callback if provided
    if (typeof onFileSelect === 'function' && prepared.some(p => !p.error)) {
      setUploading(true)
      setProgress(0)
      const validFiles = prepared.filter(p => !p.error).map(p => p.file)
      const progressFn = (pct) => setProgress(Math.max(0, Math.min(100, Math.floor(pct))))
      Promise.resolve(onFileSelect(validFiles, progressFn))
        .then(() => { setSuccess(true); setError('') })
        .catch((e) => { setError(e?.message || 'Upload failed') })
        .finally(() => { setUploading(false); setTimeout(() => setSuccess(false), 1500) })
    }
  }, [multiple, onFileSelect, validateAndPrepare])

  const onInputChange = (e) => {
    if (e.target.files && e.target.files.length) handleFiles(e.target.files)
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer?.files && e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files)
    }
  }
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = (e) => { e.preventDefault(); setDragOver(false) }

  // Paste support
  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onPaste = (e) => {
      // Only handle if focus is inside component
      if (!node.contains(document.activeElement)) return
      const items = e.clipboardData?.items || []
      const files = []
      for (const it of items) {
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length) {
        handleFiles(files)
      }
    }
    node.addEventListener('paste', onPaste)
    return () => node.removeEventListener('paste', onPaste)
  }, [handleFiles])

  const removeFile = (idx) => {
    setFiles(prev => {
      const copy = [...prev]
      const item = copy[idx]
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      copy.splice(idx, 1)
      return copy
    })
  }

  useEffect(() => () => {
    // revoke previews on unmount
    files.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl) })
  }, [files])

  return (
    <div ref={rootRef} className="w-full">
      <div
        tabIndex={0}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all',
          'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800',
          dragOver ? 'border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.15)]' : 'border-gray-300 dark:border-gray-700',
          uploading ? 'opacity-90' : ''
        ].join(' ')}
        onClick={() => inputRef.current?.click()}
      >
        <div className="absolute inset-0 rounded-xl pointer-events-none">
          <div className={[
            'h-full w-full rounded-xl',
            dragOver ? 'animate-pulse ring-2 ring-inset ring-blue-500/40' : ''
          ].join(' ')} />
        </div>

        <UploadCloud className="h-10 w-10 text-blue-600" />
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{placeholder}</p>
        {acceptedFormats?.length ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Accepted: {acceptedFormats.join(', ')}</p>
        ) : null}
        {maxFileSize ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Max size: {formatBytes(maxFileSize)}</p>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple={multiple}
          onChange={onInputChange}
          accept={acceptAttr}
        />

        {uploading ? (
          <div className="mt-6 w-full max-w-md">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">Uploading… {progress}%</div>
          </div>
        ) : success ? (
          <div className="mt-4 text-sm font-medium text-green-600">Uploaded successfully</div>
        ) : error ? (
          <div className="mt-4 text-sm font-medium text-red-600 whitespace-pre-wrap">{error}</div>
        ) : null}
      </div>

      {/* Files list */}
      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex min-w-0 items-center gap-3">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.file.name} className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                    {item.file.type.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{item.file.name}</div>
                  <div className="truncate text-xs text-gray-600 dark:text-gray-300">{formatBytes(item.file.size)} • {(item.file.type || 'unknown')}</div>
                  {item.error && <div className="text-xs font-medium text-red-600">{item.error}</div>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="ml-3 inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
