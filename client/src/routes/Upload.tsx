import { useState } from 'react'

export default function Upload() {
  const [files, setFiles] = useState<FileList | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files || files.length === 0) return
    setLoading(true)
    try {
      const form = new FormData()
      // use "file" field name compatible with backend
      form.append('file', files[0])
      const res = await fetch('http://localhost:5001/api/upload', {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      setResult(json)
    } catch (err) {
      setResult({ error: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Upload</h1>
        <form onSubmit={submit} className="space-y-4">
          <input type="file" onChange={(e) => setFiles(e.target.files)} className="block" />
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded">
            {loading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
        <pre className="mt-6 bg-white border p-3 rounded text-sm overflow-auto">{result ? JSON.stringify(result, null, 2) : 'No result yet'}</pre>
      </div>
    </div>
  )
}
