import { useCallback, useEffect, useState } from 'react'
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { Fingerprint, KeyRound, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import Messages from './Messages.jsx'
import Links from './Links.jsx'
import AboutEditor from './AboutEditor.jsx'
import ProjectsAdmin from './ProjectsAdmin.jsx'
import Passkeys from './Passkeys.jsx'
import './admin.css'

const TABS = [
  ['messages', 'Сообщения'],
  ['links', 'Ссылки'],
  ['projects', 'Проекты'],
  ['about', 'Обо мне'],
  ['passkeys', 'Passkey'],
]

/** Панель администратора: вход только по passkey, без паролей. */
export default function AdminApp() {
  const [session, setSession] = useState(null) // { registered, authenticated }
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [keyName, setKeyName] = useState('')
  const [tab, setTab] = useState('messages')
  const [unread, setUnread] = useState(0)

  const supported = browserSupportsWebAuthn()

  const refresh = useCallback(() => {
    api
      .get('/api/auth/session')
      .then(setSession)
      .catch(() => setSession({ registered: false, authenticated: false }))
  }, [])

  useEffect(refresh, [refresh])

  function fail(err) {
    const map = {
      bad_setup_token: 'Неверный токен настройки',
      unauthorized: 'Сессия истекла — войдите снова',
      verification_failed: 'Passkey не принят, попробуйте ещё раз',
      state_changed: 'Состояние изменилось, обновите страницу',
      not_registered: 'Passkey ещё не зарегистрирован',
    }
    setError(map[err.code] || `Ошибка: ${err.code || err.message}`)
  }

  async function registerPasskey(event) {
    event?.preventDefault()
    setError('')
    setBusy('register')
    try {
      const body = session.registered ? {} : { setupToken: setupToken.trim() }
      const { challengeId, options } = await api.post('/api/auth/register/options', body)
      const response = await startRegistration({ optionsJSON: options })
      await api.post('/api/auth/register/verify', { challengeId, response, name: keyName.trim() })
      setSetupToken('')
      setKeyName('')
      refresh()
      if (!session.registered) setSession({ registered: true, authenticated: true })
    } catch (err) {
      if (err.name !== 'NotAllowedError') fail(err)
    } finally {
      setBusy('')
    }
  }

  async function login() {
    setError('')
    setBusy('login')
    try {
      const { challengeId, options } = await api.post('/api/auth/login/options')
      const response = await startAuthentication({ optionsJSON: options })
      await api.post('/api/auth/login/verify', { challengeId, response })
      refresh()
    } catch (err) {
      if (err.name !== 'NotAllowedError') fail(err)
    } finally {
      setBusy('')
    }
  }

  async function logout() {
    await api.post('/api/auth/logout').catch(() => {})
    refresh()
  }

  if (!session) {
    return (
      <div className="adm-boot">
        <LoaderCircle className="spin" size={20} />
      </div>
    )
  }

  // --- Экран входа / первичной настройки ------------------------------------
  if (!session.authenticated) {
    return (
      <div className="adm-auth">
        <div className="adm-auth-card">
          <h1>
            <Fingerprint size={22} aria-hidden="true" /> админка kot_az
          </h1>
          {!supported && <p className="adm-error">Этот браузер не поддерживает passkey (WebAuthn).</p>}
          {error && <p className="adm-error">{error}</p>}
          {session.registered ? (
            <>
              <p className="adm-hint">Вход только по passkey. Никаких паролей.</p>
              <button type="button" className="adm-primary" onClick={login} disabled={!supported || busy === 'login'}>
                {busy === 'login' ? <LoaderCircle size={15} className="spin" /> : <KeyRound size={15} />}
                Войти с passkey
              </button>
            </>
          ) : (
            <form onSubmit={registerPasskey}>
              <p className="adm-hint">
                Первичная настройка. Введите одноразовый токен из логов сервера и зарегистрируйте первый passkey.
              </p>
              <label className="adm-field">
                <span>Токен настройки</span>
                <input
                  type="text"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="adm-field">
                <span>Название ключа (например, «Ноут»)</span>
                <input type="text" value={keyName} onChange={(e) => setKeyName(e.target.value)} autoComplete="off" />
              </label>
              <button type="submit" className="adm-primary" disabled={!supported || !setupToken.trim() || busy === 'register'}>
                {busy === 'register' ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />}
                Зарегистрировать passkey
              </button>
            </form>
          )}
          <a className="adm-back" href="/">
            ← на сайт
          </a>
        </div>
      </div>
    )
  }

  // --- Панель ---------------------------------------------------------------
  return (
    <div className="adm">
      <header className="adm-top">
        <h1>админка</h1>
        <nav className="adm-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'is-active' : ''}
              onClick={() => setTab(id)}
            >
              {label}
              {id === 'messages' && unread > 0 && <b className="adm-badge">{unread}</b>}
            </button>
          ))}
        </nav>
        <div className="adm-top-actions">
          <a href="/" className="adm-icon-btn" title="На сайт">
            ← kotaz.name
          </a>
          <button type="button" className="adm-icon-btn" onClick={logout} title="Выйти">
            <LogOut size={15} />
          </button>
        </div>
      </header>
      <main className="adm-main">
        {tab === 'messages' && <Messages onUnread={setUnread} />}
        {tab === 'links' && <Links />}
        {tab === 'projects' && <ProjectsAdmin />}
        {tab === 'about' && <AboutEditor />}
        {tab === 'passkeys' && <Passkeys />}
      </main>
    </div>
  )
}
