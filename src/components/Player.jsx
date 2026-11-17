import { useEffect, useRef, useState } from 'react'
import { Music, Pause, Play, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { api } from '@/lib/api'

const REMEMBER = 40 // сколько недавних треков не повторять

const TEXT = {
  ru: { title: 'Случайный трек', next: 'Другой трек', play: 'Слушать', pause: 'Пауза', failed: 'Не удалось загрузить трек' },
  en: { title: 'Random track', next: 'Another track', play: 'Play', pause: 'Pause', failed: 'Failed to load track' },
}

const fmtTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Плеер: выдаёт случайный трек, «следующий» — тоже всегда случайный
 * (серверу передаём недавно сыгранные id, чтобы не повторяться).
 */
export default function Player({ lang }) {
  const t = TEXT[lang]
  const [track, setTrack] = useState(null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('kotaz-volume'))
      return saved >= 0 && saved <= 1 ? saved : 0.8
    } catch {
      return 0.8
    }
  })
  const audioRef = useRef(null)
  const playedRef = useRef([])
  const wantPlayRef = useRef(false)

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio()
    audioRef.current.preload = 'none'
  }

  useEffect(() => {
    const audio = audioRef.current
    const onTime = () => setCurrent(audio.currentTime)
    const onMeta = () => setDuration(audio.duration)
    const onEnd = () => next()
    const onError = () => {
      setPlaying(false)
      // Битый файл — просто пропускаем трек.
      if (audio.src) next()
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('error', onError)
      audio.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    audioRef.current.volume = volume
    try {
      localStorage.setItem('kotaz-volume', String(volume))
    } catch {
      /* приватный режим */
    }
  }, [volume])

  async function next() {
    try {
      const exclude = playedRef.current.join(',')
      const data = await api.get(`/api/pub/music/random${exclude ? `?exclude=${exclude}` : ''}`)
      const chosen = data.track
      playedRef.current = [...playedRef.current, chosen.id].slice(-REMEMBER)
      setTrack(chosen)
      setCurrent(0)
      setDuration(chosen.duration || 0)
      const audio = audioRef.current
      audio.src = `/api/pub/music/${chosen.id}/audio`
      if (wantPlayRef.current) {
        audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
      }
    } catch {
      setFailed(true)
    }
  }

  // Первый трек грузим сразу (метаданные), но не играем.
  useEffect(() => {
    next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!track) return
    if (playing) {
      wantPlayRef.current = false
      audio.pause()
      setPlaying(false)
    } else {
      wantPlayRef.current = true
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  function skip() {
    wantPlayRef.current = playing || wantPlayRef.current
    next()
  }

  function seek(event) {
    const time = Number(event.target.value)
    audioRef.current.currentTime = time
    setCurrent(time)
  }

  if (failed) return null

  return (
    <div className={`player${playing ? ' is-playing' : ''}`} role="region" aria-label={t.title}>
      <div className="player-cover" aria-hidden="true">
        {track?.cover ? <img src={`/api/pub/music/${track.id}/cover`} alt="" loading="lazy" /> : <Music size={18} />}
      </div>
      <div className="player-info">
        <div className="player-name">
          <span className="player-title">{track?.title ?? '…'}</span>
          {track?.artist && <span className="player-artist">{track.artist}</span>}
        </div>
        <div className="player-seek">
          <span className="player-time">{fmtTime(current)}</span>
          <input
            type="range"
            min={0}
            max={duration || track?.duration || 0}
            step={0.1}
            value={Math.min(current, duration || current)}
            onChange={seek}
            aria-label={t.title}
          />
          <span className="player-time">{fmtTime(duration || track?.duration)}</span>
        </div>
      </div>
      <div className="player-buttons">
        <button type="button" className="player-btn player-main" onClick={toggle} aria-label={playing ? t.pause : t.play}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button type="button" className="player-btn" onClick={skip} aria-label={t.next} title={t.next}>
          <SkipForward size={16} />
        </button>
        <div className="player-volume">
          <button
            type="button"
            className="player-btn"
            onClick={() => setVolume((v) => (v === 0 ? 0.8 : 0))}
            aria-label="Volume"
          >
            {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  )
}
