import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

// Палитра графика — цвета сайта: от пустой клетки к ледяному белому.
const LEVELS = ['rgba(95,158,199,0.14)', '#173d5c', '#2c5f88', '#5f9ec7', '#e4f3ff']
const CELL = 9
const GAP = 2
const STEP = CELL + GAP

const TEXT = {
  ru: { title: 'Активность на GitHub', total: (n) => `${n} контрибуций за год`, less: 'меньше', more: 'больше', one: 'контрибуция', few: 'контрибуции' },
  en: { title: 'GitHub activity', total: (n) => `${n} contributions this year`, less: 'less', more: 'more', one: 'contribution', few: 'contributions' },
}

function pluralRu(n) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'контрибуция'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'контрибуции'
  return 'контрибуций'
}

/** График контрибуций GitHub цветной плиткой в палитре сайта. */
export default function GithubGraph({ lang }) {
  const [data, setData] = useState(null)
  const t = TEXT[lang]

  useEffect(() => {
    let alive = true
    api
      .get('/api/pub/github')
      .then((value) => alive && setData(value))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const weeks = useMemo(() => {
    if (!data?.days?.length) return []
    const columns = []
    let column = null
    for (const day of data.days) {
      const weekday = new Date(`${day.d}T00:00:00Z`).getUTCDay()
      if (weekday === 0 || !column) {
        column = new Array(7).fill(null)
        columns.push(column)
      }
      column[weekday] = day
    }
    return columns
  }, [data])

  if (!data) return null

  const fmt = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US')
  const totalText =
    lang === 'ru'
      ? `${fmt.format(data.total)} ${pluralRu(data.total)} за год`
      : t.total(fmt.format(data.total))

  return (
    <section className="section rise" style={{ animationDelay: '0.35s' }} aria-label={t.title}>
      <h2 className="section-title">
        <a href="https://github.com/kotazzz" target="_blank" rel="noreferrer" className="section-link">
          {t.title}
        </a>
        <span className="section-note">{totalText}</span>
      </h2>
      <div className="gh-scroll">
        <svg
          className="gh-graph"
          width={weeks.length * STEP - GAP}
          height={7 * STEP - GAP}
          role="img"
          aria-label={totalText}
        >
          {weeks.map((column, x) =>
            column.map((day, y) => {
              if (!day) return null
              return (
                <rect
                  key={day.d}
                  x={x * STEP}
                  y={y * STEP}
                  width={CELL}
                  height={CELL}
                  rx={2.6}
                  fill={LEVELS[Math.min(day.l, 4)]}
                >
                  <title>
                    {day.d}: {day.c}
                  </title>
                </rect>
              )
            }),
          )}
        </svg>
        <div className="gh-legend" aria-hidden="true">
          <span>{t.less}</span>
          {LEVELS.map((color) => (
            <i key={color} style={{ background: color }} />
          ))}
          <span>{t.more}</span>
        </div>
      </div>
    </section>
  )
}
