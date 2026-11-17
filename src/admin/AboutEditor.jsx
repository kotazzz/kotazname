import { useCallback, useEffect, useState } from 'react'
import { FileText, LoaderCircle, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { fillAge } from '@/lib/age'
import Markdown from '@/components/Markdown.jsx'

const MAX = 8000

/** Редактор блока «обо мне» в Markdown с подстановкой возраста. */
export default function AboutEditor() {
  const [value, setValue] = useState(null) // { ru, en, birthdate }
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api
      .get('/api/admin/about')
      .then(setValue)
      .catch(() => setError('Не удалось загрузить'))
  }, [])

  useEffect(load, [load])

  async function save() {
    setBusy(true)
    setError('')
    try {
      const next = await api.put('/api/admin/about', value)
      setValue(next)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      const map = { text_too_long: `Текст длиннее ${MAX} символов`, bad_birthdate: 'Странная дата рождения' }
      setError(map[err.code] || err.code)
    } finally {
      setBusy(false)
    }
  }

  if (!value) {
    return (
      <p className="adm-loading">
        <LoaderCircle size={15} className="spin" />
      </p>
    )
  }

  const patch = (part) => setValue((v) => ({ ...v, ...part }))

  return (
    <section className="adm-section">
      <div className="adm-bar">
        <h2>
          <FileText size={16} /> Блок «обо мне»
        </h2>
        <button type="button" className="adm-primary" onClick={save} disabled={busy}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}
          {saved ? 'сохранено' : 'сохранить'}
        </button>
      </div>
      <p className="adm-hint">
        Markdown. Подстановки: <code>{'{{age}}'}</code> — возраст со словом («21 год»), <code>{'{{age_number}}'}</code> — только
        число. Возраст считается на сайте сам, по дате рождения ниже.
      </p>
      {error && <p className="adm-error">{error}</p>}
      <label className="adm-field">
        <span>Дата рождения</span>
        <input type="date" value={value.birthdate} onChange={(e) => patch({ birthdate: e.target.value })} />
      </label>
      <label className="adm-field">
        <span>
          Текст (RU) <em>{Array.from(value.ru).length}/{MAX}</em>
        </span>
        <textarea rows={8} value={value.ru} onChange={(e) => patch({ ru: e.target.value })} />
      </label>
      <label className="adm-field">
        <span>
          Текст (EN) <em>{Array.from(value.en).length}/{MAX}</em>
        </span>
        <textarea rows={8} value={value.en} onChange={(e) => patch({ en: e.target.value })} />
      </label>
      <div className="adm-preview">
        <h3>Превью (RU)</h3>
        <div className="about-body">
          <Markdown>{fillAge(value.ru, value.birthdate, 'ru')}</Markdown>
        </div>
      </div>
    </section>
  )
}
