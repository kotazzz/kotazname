import { useEffect, useState } from 'react'
import Dither from '@/components/Dither'
import avatar from './assets/avatar.jpg'
import { BrandIcon } from './icons'
import './App.css'

const STORAGE_KEY = 'kotaz-lang'
const PALETTE = ['#06121f', '#173d5c', '#5f9ec7', '#e4f3ff']

const TEXT = {
  ru: {
    line: 'Здесь можно меня найти.',
    lang: 'Язык',
    copied: 'Скопировано',
    copy: 'Скопировать имя Discord',
    open: 'Открыть',
  },
  en: {
    line: 'This is where you can find me.',
    lang: 'Language',
    copied: 'Copied',
    copy: 'Copy Discord username',
    open: 'Open',
  },
}

const SOCIALS = [
  { id: 'telegram', name: 'Telegram', handle: 'kot_az', href: 'https://t.me/kot_az' },
  { id: 'vk', name: 'VK', handle: 'kotazz', href: 'https://vk.ru/kotazz' },
  { id: 'tiktok', name: 'TikTok', handle: 'kot_az', href: 'https://www.tiktok.com/@kot_az' },
  { id: 'discord', name: 'Discord', handle: 'kot_az', copy: true },
  { id: 'x', name: 'X', handle: 'ko_tazzz', href: 'https://x.com/ko_tazzz' },
  { id: 'bluesky', name: 'Bluesky', handle: 'kotaz', href: 'https://bsky.app/profile/kotaz.bsky.social' },
  { id: 'reddit', name: 'Reddit', handle: 'kota_z', href: 'https://www.reddit.com/user/kota_z' },
  {
    id: 'steam',
    name: 'Steam',
    handle: '76561198968143951',
    href: 'https://steamcommunity.com/profiles/76561198968143951',
  },
  { id: 'twitch', name: 'Twitch', handle: 'semkotaz', href: 'https://www.twitch.tv/semkotaz' },
  {
    id: 'youtube',
    name: 'YouTube',
    handle: 'UCRpFfxYb-KeO0n8GZC9VztQ',
    href: 'https://www.youtube.com/channel/UCRpFfxYb-KeO0n8GZC9VztQ',
  },
]

function readLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ru' || saved === 'en') return saved
  } catch {
    return 'ru'
  }
  const nav = navigator.language || ''
  return nav.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.left = '-9999px'
    document.body.appendChild(field)
    field.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(field)
    return ok
  }
}

function SocialBody({ id, name, handle, live }) {
  return (
    <>
      <BrandIcon id={id} />
      <span className="social-name">{name}</span>
      <span className="social-handle" translate="no" aria-live={live ? 'polite' : undefined}>
        {handle}
      </span>
    </>
  )
}

function App() {
  const [lang, setLang] = useState(readLang)
  const [copied, setCopied] = useState(false)
  const text = TEXT[lang]

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  function chooseLang(next) {
    setLang(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      return
    }
  }

  async function onCopyDiscord() {
    const ok = await copyText('kot_az')
    if (ok) setCopied(true)
  }

  return (
    <>
      <div className="backdrop">
        <Dither
          waveColor="#bcbcbc"
          backgroundColor="#120f17"
          ditherMode="bayer"
          colorNum={4}
          pixelSize={3}
          waveSpeed={0.015}
          waveFrequency={3}
          waveAmplitude={0.25}
          mouseEffect="erase"
          mouseRadius={0.3}
          palette={PALETTE}
          scale={1.75}
          contrast={0.75}
          brightness={-0.12}
          mouseStrength={0}
          trail={0.55}
          enableMouseInteraction
          clickRipple
          intro
          disableAnimation={false}
        />
      </div>
      <div className="scrim" aria-hidden="true" />
      <div className="frame" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="page">
        <header className="top">
          <div className="lang" role="group" aria-label={text.lang}>
            <button type="button" aria-pressed={lang === 'ru'} onClick={() => chooseLang('ru')}>
              RU
            </button>
            <span aria-hidden="true">/</span>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>
              EN
            </button>
          </div>
        </header>
        <main className="card">
          <img className="avatar rise" src={avatar} alt="" width="72" height="72" />
          <div className="identity rise">
            <h1 className="name" translate="no" aria-label="kot_az">
              kot<span className="us">_</span>az
            </h1>
            <p className="line">{text.line}</p>
          </div>
          <ul className="socials">
            {SOCIALS.map((item, index) => {
              const shown = item.copy && copied ? text.copied : item.handle
              const delay = `${0.2 + index * 0.04}s`
              if (item.copy) {
                return (
                  <li key={item.id} className="rise" style={{ animationDelay: delay }}>
                    <button
                      type="button"
                      className={copied ? 'social-link is-copied' : 'social-link'}
                      onClick={onCopyDiscord}
                      aria-label={`${text.copy}: ${item.handle}`}
                    >
                      <SocialBody id={item.id} name={item.name} handle={shown} live />
                    </button>
                  </li>
                )
              }
              return (
                <li key={item.id} className="rise" style={{ animationDelay: delay }}>
                  <a
                    className="social-link"
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${text.open} ${item.name}, ${item.handle}`}
                    title={item.handle}
                  >
                    <SocialBody id={item.id} name={item.name} handle={shown} />
                  </a>
                </li>
              )
            })}
          </ul>
        </main>
      </div>
    </>
  )
}

export default App
