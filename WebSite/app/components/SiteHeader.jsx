"use client";

import Link from "next/link";
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
        <Link className="logo" href="/" aria-label="LEJAK home" onClick={closeMenu}>
          <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M23 7.5a10 10 0 1 0 .2 17" fill="none" stroke="#2b6cff" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
          LEJAK
        </Link>
        <input className="nav-toggle" id="nav-toggle" type="checkbox" ref={toggleRef} />
        <label className="nav-button" htmlFor="nav-toggle">Menu</label>
        <nav className="nav" aria-label="Primary">
          <Link href="/#services" onClick={closeMenu}>What we do</Link>
          <Link href="/#how" onClick={closeMenu}>How it works</Link>
          <Link href="/projects" onClick={closeMenu}>Projects</Link>
          <Link href="/#people" onClick={closeMenu}>People</Link>
          <Link className="button button-primary" href="/#contact" onClick={closeMenu}>Contact us</Link>
        </nav>
      </div>
    </header>
  );
}
