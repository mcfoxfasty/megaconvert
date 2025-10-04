import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Menu,
  X,
  Home as HomeIcon,
  AudioLines,
  Video,
  Image as ImageIcon,
  FileText,
  Archive,
  Presentation,
  Type as TypeIcon,
  BookOpen,
  Layers,
  Sun,
  Moon
} from 'lucide-react'

// Theme Context
const ThemeContext = createContext({ theme: 'light', toggle: () => {} })
export const useTheme = () => useContext(ThemeContext)

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') setTheme(saved)
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark')
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const value = useMemo(() => ({ theme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function Header({ onToggleSidebar }) {
  const { theme, toggle } = useTheme()
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onToggleSidebar} className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800" aria-label="Toggle menu">
            <Menu className="h-5 w-5" />
          </button>
          <a href="/" className="flex items-center gap-2 font-bold">
            <Layers className="h-6 w-6 text-blue-600" />
            <span className="text-lg">MegaConvert</span>
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </header>
  )
}

function Sidebar({ open, onClose }) {
  const location = useLocation()
  const links = [
    { to: '/', label: 'Home', icon: HomeIcon },
    { to: '/audio', label: 'Audio', icon: AudioLines },
    { to: '/video', label: 'Video', icon: Video },
    { to: '/image', label: 'Image', icon: ImageIcon },
    { to: '/document', label: 'Document', icon: FileText },
    { to: '/archive', label: 'Archive', icon: Archive },
    { to: '/presentation', label: 'Presentation', icon: Presentation },
    { to: '/font', label: 'Font', icon: TypeIcon },
    { to: '/ebook', label: 'Ebook', icon: BookOpen },
    { to: '/batch', label: 'Batch', icon: Layers },
  ]

  const SidebarContent = (
    <div className="h-full w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4">
      <nav className="space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) => [
              'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
              isActive || location.pathname === to
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
            ].join(' ')}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )

  return (
    <>
      {/* Mobile Drawer */}
      <div className={`fixed inset-0 z-40 bg-black/30 transition-opacity md:hidden ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-white dark:bg-gray-900 shadow-lg transition-transform md:static md:translate-x-0 md:shadow-none ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 font-semibold"><Layers className="h-5 w-5 text-blue-600" /> Menu</div>
          <button onClick={onClose} className="rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800" aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        {SidebarContent}
      </div>
    </>
  )
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 py-4 text-sm text-gray-600 dark:text-gray-300">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4">
        <p>© {new Date().getFullYear()} MegaConvert</p>
        <div className="space-x-4">
          <a className="hover:underline" href="https://github.com/mcfoxfasty/megaconvert" target="_blank" rel="noreferrer">GitHub</a>
          <a className="hover:underline" href="/" onClick={(e)=>e.preventDefault()}>Privacy</a>
          <a className="hover:underline" href="/" onClick={(e)=>e.preventDefault()}>Terms</a>
        </div>
      </div>
    </footer>
  )
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const closeSidebar = () => setSidebarOpen(false)
  const toggleSidebar = () => setSidebarOpen(o => !o)

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 text-gray-900 transition-colors dark:bg-gray-950 dark:text-gray-50">
        <Header onToggleSidebar={toggleSidebar} />
        <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-[18rem_1fr] lg:grid-cols-[18rem_1fr]">
          <Sidebar open={sidebarOpen} onClose={closeSidebar} />
          <main className="min-h-[calc(100vh-4rem)] p-4">
            <div className="animate-fade-in rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors dark:border-gray-800 dark:bg-gray-900">
              <Outlet />
            </div>
          </main>
        </div>
        <Footer />
      </div>
    </ThemeProvider>
  )
}
