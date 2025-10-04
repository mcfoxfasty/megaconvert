import { useEffect, useMemo, useState } from 'react'

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Field({ label, children, help }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
      {help ? <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">{help}</span> : null}
    </label>
  )
}

const Select = (props) => (
  <select
    {...props}
    className={[
      'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors',
      'focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900'
    ].join(' ')}
  />
)

const Input = (props) => (
  <input
    {...props}
    className={[
      'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors',
      'focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900'
    ].join(' ')}
  />
)

const Checkbox = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" className="h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
)

const Slider = ({ value, onChange, min = 0, max = 100, step = 1 }) => (
  <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
)

export default function ConversionOptions({ type, value, onChange }) {
  const [local, setLocal] = useState(value || {})

  useEffect(() => { setLocal(value || {}) }, [value])
  useEffect(() => { if (typeof onChange === 'function') onChange(local) }, [local])

  const set = (patch) => setLocal(prev => ({ ...prev, ...patch }))

  const content = useMemo(() => {
    switch ((type || '').toLowerCase()) {
      case 'audio':
        return (
          <div className="space-y-4 animate-fade-in">
            <Section title="Format & Quality">
              <Field label="Output format">
                <Select value={local.outputFormat || ''} onChange={(e) => set({ outputFormat: e.target.value })}>
                  <option value="">Select…</option>
                  {['mp3','wav','ogg','m4a','flac','aac','opus'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </Select>
              </Field>
              <Field label="Bitrate">
                <Select value={local.bitrate || ''} onChange={(e) => set({ bitrate: e.target.value })}>
                  <option value="">Auto</option>
                  {['128k','192k','256k','320k'].map(b => <option key={b} value={b}>{b}</option>)}
                </Select>
              </Field>
              <Field label="Sample rate">
                <Select value={local.sampleRate || ''} onChange={(e) => set({ sampleRate: Number(e.target.value) || undefined })}>
                  <option value="">Auto</option>
                  {[44100,48000].map(sr => <option key={sr} value={sr}>{sr} Hz</option>)}
                </Select>
              </Field>
              <Field label="Channels">
                <Select value={local.channels || ''} onChange={(e) => set({ channels: e.target.value })}>
                  <option value="">Original</option>
                  <option value="mono">Mono</option>
                  <option value="stereo">Stereo</option>
                </Select>
              </Field>
            </Section>
          </div>
        )

      case 'video':
        return (
          <div className="space-y-4 animate-fade-in">
            <Section title="Format & Quality">
              <Field label="Output format">
                <Select value={local.outputFormat || ''} onChange={(e) => set({ outputFormat: e.target.value })}>
                  <option value="">Select…</option>
                  {['mp4','mkv','webm','avi'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </Select>
              </Field>
              <Field label="Quality preset">
                <Select value={local.quality || 'medium'} onChange={(e) => set({ quality: e.target.value })}>
                  {['low','medium','high','ultra'].map(q => <option key={q} value={q}>{q}</option>)}
                </Select>
              </Field>
              <Field label="Resolution">
                <Select value={local.resolution || ''} onChange={(e) => set({ resolution: e.target.value })}>
                  <option value="">Original</option>
                  {['426x240','640x360','854x480','1280x720','1920x1080','2560x1440','3840x2160'].map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="FPS">
                <Select value={local.fps || ''} onChange={(e) => set({ fps: Number(e.target.value) || undefined })}>
                  <option value="">Original</option>
                  {[24,25,30,48,50,60].map(f => <option key={f} value={f}>{f}</option>)}
                </Select>
              </Field>
              <Field label="Codec">
                <Select value={local.codec || ''} onChange={(e) => set({ codec: e.target.value })}>
                  <option value="">Auto</option>
                  {['h264','h265','vp9','av1'].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </Select>
              </Field>
              <Field label="Compression">
                <Slider value={Number.isFinite(local.compression) ? local.compression : 50} onChange={(v) => set({ compression: v })} />
              </Field>
            </Section>
          </div>
        )

      case 'image':
        return (
          <div className="space-y-4 animate-fade-in">
            <Section title="Format & Quality">
              <Field label="Output format">
                <Select value={local.outputFormat || ''} onChange={(e) => set({ outputFormat: e.target.value })}>
                  <option value="">Select…</option>
                  {['jpg','png','webp','gif','bmp','tiff','avif','ico'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </Select>
              </Field>
              <Field label="Quality">
                <Slider min={1} max={100} value={Number.isFinite(local.quality) ? local.quality : 80} onChange={(v) => set({ quality: v })} />
              </Field>
            </Section>

            <Section title="Resize">
              <Field label="Width (px)">
                <Input type="number" min={1} value={local.width ?? ''} onChange={(e) => set({ width: e.target.value ? Math.max(1, parseInt(e.target.value)) : undefined })} />
              </Field>
              <Field label="Height (px)">
                <Input type="number" min={1} value={local.height ?? ''} onChange={(e) => set({ height: e.target.value ? Math.max(1, parseInt(e.target.value)) : undefined })} />
              </Field>
              <Field label="Scale (%)">
                <Input type="number" min={1} max={10000} value={local.scale ?? ''} onChange={(e) => set({ scale: e.target.value ? Math.max(1, Math.min(10000, parseInt(e.target.value))) : undefined })} />
              </Field>
              <Field label="Maintain aspect ratio">
                <Checkbox checked={!!local.keepAspect} onChange={(v) => set({ keepAspect: v })} label="Keep original proportions" />
              </Field>
              <Field label="Optimization">
                <Checkbox checked={!!local.optimize} onChange={(v) => set({ optimize: v })} label="Enable format-specific optimization" />
              </Field>
            </Section>
          </div>
        )

      case 'document':
        return (
          <div className="space-y-4 animate-fade-in">
            <Section title="Format & Pages">
              <Field label="Output format">
                <Select value={local.outputFormat || ''} onChange={(e) => set({ outputFormat: e.target.value })}>
                  <option value="">Select…</option>
                  {['pdf','docx','txt','html','epub'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </Select>
              </Field>
              <Field label="Page range" help="e.g. 1-3,5,8">
                <Input type="text" value={local.pageRange || ''} onChange={(e) => set({ pageRange: e.target.value })} />
              </Field>
              <Field label="Compression level">
                <Select value={local.compression || ''} onChange={(e) => set({ compression: e.target.value })}>
                  <option value="">None</option>
                  {['low','medium','high'].map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Preserve formatting">
                <Checkbox checked={!!local.preserveFormatting} onChange={(v) => set({ preserveFormatting: v })} label="Try to keep original layout" />
              </Field>
            </Section>
          </div>
        )

      case 'archive':
        return (
          <div className="space-y-4 animate-fade-in">
            <Section title="Archive Options">
              <Field label="Output format">
                <Select value={local.outputFormat || ''} onChange={(e) => set({ outputFormat: e.target.value })}>
                  <option value="">Select…</option>
                  {['zip','7z','tar','gz','bz2','xz'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </Select>
              </Field>
              <Field label="Compression level (0-9)">
                <Input type="number" min={0} max={9} value={local.level ?? ''} onChange={(e) => set({ level: e.target.value === '' ? undefined : Math.max(0, Math.min(9, parseInt(e.target.value))) })} />
              </Field>
              <Field label="Password (optional)">
                <Input type="password" value={local.password || ''} onChange={(e) => set({ password: e.target.value })} />
              </Field>
            </Section>
          </div>
        )

      default:
        return <div className="text-sm text-gray-600 dark:text-gray-300">Select a category to see options.</div>
    }
  }, [type, local])

  return (
    <div className="space-y-4">
      {content}
    </div>
  )
}
