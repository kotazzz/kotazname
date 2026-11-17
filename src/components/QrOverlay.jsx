import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { buildQrSvg } from '@/lib/qr'

const QR_TARGET = 'https://kotaz.name'

/** QR во весь экран: точки-градиент в цветах сайта, ведёт на kotaz.name. */
export default function QrOverlay({ onClose }) {
  const svg = useMemo(() => buildQrSvg(QR_TARGET), [])

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="qr-backdrop" onClick={onClose} role="presentation">
      <figure className="qr-figure" onClick={(e) => e.stopPropagation()}>
        <div className="qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
        <figcaption>kotaz.name</figcaption>
      </figure>
      <button type="button" className="qr-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>
    </div>
  )
}

/** Страница /qr — то же самое, но как отдельный экран по быстрой ссылке. */
export function QrPage() {
  const svg = useMemo(() => buildQrSvg(QR_TARGET), [])
  return (
    <div className="qr-page">
      <figure className="qr-figure">
        <div className="qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
        <figcaption>kotaz.name</figcaption>
      </figure>
      <a className="qr-back" href="/">
        ← kotaz.name
      </a>
    </div>
  )
}
