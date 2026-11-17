import { useEffect, useState } from 'react'
import { Gamepad2 } from 'lucide-react'
import { api } from '@/lib/api'

const TEXT = {
  ru: { ingame: 'В игре', online: 'Онлайн', busy: 'Занят', away: 'Отошёл', offline: 'Не в сети', lastSeen: 'был(а)' },
  en: { ingame: 'In game', online: 'Online', busy: 'Busy', away: 'Away', offline: 'Offline', lastSeen: 'last seen' },
}

function relative(ms, lang) {
  const diff = Date.now() - ms
  const minutes = Math.round(diff / 60000)
  const value = minutes < 60 ? -minutes : minutes < 60 * 24 ? -Math.round(minutes / 60) : -Math.round(minutes / 60 / 24)
  const unit = minutes < 60 ? 'minute' : minutes < 60 * 24 ? 'hour' : 'day'
  return new Intl.RelativeTimeFormat(lang === 'ru' ? 'ru' : 'en', { style: 'long' }).format(value, unit)
}

/** Виджет присутствия Steam: онлайн/в игре, обновляется каждую минуту. */
export default function SteamStatus({ lang }) {
  const [steam, setSteam] = useState(null)
  const t = TEXT[lang]

  useEffect(() => {
    let alive = true
    const load = () =>
      api
        .get('/api/pub/steam')
        .then((data) => alive && setSteam(data))
        .catch(() => {})
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  if (!steam || steam.state === 'unknown') return null
  const online = steam.state === 'ingame' || steam.state === 'online' || steam.state === 'busy'

  return (
    <div className={`steam rise${online ? ' is-online' : ''}`} style={{ animationDelay: '0.3s' }}>
      <span className="steam-dot" aria-hidden="true" />
      <Gamepad2 size={15} aria-hidden="true" />
      <span className="steam-text">
        {steam.state === 'ingame' ? `${t.ingame}: ${steam.game}` : t[steam.state] || t.offline}
        {steam.state === 'offline' && steam.lastSeen ? ` · ${t.lastSeen} ${relative(steam.lastSeen, lang)}` : ''}
      </span>
    </div>
  )
}
