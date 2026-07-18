import Hero from './components/Hero.jsx'
import Services from './components/Services.jsx'
import Projects from './components/Projects.jsx'
import Contact from './components/Contact.jsx'
import ProgressBar from './components/ProgressBar.jsx'
import BackToTop from './components/BackToTop.jsx'

export default function App() {
  return (
    <>
      <ProgressBar />
      <Hero />
      <Services />
      <Projects />
      <Contact />
      <BackToTop />
    </>
  )
}
