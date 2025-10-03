export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">MegaConvert</h1>
        <p className="mb-6">Full-stack conversion suite. Use the Upload page to test file uploads.</p>
        <a className="inline-block bg-blue-600 text-white px-4 py-2 rounded" href="/upload">Go to Upload</a>
      </div>
    </div>
  )
}
