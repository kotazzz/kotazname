import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { fillAge } from '@/lib/age'
import Markdown from './Markdown'

const TITLE = { ru: 'Обо мне', en: 'About' }

/** Редактируемый блок «обо мне» с автоматическим возрастом. */
export default function About({ lang }) {
  const [about, setAbout] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .get('/api/pub/about')
      .then((data) => alive && setAbout(data))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!about) return null
  const text = fillAge(about[lang] || about.ru, about.birthdate, lang)

  return (
    <section className="section rise" style={{ animationDelay: '0.25s' }} aria-label={TITLE[lang]}>
      <h2 className="section-title">{TITLE[lang]}</h2>
      <div className="about-body">
        <Markdown>{text}</Markdown>
      </div>
    </section>
  )
}
