import { useEffect, useState } from 'react'
import { MessageCircleHeart, QrCode } from 'lucide-react'
import Dither from '@/components/Dither'
import About from '@/components/About'
import SteamStatus from '@/components/SteamStatus'
import GithubGraph from '@/components/GithubGraph'
import Projects from '@/components/Projects'
import Player from '@/components/Player'
import MessageModal from '@/components/MessageModal'
import QrOverlay from '@/components/QrOverlay'
import Footer from '@/components/Footer'
import avatar from './assets/avatar.jpg'
import { BrandIcon } from './icons'
import { SOCIALS } from './data/socials'
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
    write: 'Отправить сообщение',
    qrTitle: 'QR-код на kotaz.name',
  },
  en: {
    line: 'This is where you can find me.',
    lang: 'Language',
    copied: 'Copied',
    copy: 'Copy Discord username',
    open: 'Open',
    write: 'Send a message',
    qrTitle: 'QR code to kotaz.name',
  },
}

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
  const [msgOpen, setMsgOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
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
          brightness={-0.2}
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
          <button type="button" className="qr-btn" onClick={() => setQrOpen(true)} aria-label={text.qrTitle} title={text.qrTitle}>
            <QrCode size={17} />
          </button>
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
        <main className="column">
          <section className="card" aria-label="kot_az">
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
                const delay = `${0.1 + index * 0.03}s`
                const brand = item.brand || item.id
                if (item.copy) {
                  return (
                    <li key={item.id} className="rise" style={{ animationDelay: delay }}>
                      <button
                        type="button"
                        className={copied ? 'social-link is-copied' : 'social-link'}
                        onClick={onCopyDiscord}
                        aria-label={`${text.copy}: ${item.handle}`}
                      >
                        <SocialBody id={brand} name={item.name} handle={shown} live />
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
                      <SocialBody id={brand} name={item.name} handle={shown} />
                    </a>
                  </li>
                )
              })}
            </ul>
            <button type="button" className="write-btn rise" style={{ animationDelay: '0.55s' }} onClick={() => setMsgOpen(true)}>
              <MessageCircleHeart size={16} aria-hidden="true" />
              {text.write}
            </button>
            <SteamStatus lang={lang} />
          </section>
          <About lang={lang} />
          <GithubGraph lang={lang} />
          <Projects lang={lang} />
          <Footer lang={lang} />
        </main>
      </div>
      <Player lang={lang} />
      {msgOpen && <MessageModal lang={lang} onClose={() => setMsgOpen(false)} />}
      {qrOpen && <QrOverlay onClose={() => setQrOpen(false)} />}
    </>
  )
}

export default App
