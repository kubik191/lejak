"use client";

import { useEffect, useRef } from "react";

export default function SiteHeader() {
  const headerRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    const onScroll = () =>
      headerRef.current?.classList.toggle("is-stuck", window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => {
    if (toggleRef.current) toggleRef.current.checked = false;
  };

  return (
    <header className="site-header" ref={headerRef}>
      <div className="wrap header-inner">
        <a className="logo" href="#top" aria-label="LEJAK home">
          <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M23 7.5a10 10 0 1 0 .2 17" fill="none" stroke="#2b6cff" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
          LEJAK
        </a>
        <input className="nav-toggle" id="nav-toggle" type="checkbox" ref={toggleRef} />
        <label className="nav-button" htmlFor="nav-toggle">Menu</label>
        <nav className="nav" aria-label="Primary">
          <a href="#services" onClick={closeMenu}>What we do</a>
          <a href="#how" onClick={closeMenu}>How it works</a>
          <a href="#examples" onClick={closeMenu}>Projects</a>
          <a href="#people" onClick={closeMenu}>People</a>
          <a
            href="https://github.com/kubik191/lejak"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
          >
            GitHub
          </a>
          <a className="button button-primary" href="#contact" onClick={closeMenu}>Contact us</a>
        </nav>
      </div>
    </header>
  );
}
