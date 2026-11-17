import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import ProjectShowcase from "../components/ProjectShowcase";

export const metadata = {
  title: "Projects & Interactive Demos — LEJAK",
  description:
    "Explore interactive walkthroughs of how LEJAK automates bookings, scheduled data collection, and repetitive multi-file workflows.",
};

export default function ProjectsPage() {
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <SiteHeader />
      <main id="content">
        <section className="section projects-hero">
          <div className="wrap">
            <div className="section-head section-head-wide">
              <div>
                <p className="eyebrow">Interactive workflow examples</p>
                <h1>See how we take over the repetitive parts.</h1>
                <p>
                  Every business has its own tools and routines. These three interactive walkthroughs show
                  the kinds of automation we build — keeping your team in control of every judgment call.
                </p>
              </div>
              <Link className="button button-ghost" href="/#contact">
                Talk about your workflow →
              </Link>
            </div>

            <ProjectShowcase />

            <div className="offer" style={{ marginTop: "1.5rem" }}>
              <div className="offer-grid">
                <div>
                  <p className="eyebrow">Built around your routine</p>
                  <h2>Have a slow, repetitive workflow?</h2>
                </div>
                <div>
                  <p style={{ color: "#c5d0e0", marginBottom: "1rem" }}>
                    Whether your team works out of an inbox, spreadsheets, or specialized desktop software,
                    we automate the busywork and leave the final decisions with your people.
                  </p>
                  <Link className="button button-primary" href="/#contact">
                    Tell us what you need
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>© 2026 LEJAK. All rights reserved.</span>
          <div className="footer-links">
            <Link href="/">Home</Link>
            <a href="#content">Back to top</a>
          </div>
        </div>
      </footer>
    </>
  );
}
