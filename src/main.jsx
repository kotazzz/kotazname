import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { QrPage } from './components/QrOverlay.jsx'

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

const path = window.location.pathname.replace(/\/+$/, '') || '/'

// Passkey привязан к RP ID kotaz.name — админка живёт только на основном домене.
const adminHosts = new Set(['kotaz.name', 'localhost', '127.0.0.1'])
if (path === '/admin' && !adminHosts.has(window.location.hostname) && window.location.hostname !== '') {
  window.location.replace(`https://kotaz.name/admin${window.location.search}`)
}

let page
if (path === '/admin') {
  page = (
    <Suspense fallback={<div className="boot">…</div>}>
      <AdminApp />
    </Suspense>
  )
} else if (path === '/qr') {
  page = <QrPage />
} else {
  page = <App />
}

createRoot(document.getElementById('root')).render(<StrictMode>{page}</StrictMode>)
