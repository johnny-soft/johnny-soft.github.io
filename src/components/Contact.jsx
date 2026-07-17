import Reveal from './Reveal.jsx'

export default function Contact() {
  return (
    <section id="contato" className="section section--contact">
      <div className="section__grid">
        <Reveal>
          <p className="section__aside-note section__aside-note--flush">
            Conte sobre você e o projeto
          </p>
        </Reveal>
        <div>
          <Reveal>
            <h2 className="section__title section__title--contact">Vamos Conversar</h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="contact__form">
              <input type="email" placeholder="Seu e-mail" className="contact__field" />
              <textarea rows="2" placeholder="Descreva sua ideia" className="contact__field" />
              <div className="contact__submit-row">
                <button type="button" className="contact__submit">
                  Enviar <span>&#8594;</span>
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* FOOTER */}
      <Reveal>
        <div className="footer">
          <div className="footer__row">
            <a href="#projetos" className="footer__link">Projetos</a>
            <a href="#" className="footer__link">Sobre</a>
            <a href="#" className="footer__link">Blog</a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
