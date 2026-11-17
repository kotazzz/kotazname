import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, Paperclip, X } from 'lucide-react'
import { api } from '@/lib/api'
import { solvePow } from '@/lib/pow'

const MAX_FILE = 100 * 1024 * 1024
const NAME_MAX = 32
const TEXT_MAX = 4096

const TEXT = {
  ru: {
    title: 'Анонимное сообщение',
    name: 'Имя (необязательно)',
    namePh: 'Аноним',
    message: 'Сообщение',
    messagePh: 'Что хотите сказать?',
    attach: 'Прикрепить файл',
    fileTooBig: 'Файл больше 100 МБ',
    send: 'Отправить',
    sending: 'Отправка…',
    solving: 'Проверка…',
    done: 'Отправлено. Спасибо!',
    close: 'Закрыть',
    errors: {
      name_too_long: 'Имя длиннее 32 символов',
      text_too_long: 'Сообщение длиннее 4096 символов',
      text_required: 'Напишите сообщение',
      file_too_large: 'Файл больше 100 МБ',
      too_many_messages: 'Слишком много сообщений за сутки',
      inbox_full: 'Ящик переполнен, попробуйте завтра',
      storage_full: 'Хранилище вложений переполнено',
      pow_failed: 'Проверка не пройдена, попробуйте ещё раз',
      busy: 'Сервер занят, попробуйте позже',
    },
  },
  en: {
    title: 'Anonymous message',
    name: 'Name (optional)',
    namePh: 'Anonymous',
    message: 'Message',
    messagePh: 'What do you want to say?',
    attach: 'Attach a file',
    fileTooBig: 'File is over 100 MB',
    send: 'Send',
    sending: 'Sending…',
    solving: 'Checking…',
    done: 'Sent. Thank you!',
    close: 'Close',
    errors: {
      name_too_long: 'Name is longer than 32 chars',
      text_too_long: 'Message is longer than 4096 chars',
      text_required: 'Write a message',
      file_too_large: 'File is over 100 MB',
      too_many_messages: 'Too many messages per day',
      inbox_full: 'Inbox is full, try tomorrow',
      storage_full: 'Attachment storage is full',
      pow_failed: 'Check failed, try again',
      busy: 'Server is busy, try later',
    },
  },
}

const chars = (value) => Array.from(value).length
const fmtSize = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} МБ` : bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} КБ` : `${bytes} Б`

/** Модалка анонимного сообщения: имя, текст, файл до 100 МБ, PoW вместо капчи. */
export default function MessageModal({ lang, onClose }) {
  const t = TEXT[lang]
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [phase, setPhase] = useState('form') // form | working | done
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const trapRef = useRef(null)

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  function pickFile(event) {
    const chosen = event.target.files?.[0]
    setFileError('')
    if (!chosen) {
      setFile(null)
      return
    }
    if (chosen.size > MAX_FILE) {
      setFile(null)
      setFileError(t.fileTooBig)
      event.target.value = ''
      return
    }
    setFile(chosen)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!text.trim()) {
      setError(t.errors.text_required)
      return
    }
    setPhase('working')
    setProgress('solving')
    try {
      const { challenge, bits } = await api.get('/api/pub/pow')
      const pow = await solvePow(challenge, bits)
      setProgress(0)

      const form = new FormData()
      form.set('name', name)
      form.set('text', text)
      form.set('website', trapRef.current?.value ?? '')
      if (file) form.set('file', file)

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/pub/messages')
        xhr.setRequestHeader('X-PoW', pow)
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total)
        xhr.onload = () => {
          if (xhr.status < 300) return resolve()
          let code = `http_${xhr.status}`
          try {
            code = JSON.parse(xhr.responseText).error || code
          } catch { /* не JSON */ }
          reject(new Error(code))
        }
        xhr.onerror = () => reject(new Error('network'))
        xhr.send(form)
      })
      setPhase('done')
      window.setTimeout(onClose, 2200)
    } catch (err) {
      setPhase('form')
      setProgress(null)
      setError(t.errors[err.message] || err.message)
    }
  }

  const busy = phase === 'working'

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="modal-head">
          <h2>{t.title}</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label={t.close} disabled={busy}>
            <X size={16} />
          </button>
        </div>
        {phase === 'done' ? (
          <p className="modal-done">
            <Check size={18} aria-hidden="true" /> {t.done}
          </p>
        ) : (
          <form className="modal-form" onSubmit={submit}>
            {/* ловушка для ботов: люди это поле не видят */}
            <input ref={trapRef} type="text" name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
            <label>
              <span>
                {t.name} <em>{chars(name)}/{NAME_MAX}</em>
              </span>
              <input
                type="text"
                value={name}
                maxLength={NAME_MAX * 2}
                placeholder={t.namePh}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              <span>
                {t.message} <em>{chars(text)}/{TEXT_MAX}</em>
              </span>
              <textarea
                value={text}
                rows={6}
                placeholder={t.messagePh}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
            <div className="modal-file">
              <button type="button" className="ghost-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Paperclip size={14} aria-hidden="true" />
                {file ? `${file.name} · ${fmtSize(file.size)}` : t.attach}
              </button>
              {file && (
                <button type="button" className="ghost-btn" onClick={() => { setFile(null); fileRef.current.value = '' }} disabled={busy}>
                  <X size={13} aria-hidden="true" />
                </button>
              )}
              <input ref={fileRef} type="file" hidden onChange={pickFile} />
            </div>
            {fileError && <p className="modal-error">{fileError}</p>}
            {error && <p className="modal-error">{error}</p>}
            {progress !== null && phase === 'working' && (
              <div className="modal-progress" aria-hidden="true">
                <i style={{ width: `${Math.round((progress === 'solving' ? 0 : progress) * 100)}%` }} />
              </div>
            )}
            <button type="submit" className="send-btn" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle size={15} className="spin" aria-hidden="true" />
                  {progress === 'solving' ? t.solving : t.sending}
                </>
              ) : (
                t.send
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
