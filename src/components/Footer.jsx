import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

const TEXT = {
  ru: { today: 'сегодня', month: 'за месяц', total: 'всего' },
  en: { today: 'today', month: 'this month', total: 'all time' },
}

/** Подвал: счётчик посетителей за день / месяц / всё время. Без cookie, поэтому точность ±. */
export default function Footer({ lang }) {
  const t = TEXT[lang]
  const [stats, setStats] = useState(null)
  const hitRef = useRef(false)

  useEffect(() => {
    if (hitRef.current) return undefined
    hitRef.current = true
    let alive = true
    api
      .post('/api/pub/hit')
      .then((data) => alive && setStats(data))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const fmt = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US')
  const year = new Date().getFullYear()

  return (
    <footer className="footer rise" style={{ animationDelay: '0.55s' }}>
      {stats && (
        <p className="visits" aria-label="visitors">
          <span>
            {t.today} <b>{fmt.format(stats.day)}</b>
          </span>
          <span>
            {t.month} <b>{fmt.format(stats.month)}</b>
          </span>
          <span>
            {t.total} <b>{fmt.format(stats.total)}</b>
          </span>
        </p>
      )}
      <p className="credits">
        kot_az <a className="admin-link" href="/admin" aria-label="admin" tabIndex={-1}>·</a> 2024–{year}
      </p>
    </footer>
  )
}
