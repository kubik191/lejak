# LEJAK Agency Website (`WebSite`)

The client-facing marketing website and interactive workflow showcase for **LEJAK**, built with Next.js 15 App Router and deployed on Vercel.

- **Production URL:** https://lejakweb.vercel.app
- **Interactive Demos Subpage:** https://lejakweb.vercel.app/projects
- **Vercel Project:** `lejakweb` (`prj_pb0SUg3WyR10bnqmFNrGs6CJlmDX`)

---

## Design & Copy Principles

1. **Positioning:** Practical, human-first messaging—*"Work lighter. Move faster. We don't replace people. We give them time for what matters."*
2. **Client-Ready Generalized Showcase (`/projects`):** The interactive demos on `/projects` deliberately present **generalized business capabilities** in 100% English rather than exposing internal client/prototype names, Slovak hydrology labels, or source-code links.
3. **Clean Separation:** The homepage (`/`) remains scannable with concise workflow cards and links out to `/projects` for hands-on walkthroughs.

---

## Directory Structure

```text
WebSite/
  app/
    layout.jsx                     # Root HTML shell, Plus Jakarta Sans font, Vercel Analytics
    globals.css                    # Design tokens, layout grid, showcase & responsive rules
    page.jsx                       # Homepage (/) with hero, services, process, cards, team & contact
    projects/
      page.jsx                     # Dedicated subpage (/projects) hosting <ProjectShowcase />
    components/
      SiteHeader.jsx               # Sticky header with scroll detection & mobile menu drawer
      ProjectShowcase.jsx          # Interactive client-side walkthroughs for 3 automation patterns
      ContactForm.jsx              # Dual-recipient contact form with honeypot spam guard
  index.html                       # Legacy standalone static reference kept aligned with / copy
  onepager.jpg                     # Reference design visual
  package.json                     # Next.js 15, React 19, @vercel/analytics
```

---

## Architecture Details

### 1. Navigation & Routes
- [`app/components/SiteHeader.jsx`](./app/components/SiteHeader.jsx) uses Next.js `<Link>` routes (`/#services`, `/#how`, `/projects`, `/#people`, `/#contact`) so header navigation works identically from both `/` and `/projects`.
- A passive scroll listener toggles `.is-stuck` when `window.scrollY > 4`, adding a crisp bottom hairline to the translucent sticky header.
- Mobile viewports (`<= 900px`) collapse `.nav` into a CSS-driven toggle (`#nav-toggle`) paired with `closeMenu()`.

### 2. Interactive Capability Walkthroughs ([`app/components/ProjectShowcase.jsx`](./app/components/ProjectShowcase.jsx))
A self-contained client component (`"use client"`) implementing three stateful interactive simulators with zero backend dependencies:

| Tab | Capability | Interactive Mechanics |
|---|---|---|
| `01` | **Booking & Inbox** | Switch between 3 incoming customer email scenarios (*Booking request*, *Facility question*, *Needs manager*), watch intent classification & reply generation, and click **Simulate instant payment (€70)** to move `Sat · 14:00–16:00` (`REF-4821`) from `Hold 48h` to `Paid ✓` on the live venue calendar. |
| `02` | **Scheduled Data Collector** | Trigger **Run all collectors now** across 4 scheduled feeds (`Public Registry Feed`, `Supplier Stock & Pricing`, `Daily Operations Summary`, `Regional Sensor Network`) and toggle **Simulate 3× source failure** to preview automatic email escalation while healthy runs remain quiet. |
| `03` | **Workflow & Data Mapper** | Filter candidate records (`All`, `Ready to import`, `Flagged threshold`, `Already imported`), click rows to inspect field mappings and calculated lookup outputs, toggle checkboxes, and run **Backup & import selected** to trigger the simulated `_backups/destination_layer_backup.zip` snapshot. |

### 3. Contact Form ([`app/components/ContactForm.jsx`](./app/components/ContactForm.jsx))
- Submits JSON via `fetch` to `https://formsubmit.co/ajax/jakub.kucera@outlook.sk` with `_cc: "leogurtner@outlook.com"` so inquiries reach both co-owners simultaneously.
- Falls back to standard HTML `POST` if JavaScript is unavailable.
- Includes a hidden honeypot field (`_honey`) to silently discard automated bot submissions without breaking UX.
- Sanitizes `name` and `email` with `clean()` (stripping CR/LF header injection characters) and enforces `maxLength` bounds (`120`, `160`, `4000`).

### 4. Styling & Design Tokens ([`app/globals.css`](./app/globals.css))
- **Palette:** `--ink: #122033`, `--muted: #51627a`, `--blue: #2b6cff`, `--blue-deep: #1a4fd4`, `--ice: #e8f0ff`, `--paper: #f4f7fb`, `--navy: #0d1b33`, `--line: #e2e9f2`.
- **Breakpoints:** `@media (max-width: 900px)` stacks hero, grids, showcase tabs, and interactive demo panes into single columns; `@media (max-width: 640px)` optimizes mobile card spacing and form fields.

---

## Local Development & Verification

*(On Windows with PowerShell script execution restricted, invoke `npm.cmd`.)*

```bash
cd WebSite
npm.cmd install
npm.cmd run dev       # http://localhost:3000 (homepage) & http://localhost:3000/projects
npm.cmd run build     # Verifies static prerendering for / and /projects
```

Latest verified production build output (`Next.js 15.5.29`):
- `/` — `1.85 kB` (`108 kB` First Load JS), static
- `/projects` — `7.03 kB` (`113 kB` First Load JS), static
