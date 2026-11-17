import { useCallback, useEffect, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { Check, Fingerprint, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'

const fmtDate = (ms) =>
  ms ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms) : '—'

/** Управление passkey: список, переименование, удаление, добавление нового. */
export default function Passkeys() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [renameId, setRenameId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/auth/passkeys')
      setItems(data.items)
      setError('')
    } catch (err) {
      setError(err.code)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addKey(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { challengeId, options } = await api.post('/api/auth/register/options', {})
      const response = await startRegistration({ optionsJSON: options })
      await api.post('/api/auth/register/verify', { challengeId, response, name: name.trim() })
      setName('')
      await load()
    } catch (err) {
      if (err.name !== 'NotAllowedError') setError(err.code)
    } finally {
      setBusy(false)
    }
  }

  async function rename(id) {
    if (!renameValue.trim()) {
      setRenameId(null)
      return
    }
    await api.patch(`/api/auth/passkeys/${encodeURIComponent(id)}`, { name: renameValue.trim() }).catch(() => {})
    setRenameId(null)
    setItems((prev) => prev.map((k) => (k.id === id ? { ...k, name: renameValue.trim() } : k)))
  }

  async function remove(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      window.setTimeout(() => setConfirmDelete((v) => (v === id ? null : v)), 3000)
      return
    }
    try {
      await api.del(`/api/auth/passkeys/${encodeURIComponent(id)}`)
      setItems((prev) => prev.filter((k) => k.id !== id))
    } catch (err) {
      setError(err.code === 'last_passkey' ? 'Последний passkey удалить нельзя' : err.code)
    }
    setConfirmDelete(null)
  }

  if (loading) {
    return (
      <p className="adm-loading">
        <LoaderCircle size={15} className="spin" />
      </p>
    )
  }

  return (
    <section className="adm-section">
      <div className="adm-bar">
        <h2>
          <Fingerprint size={16} /> Passkey
        </h2>
      </div>
      {error && <p className="adm-error">{error}</p>}
      <ul className="key-list">
        {items.map((key) => (
          <li key={key.id} className="key-row">
            <ShieldCheck size={16} className="key-icon" />
            <div className="key-main">
              {renameId === key.id ? (
                <form
                  className="key-rename"
                  onSubmit={(e) => {
                    e.preventDefault()
                    rename(key.id)
                  }}
                >
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                  <button type="submit" className="adm-btn">
                    <Check size={13} />
                  </button>
                </form>
              ) : (
                <b>{key.name || 'Passkey'}</b>
              )}
              <span className="adm-dim">
                добавлен {fmtDate(key.createdAt)} · использовался {fmtDate(key.lastUsedAt)}
                {key.deviceType === 'multiDevice' ? ' · синхронизируется' : ''}
              </span>
            </div>
            <div className="link-actions">
              <button
                type="button"
                className="adm-btn"
                onClick={() => {
                  setRenameId(key.id)
                  setRenameValue(key.name)
                }}
                title="Переименовать"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className={`adm-btn adm-danger${confirmDelete === key.id ? ' is-armed' : ''}`}
                onClick={() => remove(key.id)}
                title="Удалить"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="key-add" onSubmit={addKey}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название нового ключа (например, «Телефон»)"
        />
        <button type="submit" className="adm-primary" disabled={busy}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />}
          добавить passkey
        </button>
      </form>
    </section>
  )
}
