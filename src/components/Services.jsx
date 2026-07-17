import { useState } from 'react'
import Reveal from './Reveal.jsx'

const SERVICES = [
  {
    name: 'Produto & MVP',
    desc: 'Do conceito ao lançamento. Validamos, prototipamos e entregamos seu MVP em semanas, não meses.',
  },
  {
    name: 'Plataformas & Escala',
    desc: 'Arquiteturas que aguentam milhões de requisições sem perder performance nem confiabilidade.',
  },
  {
    name: 'Cloud & Infraestrutura',
    desc: 'DevOps, CI/CD e infraestrutura como código para deploys seguros e contínuos.',
  },
  {
    name: 'Mobile & Web',
    desc: 'Aplicações nativas e web de alta performance, com design impecável e foco no usuário.',
  },
]

export default function Services() {
  const [open, setOpen] = useState(0)

  return (
    <section id="servicos" className="section">
      <div className="section__grid">
        <Reveal>
          <div className="section__aside-icon">&#10043;</div>
          <p className="section__aside-note">O que entregamos do início ao fim</p>
        </Reveal>
        <div>
          <Reveal>
            <h2 className="section__title">Nossas Capacidades</h2>
          </Reveal>

          <div className="services__list">
            {SERVICES.map((s, i) => (
              <Reveal key={s.name} delay={i * 90}>
                <div
                  className="services__item"
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <div className="services__row">
                    <span className="services__name">{s.name}</span>
                    <span className="services__sign">{open === i ? '−' : '+'}</span>
                  </div>
                  <div className={`services__body${open === i ? ' services__body--open' : ''}`}>
                    <div className="services__body-inner">
                      <p className="services__desc">{s.desc}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
