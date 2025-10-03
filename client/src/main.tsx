import React, { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'

const Home = React.lazy(() => import('./routes/Home'))
const Upload = React.lazy(() => import('./routes/Upload'))

const router = createBrowserRouter([
  { path: '/', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Home /></Suspense> },
  { path: '/upload', element: <Suspense fallback={<div className="p-6">Loading...</div>}><Upload /></Suspense> }
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
