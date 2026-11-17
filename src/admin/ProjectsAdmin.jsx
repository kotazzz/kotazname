import { useCallback, useEffect, useState } from 'react'
import * as icons from 'lucide-react'
import { Check, FolderKanban, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'

const ERRORS = {
  bad_year: 'Год: целое число 2000–2100',
  bad_name: 'Название: 1–80 символов',
  bad_icon: 'Иконка: имя из lucide, латиницей с заглавной (например, Waves)',
  bad_url: 'Нужен полный URL вида https://…',
  desc_too_long: 'Описание длиннее 700 символов',
}

const EMPTY = { year: new Date().getFullYear(), name: '', icon: 'Folder', href: '', descRu: '', descEn: '' }

function ProjectForm({ initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState(initial ?? EMPTY)
  const patch = (part) => setForm((f) => ({ ...f, ...part }))
  const Icon = icons[form.icon] ?? icons.Folder
  return (
    <form
      className="proj-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...form, year: Number(form.year) })
      }}
    >
      <div className="proj-form-grid">
        <label>
          <span>Год</span>
          <input type="number" min="2000" max="2100" value={form.year} onChange={(e) => patch({ year: e.target.value })} required />
        </label>
        <label>
          <span>Название</span>
          <input type="text" value={form.name} onChange={(e) => patch({ name: e.target.value })} required />
        </label>
        <label>
          <span>Ссылка</span>
          <input type="url" value={form.href} onChange={(e) => patch({ href: e.target.value })} placeholder="https://github.com/…" required />
        </label>
        <label>
          <span>
            Иконка <i className="proj-icon-preview"><Icon size={14} /></i>
          </span>
          <input type="text" value={form.icon} onChange={(e) => patch({ icon: e.target.value.trim() })} required pattern="[A-Z][A-Za-z0-9]{0,39}" />
        </label>
      </div>
      <label>
        <span>Описание (RU)</span>
        <textarea rows={2} value={form.descRu} onChange={(e) => patch({ descRu: e.target.value })} />
      </label>
      <label>
        <span>Описание (EN)</span>
        <textarea rows={2} value={form.descEn} onChange={(e) => patch({ descEn: e.target.value })} />
      </label>
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

/** Редактор проектов: сортировка на сайте по годам (новые сверху). */
export default function ProjectsAdmin() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/projects')
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
      await api.post('/api/admin/projects', form)
      setAdding(false)
      await load()
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function update(id, form) {
    setBusy(true)
    setError('')
    try {
      await api.put(`/api/admin/projects/${id}`, form)
      setEditId(null)
      await load()
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      window.setTimeout(() => setConfirmDelete((v) => (v === id ? null : v)), 3000)
      return
    }
    await api.del(`/api/admin/projects/${id}`).catch(() => {})
    setItems((prev) => prev.filter((p) => p.id !== id))
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
          <FolderKanban size={16} /> Проекты <span className="adm-dim">(на сайте — новые сверху)</span>
        </h2>
        <button type="button" className="adm-primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> добавить
        </button>
      </div>
      {adding && <ProjectForm onSave={create} onCancel={() => setAdding(false)} busy={busy} />}
      {error && <p className="adm-error">{error}</p>}
      <ul className="proj-list">
        {items.map((project) => {
          const Icon = icons[project.icon] ?? icons.Folder
          return (
            <li key={project.id} className="proj-row">
              {editId === project.id ? (
                <ProjectForm initial={project} busy={busy} onSave={(form) => update(project.id, form)} onCancel={() => setEditId(null)} />
              ) : (
                <>
                  <span className="proj-icon">
                    <Icon size={16} />
                  </span>
                  <div className="proj-main">
                    <div className="proj-head">
                      <span className="adm-dim">{project.year}</span>
                      <b>{project.name}</b>
                    </div>
                    <div className="link-url" title={project.href}>
                      {project.href}
                    </div>
                  </div>
                  <div className="link-actions">
                    <button type="button" className="adm-btn" onClick={() => setEditId(project.id)} title="Изменить">
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className={`adm-btn adm-danger${confirmDelete === project.id ? ' is-armed' : ''}`}
                      onClick={() => remove(project.id)}
                      title="Удалить"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
