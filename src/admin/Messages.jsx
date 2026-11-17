import { useCallback, useEffect, useState } from 'react'
import { CheckCheck, Download, Eye, EyeOff, Inbox, LoaderCircle, Paperclip, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'

const fmtSize = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} МБ` : bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} КБ` : `${bytes} Б`

const fmtDate = (ms) =>
  new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms)

/** Входящие анонимные сообщения. */
export default function Messages({ onUnread }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [previewId, setPreviewId] = useState(null)

  const load = useCallback(
    async (offset = 0, append = false) => {
      setLoading(true)
      try {
        const data = await api.get(`/api/admin/messages?limit=20&offset=${offset}&unread=${unreadOnly ? 1 : 0}`)
        setItems((prev) => (append ? [...prev, ...data.items] : data.items))
        setTotal(data.total)
        onUnread(data.unread)
        setError('')
      } catch (err) {
        setError(err.code)
      } finally {
        setLoading(false)
      }
    },
    [onUnread, unreadOnly],
  )

  useEffect(() => {
    setItems([])
    load(0)
  }, [load])

  async function toggleRead(message, event) {
    event.stopPropagation()
    await api.patch(`/api/admin/messages/${message.id}`, { read: !message.read }).catch(() => {})
    setItems((prev) => prev.map((m) => (m.id === message.id ? { ...m, read: !m.read } : m)))
    onUnread((n) => Math.max(0, n + (message.read ? 1 : -1)))
  }

  async function readAll() {
    await api.post('/api/admin/messages/read-all').catch(() => {})
    setItems((prev) => prev.map((m) => ({ ...m, read: true })))
    onUnread(0)
  }

  async function remove(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      window.setTimeout(() => setConfirmDelete((v) => (v === id ? null : v)), 3000)
      return
    }
    await api.del(`/api/admin/messages/${id}`).catch(() => {})
    setItems((prev) => prev.filter((m) => m.id !== id))
    setTotal((n) => n - 1)
    setConfirmDelete(null)
  }

  function open(message) {
    setOpenId(openId === message.id ? null : message.id)
    if (!message.read) toggleRead(message, { stopPropagation: () => {} })
  }

  return (
    <section className="adm-section">
      <div className="adm-bar">
        <h2>
          <Inbox size={16} /> Входящие <span className="adm-dim">({total})</span>
        </h2>
        <div className="adm-bar-actions">
          <label className="adm-check">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            непрочитанные
          </label>
          <button type="button" className="adm-btn" onClick={readAll}>
            <CheckCheck size={14} /> прочитать все
          </button>
        </div>
      </div>
      {error && <p className="adm-error">{error}</p>}
      <ul className="msg-list">
        {items.map((message) => (
          <li key={message.id} className={`msg${message.read ? '' : ' is-unread'}${openId === message.id ? ' is-open' : ''}`}>
            <button type="button" className="msg-head" onClick={() => open(message)}>
              <span className="msg-name">{message.name}</span>
              <span className="msg-date">{fmtDate(message.createdAt)}</span>
              {!message.read && <i className="msg-dot" aria-label="непрочитано" />}
            </button>
            {openId === message.id && (
              <div className="msg-body">
                <p className="msg-text">{message.text}</p>
                {message.file && (
                  <div className="msg-file">
                    <Paperclip size={13} />
                    <a href={`/api/admin/messages/${message.id}/file`} download>
                      {message.file.name}
                    </a>
                    <span className="adm-dim">{fmtSize(message.file.size)}</span>
                    {message.file.image && (
                      <button
                        type="button"
                        className="adm-btn"
                        onClick={() => setPreviewId(previewId === message.id ? null : message.id)}
                      >
                        {previewId === message.id ? 'скрыть' : 'превью'}
                      </button>
                    )}
                    <a className="adm-btn" href={`/api/admin/messages/${message.id}/file`} download title="Скачать">
                      <Download size={13} />
                    </a>
                  </div>
                )}
                {message.file?.image && previewId === message.id && (
                  <img className="msg-preview" src={`/api/admin/messages/${message.id}/file?inline=1`} alt={message.file.name} />
                )}
                <div className="msg-actions">
                  <button type="button" className="adm-btn" onClick={(e) => toggleRead(message, e)}>
                    {message.read ? <EyeOff size={13} /> : <Eye size={13} />}
                    {message.read ? 'в непрочитанные' : 'прочитано'}
                  </button>
                  <button
                    type="button"
                    className={`adm-btn adm-danger${confirmDelete === message.id ? ' is-armed' : ''}`}
                    onClick={() => remove(message.id)}
                  >
                    <Trash2 size={13} /> {confirmDelete === message.id ? 'точно?' : 'удалить'}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {loading && (
        <p className="adm-loading">
          <LoaderCircle size={15} className="spin" />
        </p>
      )}
      {!loading && items.length === 0 && <p className="adm-empty">Пусто.</p>}
      {!loading && items.length < total && (
        <button type="button" className="adm-btn adm-more" onClick={() => load(items.length, true)}>
          ещё ({total - items.length})
        </button>
      )}
    </section>
  )
}
