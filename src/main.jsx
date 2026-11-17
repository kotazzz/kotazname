import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { QrPage } from './components/QrOverlay.jsx'

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

const path = window.location.pathname.replace(/\/+$/, '') || '/'

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
