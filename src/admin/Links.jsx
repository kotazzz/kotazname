import { useCallback, useEffect, useState } from 'react'
import { Check, Link2, LoaderCircle, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'

const ERRORS = {
  bad_slug: 'Слаг: строчные a–z, цифры, - и _, до 32 символов',
  reserved_slug: 'Этот адрес уже занят сайтом',
  slug_taken: 'Такой слаг уже есть',
  bad_url: 'Нужен полный URL вида https://…',
  redirect_loop: 'Ссылка ведёт сама на себя',
}

const fmtDate = (ms) => (ms ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms) : '—')

function LinkForm({ initial, onSave, onCancel, busy }) {
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  return (
    <form
      className="link-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ slug: slug.trim().toLowerCase(), url: url.trim(), title: title.trim() })
      }}
    >
      <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" required pattern="[a-z0-9][a-z0-9_\-]{0,31}" />
      <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название (необязательно)" />
      <div className="link-form-actions">
        <button type="submit" className="adm-primary" disabled={busy}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
          сохранить
        </button>
        {onCancel && (
          <button type="button" className="adm-btn" onClick={onCancel}>
            <X size={14} /> отмена
          </button>
        )}
      </div>
    </form>
  )
}

/** Сократитель ссылок: kotaz.name/<slug> → цель, со счётчиком переходов. */
export default function Links() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editSlug, setEditSlug] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/links')
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

  function showError(err) {
    setError(ERRORS[err.code] || err.code)
  }

  async function create(form) {
    setBusy(true)
    setError('')
    try {
      await api.post('/api/admin/links', form)
      await load()
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function update(slug, form) {
    setBusy(true)
    setError('')
    try {
      await api.put(`/api/admin/links/${encodeURIComponent(slug)}`, form)
      setEditSlug(null)
      await load()
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function reset(slug) {
    await api.post(`/api/admin/links/${encodeURIComponent(slug)}/reset`).catch(() => {})
    setItems((prev) => prev.map((l) => (l.slug === slug ? { ...l, clicks: 0, lastClickAt: null } : l)))
  }

  async function remove(slug) {
    if (confirmDelete !== slug) {
      setConfirmDelete(slug)
      window.setTimeout(() => setConfirmDelete((v) => (v === slug ? null : v)), 3000)
      return
    }
    await api.del(`/api/admin/links/${encodeURIComponent(slug)}`).catch(() => {})
    setItems((prev) => prev.filter((l) => l.slug !== slug))
    setConfirmDelete(null)
  }

  return (
    <section className="adm-section">
      <div className="adm-bar">
        <h2>
          <Link2 size={16} /> Короткие ссылки
        </h2>
      </div>
      <LinkForm onSave={create} busy={busy} />
      {error && <p className="adm-error">{error}</p>}
      {loading ? (
        <p className="adm-loading">
          <LoaderCircle size={15} className="spin" />
        </p>
      ) : (
        <ul className="link-list">
          {items.map((link) => (
            <li key={link.slug} className="link-row">
              {editSlug === link.slug ? (
                <LinkForm initial={link} busy={busy} onSave={(form) => update(link.slug, form)} onCancel={() => setEditSlug(null)} />
              ) : (
                <>
                  <div className="link-main">
                    <div className="link-slug">
                      <a href={`/${link.slug}`} target="_blank" rel="noreferrer">
                        kotaz.name/<b>{link.slug}</b>
                      </a>
                      {link.title && <span className="link-title">{link.title}</span>}
                    </div>
                    <div className="link-url" title={link.url}>
                      {link.url}
                    </div>
                  </div>
                  <div className="link-stats">
                    <b>{link.clicks}</b> переходов
                    <span className="adm-dim">последний: {fmtDate(link.lastClickAt)}</span>
                  </div>
                  <div className="link-actions">
                    <button type="button" className="adm-btn" onClick={() => setEditSlug(link.slug)} title="Изменить">
                      <Pencil size={13} />
                    </button>
                    <button type="button" className="adm-btn" onClick={() => reset(link.slug)} title="Сбросить счётчик">
                      <RotateCcw size={13} />
                    </button>
                    <button
                      type="button"
                      className={`adm-btn adm-danger${confirmDelete === link.slug ? ' is-armed' : ''}`}
                      onClick={() => remove(link.slug)}
                      title="Удалить"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
