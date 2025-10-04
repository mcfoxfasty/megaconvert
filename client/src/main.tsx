import React, { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import AppLayout from './App.jsx'

const Home = React.lazy(() => import('./routes/Home'))
const Upload = React.lazy(() => import('./routes/Upload'))
const Audio = React.lazy(() => import('./routes/Audio'))
const Video = React.lazy(() => import('./routes/Video'))
const Image = React.lazy(() => import('./routes/Image'))
const Document = React.lazy(() => import('./routes/Document'))
const Archive = React.lazy(() => import('./routes/Archive'))
const Presentation = React.lazy(() => import('./routes/Presentation'))
const Font = React.lazy(() => import('./routes/Font'))
const Ebook = React.lazy(() => import('./routes/Ebook'))
const Batch = React.lazy(() => import('./routes/Batch'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Suspense fallback={<div className="p-6">Loading...</div>}><Home /></Suspense> },
      { path: 'upload', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Upload /></Suspense> },
      { path: 'audio', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Audio /></Suspense> },
      { path: 'video', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Video /></Suspense> },
      { path: 'image', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Image /></Suspense> },
      { path: 'document', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Document /></Suspense> },
      { path: 'archive', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Archive /></Suspense> },
      { path: 'presentation', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Presentation /></Suspense> },
      { path: 'font', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Font /></Suspense> },
      { path: 'ebook', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Ebook /></Suspense> },
      { path: 'batch', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Batch /></Suspense> },
    ]
  }
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
