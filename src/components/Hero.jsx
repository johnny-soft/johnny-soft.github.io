import { useEffect, useRef } from 'react'
import {
  siReact,
  siNodedotjs,
  siTypescript,
  siPython,
  siDocker,
  siFlutter,
  siPostgresql,
} from 'simple-icons'

const ACCENT = '#7855ff'

const TECHS = [
  { name: 'React', icon: siReact },
  { name: 'Node.js', icon: siNodedotjs },
  { name: 'TypeScript', icon: siTypescript },
  { name: 'Python', icon: siPython },
  { name: 'Docker', icon: siDocker },
  { name: 'Flutter', icon: siFlutter },
  { name: 'PostgreSQL', icon: siPostgresql },
]

function hexToHue(hex) {
  let x = String(hex).replace('#', '')
  if (x.length === 3) x = x.split('').map((c) => c + c).join('')
  const r = parseInt(x.slice(0, 2), 16) / 255
  const g = parseInt(x.slice(2, 4), 16) / 255
  const b = parseInt(x.slice(4, 6), 16) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  let h = 0
  if (mx !== mn) {
    const d = mx - mn
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return h / 360
}

export default function Hero() {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const root = rootRef.current
    if (!canvas || !root || !window.JFluid) return

    // sem WebGL (browsers antigos, headless), o site segue com fundo estático
    let fluid = null
    try {
      fluid = window.JFluid.start(canvas, {
        target: root,
        hueBase: hexToHue(ACCENT),
        hueRange: 0.12,
        gain: 0.16,
        curl: 22,
        splatForce: 3200,
        splatRadius: 0.24,
        densityDissipation: 1.3,
        velocityDissipation: 0.9,
      })
    } catch (err) {
      console.warn('Fluid simulation indisponível:', err)
    }

    return () => fluid && fluid.destroy()
  }, [])

  return (
    <section id="inicio" className="hero" ref={rootRef}>
      {/* WebGL fluid simulation */}
      <canvas className="hero__canvas" ref={canvasRef} />

      {/* gentle vignette to seat the type */}
      <div className="hero__vignette" />

      <div className="hero__content">
        {/* NAVBAR */}
        <nav className="nav">
          <div className="nav__brand">
            <div className="nav__logo">
              <span className="nav__logo-leaf nav__logo-leaf--tl" />
              <span className="nav__logo-leaf nav__logo-leaf--br" />
            </div>
            <span className="nav__name">
              johnny<span>Soft</span>
            </span>
          </div>

          <div className="nav__links">
            <a href="#inicio" className="nav__link nav__link--active">Início</a>
            <a href="#servicos" className="nav__link">Serviços</a>
            <a href="#projetos" className="nav__link">Projetos</a>
            <a href="#contato" className="nav__link">Contato</a>
          </div>

          <a href="#contato" className="nav__cta">
            Contato <span className="nav__cta-arrow">&#8599;</span>
          </a>
        </nav>

        {/* HERO CORE */}
        <div className="hero__core">
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            Estúdio de engenharia de software
          </div>

          <h1 className="hero__title">
            Engenharia de Software
            <br />
            <span className="hero__title-serif">feita para escalar</span>
          </h1>

          <p className="hero__subtitle">
            A johnnySoft projeta, desenvolve e escala produtos digitais sob medida
            — do MVP à infraestrutura que aguenta milhões.
          </p>

          <div className="hero__actions">
            <a href="#contato" className="btn-primary">
              Iniciar Projeto <span>&#8599;</span>
            </a>
            <a href="#projetos" className="btn-secondary">Ver Projetos</a>
          </div>
        </div>

        {/* BOTTOM: scroll cue */}
        <div className="hero__scroll-cue">
          <div className="hero__scroll-icon">&#8595;</div>
          <span className="hero__scroll-label">role para explorar</span>
        </div>
      </div>

      {/* TECH STACK STRIP (marquee) */}
      <div className="tech-strip">
        <div className="tech-strip__track">
          {[0, 1, 2, 3].map((copy) => (
            <div key={copy} className="tech-strip__group" aria-hidden={copy > 0}>
              {TECHS.map((t) => (
                <span key={t.name} className="tech-strip__item">
                  <svg viewBox="0 0 24 24" className="tech-strip__icon" aria-hidden="true">
                    <path d={t.icon.path} fill="currentColor" />
                  </svg>
                  {t.name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
