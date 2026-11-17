import SiteHeader from "./components/SiteHeader";
import ContactForm from "./components/ContactForm";
import ProjectShowcase from "./components/ProjectShowcase";

export default function Home() {
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <SiteHeader />
      <main id="content">
      <section className="hero" id="top">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Good tech. More human.</p>
            <h1>Work lighter.<br />Move faster.</h1>
            <p className="lede">We build websites, chatbots and automations that take the repetitive stuff off your team’s plate.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#contact">Tell us what you need</a>
              <a className="button button-ghost" href="#how">See how it works</a>
            </div>
            <p className="promise">More room for people. We don’t replace people. We give them time for what matters.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <svg className="c-mark" viewBox="0 0 200 200">
              <path d="M146 42a78 78 0 1 0 2 116" fill="none" stroke="#2b6cff" strokeWidth="22" strokeLinecap="round"/>
            </svg>
            <div className="confirm-card">
              <strong>Booking confirmed</strong>
              <span>One less thing to do</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section services" id="services">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">What we can help with</p>
            <h2>Less busywork. More possibility.</h2>
            <p>From your first website to that task nobody wants to do again. We make technology simple and useful.</p>
          </div>
          <div className="card-grid">
            <article className="service">
              <div className="icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M6 15h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </div>
              <h3>Websites</h3>
              <p>Clear, fast websites. Built around your goals.</p>
            </article>
            <article className="service">
              <div className="icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4.5h12v7.2a2 2 0 0 1-2 2H7l-3.2 2v-2H5a2 2 0 0 1-2-2V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
              </div>
              <h3>Chatbots</h3>
              <p>Helpful answers. Less repetition for your team.</p>
            </article>
            <article className="service">
              <div className="icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3.5" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M6 2.8v2M12 2.8v2M3 7.2h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </div>
              <h3>Booking &amp; automation</h3>
              <p>Smoother bookings. Everyday tasks, handled.</p>
            </article>
            <article className="service">
              <div className="icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.6"/><path d="M4.2 14.2c.7-2.2 2.4-3.3 4.8-3.3s4.1 1.1 4.8 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </div>
              <h3>Consulting &amp; training</h3>
              <p>Everyday tools and AI. Confidence to use them.</p>
            </article>
          </div>
          <p className="note">Training you can use straight away: Outlook, email and Excel, plus AI chatbots and agents. Always grounded in your everyday work.</p>
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>A simple path to a lighter day.</h2>
            <p>Real conversations. Clear next steps. Something that actually works for you.</p>
          </div>
          <div className="steps">
            <article className="step">
              <span className="num">01</span>
              <h3>We talk</h3>
              <p>We listen, ask questions and find where your time goes.</p>
            </article>
            <article className="step">
              <span className="num">02</span>
              <h3>We build or teach</h3>
              <p>A practical solution or hands-on training. No unnecessary complexity.</p>
            </article>
            <article className="step">
              <span className="num">03</span>
              <h3>You launch and save time</h3>
              <p>We help you get started, so the benefits become part of your day.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="examples" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head section-head-wide">
            <div>
              <p className="eyebrow">Built prototypes &amp; interactive demos</p>
              <h2>Real problems. Practical solutions.</h2>
              <p>Try interactive walkthroughs of our three working prototypes below, or inspect the full source code on GitHub.</p>
            </div>
            <a
              className="button button-ghost"
              href="https://github.com/kubik191/lejak"
              target="_blank"
              rel="noopener noreferrer"
            >
              Browse GitHub repo ↗
            </a>
          </div>
          <ProjectShowcase />

          <div className="offer" style={{ marginTop: "1.5rem" }}>
            <div className="offer-grid">
              <div>
                <p className="eyebrow">What you get</p>
                <h2>The setting changes. The offer stays the same.</h2>
              </div>
              <ul>
                <li>A hall, an office, a lab, or a map. We start from the work you already do.</li>
                <li>Repetition gets automated. Judgment stays with the people who know the job.</li>
                <li>We can sit with your team and train them, including on AI, so the new process sticks.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="people" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">The people behind LEJAK</p>
            <h2>More human. Less routine.</h2>
            <p>LEJAK was started by two friends who believe technology should help people, not replace them. We build websites, chatbots, booking systems and automations, and train teams to use tech and AI confidently. Owners save money, employees save time and nerves, and people stay in control of the decisions that need a human.</p>
          </div>
          <div className="people-grid">
            <article className="person">
              <div className="who">
                <div className="avatar" aria-hidden="true">JK</div>
                <div>
                  <h3>Jakub Kucera</h3>
                  <p className="role">Co-owner · Development &amp; automation</p>
                </div>
              </div>
              <p>Turns repetitive tasks into simple, useful solutions.</p>
              <div className="links">
                <a href="mailto:jakub.kucera@outlook.sk">jakub.kucera@outlook.sk</a>
                <a href="tel:+4571644059">+45 71 64 40 59</a>
              </div>
            </article>
            <article className="person">
              <div className="who">
                <div className="avatar" aria-hidden="true">LG</div>
                <div>
                  <h3>Leo Gurtner</h3>
                  <p className="role">Co-owner · Consulting &amp; training</p>
                </div>
              </div>
              <p>Helps people feel confident and comfortable with technology.</p>
              <div className="links">
                <a href="mailto:leogurtner@outlook.com">leogurtner@outlook.com</a>
                <a href="tel:+4591613212">+45 91 61 32 12</a>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section contact" id="contact">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Let’s talk</p>
            <h2>Tell us what you need, we’ll get back to you.</h2>
            <p>An idea, a challenge, or just a question? Send one message and it reaches both of us. Or call whichever of us fits.</p>
          </div>
          <ContactForm />
        </div>
      </section>
      </main>

      <footer>
        <div className="wrap">
          <span>© 2026 LEJAK. All rights reserved.</span>
          <div className="footer-links">
            <a href="https://github.com/kubik191/lejak" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="#top">Back to top</a>
          </div>
        </div>
      </footer>
    </>
  );
}
