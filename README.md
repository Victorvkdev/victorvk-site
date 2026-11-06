# victorvk.com

![victorvk.com](public/og/home-en.jpg)

Portfolio site of Victor "Vk" Cavalcante, product designer and front-end developer.
**Live:** [victorvk.com](https://victorvk.com) · [Português](https://victorvk.com/pt/)

A static site with no framework at runtime. One source file holds the content, styles and scripts;
a Python build renders every page in a headless browser, checks it, and writes plain HTML to `public/`.
Cloudflare serves `public/` and a small Worker handles the API for the game.

## What's inside

- **Home + case studies, EN and PT.** Each project in the `CASES` array becomes its own page
  (`/work/<id>/` and `/pt/work/<id>/`) with its own Open Graph image, structured data and sitemap entry.
- **Krowlect** (`/game/`): a medieval idle/clicker game in vanilla ES modules, pixel art generated from code,
  no dependencies, no bundler. See [public/game/README.md](public/game/README.md).
- **Krowlect API** (`worker/`): register, login, cloud save and leaderboard on a Cloudflare Worker + D1,
  passwords hashed with PBKDF2, rate-limited endpoints.
- **Lab** (`/lab/`): concept product pages (Tinker, Vantle Card).

## Build checks

`build.py` fails the build (exit 1) when any page has:

- a JavaScript error while rendering
- a broken local link, image or `og:image`
- an `<img>` without `alt`, `width` and `height`
- more or fewer than one `<h1>`
- an EN/PT switch pointing to the wrong page
- a forbidden word (private list kept out of the repo) or a leftover `TODO`/`TBD`

The same checks run on every pull request through GitHub Actions.

## SEO and privacy

- Canonical URLs, `hreflang`, JSON-LD (`Person`, `FAQPage`, case pages), `sitemap.xml`, `robots.txt` and `llms.txt`, all generated.
- Google Analytics 4 with Consent Mode v2: denied by default in the EU/EEA/UK/CH, cookie bar shown only there.
- Security headers via `_headers`.

## Stack

HTML, CSS, vanilla JavaScript · Python + Playwright (build) · Cloudflare Workers, static assets and D1 · Three.js (3D scene).

## Run locally

```bash
pip install playwright && playwright install chromium   # once
python3 build.py                                         # build + checks
python3 -m http.server 8000 --directory public           # open http://localhost:8000
```

## Workflow

`main` is production; every push to it deploys. Work happens on `dev` (Cloudflare preview URL) or a short-lived branch,
then goes to `main` through a pull request. Maintenance notes in Portuguese: [docs/MANUTENCAO.md](docs/MANUTENCAO.md).

## License

Code is MIT. Text, images, case studies and CV are © Victor Cavalcante, all rights reserved.
