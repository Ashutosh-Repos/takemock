# TakeMock Official Website

This directory contains the standalone, lightweight static marketing and download landing page for **TakeMock**.

## 🚀 Architectural Principles
- **Framework-free**: Plain HTML5, CSS3, HTMX, and minimal vanilla JavaScript. No heavy React/Vite/Next bundle required.
- **Fast & Lightweight**: Zero build steps. Loads in milliseconds.
- **SEO & Social Optimization**: Includes Open Graph, Twitter cards, JSON-LD structured data, `robots.txt`, and `sitemap.xml`.
- **macOS Design Language**: Tailored with San Francisco typography, Apple-inspired glassmorphism, responsive CBT question simulator with KaTeX math rendering, and dark/light mode toggle.

## 📁 Directory Structure
```text
website/
├── index.html              # Main single-page landing site
├── styles.css              # Custom responsive macOS-inspired design system
├── assets/
│   ├── icons/              # Favicons (32x32, 64x64, apple-touch-icon, light/dark icons)
│   └── images/             # Open Graph social preview (og-image.jpg)
├── robots.txt              # Search engine crawler instructions
├── sitemap.xml             # XML sitemap for SEO discovery
└── README.md               # Website documentation
```

## 🌐 Deployment Options

### 1. GitHub Pages (Recommended)
You can deploy this website directly via GitHub Pages:
1. Go to repository **Settings > Pages**.
2. Select **Deploy from a branch**.
3. Choose branch `main` and set the folder to `/website`.
4. Click **Save**. The website will be live at `https://ashutosh-repos.github.io/takemock/`.

### 2. Cloudflare Pages / Vercel / Netlify
Point the root directory to `website/` with no build command and output directory `.`.
