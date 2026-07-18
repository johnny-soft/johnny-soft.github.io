import Reveal from './Reveal.jsx'

export default function Projects() {
  return (
    <section id="projetos" className="section">
      <div className="section__grid">
        <Reveal>
          <div className="section__aside-index">1&#8202;&#8212;&#8202;0</div>
          <p className="section__aside-note">Cases selecionados</p>
        </Reveal>
        <div>
          <Reveal>
            <h2 className="section__title">Projetos</h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="projects__placeholder">
              <div className="projects__placeholder-inner">
                <div className="projects__plus">+</div>
                <p className="projects__soon">projetos em breve</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
