#!/usr/bin/env python3
"""
Build victorvk.com (EN + PT + one page per project + CVs + OG images) from src/.

Usage (from the repo root):
    pip install playwright && playwright install chromium     # once
    python3 build.py

Sources:  src/index.src.html (content, CASES, CSS, JS), src/tokens.css (design tokens, the single source
          for colors, type, space, radius and motion) and src/cv/*.pdf (Master CVs, copied as is).
Writes:   public/index.html, public/pt/index.html, public/work/<id>/, public/pt/work/<id>/,
          public/design-system/ (EN + PT) and public/design-system/tokens.json,
          public/404.html, public/cv/*.pdf, public/og/home-{en,pt}.jpg, sitemap.xml, robots.txt,
          llms.txt, _headers and _redirects. Images, fonts and icons already in public/ are not touched.

The build fails (exit 1) on any JS error while rendering, a blacklisted word, a broken local
link, an <img> without alt/width/height, a wrong language switch or a page without exactly one h1.
"""
import asyncio, json, os, re, sys, shutil, datetime, threading, functools, subprocess
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, unquote
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(ROOT, "public")
SRC_PATH = os.path.join(ROOT, "src", "index.src.html")
CV_DIR = os.path.join(ROOT, "src", "cv")
SRC = open(SRC_PATH, encoding="utf-8").read()
TOKENS_PATH = os.path.join(ROOT, "src", "tokens.css")
TOKENS_CSS = open(TOKENS_PATH, encoding="utf-8").read()


def parse_tokens(css):
    """tokens.css -> {"groups": [{"id", "selector", "tokens": [[name, value], ...]}]} (order kept)."""
    groups = []
    for m in re.finditer(r"/\*\s*@group\s+([\w.]+)\s*\*/\s*([^{]+)\{(.*?)\}", css, re.S):
        toks = [[n, re.sub(r"\s+", " ", v).strip()] for n, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(3))]
        groups.append({"id": m.group(1), "selector": m.group(2).strip(), "tokens": toks})
    return {"name": "Violet Ink", "version": "1.0.0", "source": "https://github.com/Victorvkdev/victorvk-site/blob/main/src/tokens.css", "groups": groups}


TOKENS = parse_tokens(TOKENS_CSS)
SRC = SRC.replace("/*@TOKENS@*/", re.sub(r"/\*.*?\*/\s*", "", TOKENS_CSS, flags=re.S).strip()).replace("/*@TOKENS_JSON@*/null", json.dumps(TOKENS, ensure_ascii=False))
SITE = "https://victorvk.com"
GA = "G-3H81YHRL1H"
TODAY = datetime.date.today().isoformat()
EMAIL = "hello@victorvk.com"
NAME = 'Victor "Vk" Cavalcante'
SAME_AS = ["https://www.linkedin.com/in/victorvk", "https://www.behance.net/victorvk", "https://github.com/Victorvkdev"]
BOOKING_URL = "https://cal.com/victorvk/intro"  # Cal.com 30-min link. When set, the hero and the contact band show a booking button.
PORTRAIT = "/img/vk.webp"  # 600x800 (3:4). Hero portrait card + Contact avatar + Person.image, only if the file exists.
PORTRAIT_400 = "/img/vk-400.webp"  # 400w variant (<= 30 KB) for srcset and the 64px Contact avatar.
HAS_PORTRAIT = os.path.exists(os.path.join(PUB, PORTRAIT.lstrip("/")))
CV_FILES = {"en": "/cv/Victor-Cavalcante-CV-EN.pdf", "pt": "/cv/Victor-Cavalcante-CV-PT.pdf"}
OG = {"en": "/og/home-en.jpg", "pt": "/og/home-pt.jpg"}

# Words that must never ship (case-insensitive), plus markers matched as whole uppercase words.
# Termos proibidos ficam fora do repo, em blacklist.local.txt (um por linha).
_BL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blacklist.local.txt")
BLACKLIST = [l.strip() for l in open(_BL, encoding="utf-8") if l.strip()] if os.path.exists(_BL) else []
BLACKLIST_CS = [r"\bTODO\b", r"\bTBD\b"]

HOME = {
    "en": {
        "title": "Victor Cavalcante (Vk) · Product Designer (UX/UI) & Front-end Developer, Remote",
        "desc": "Product designer (UX/UI) and front-end developer from Brazil, open to remote roles. 7 years of experience, 6 in product design and UI/UX. Case studies, CV and design system.",
        "locale": "en_US", "back": "All work", "case": "case study",
        "og_alt": "Victor Cavalcante, Product Designer (UX/UI) & Front-end Developer",
        "role": "Product Designer (UX/UI) & Front-end Developer · Remote from Brazil",
        "h1": "Hi, I'm Vk. I design products and build them.",
        "booking": "Book a 30-min call",
        "portrait_alt": "Victor “Vk” Cavalcante", "hud": ["Vk", "Brazil", "UTC-3", "English C1"], "chip": "design → code",
        "services": ["Flow Audit", "Product design & UX research", "Conversion & onboarding", "Design systems & front-end", "Gamification & retention"],
    },
    "pt": {
        "title": "Victor Cavalcante (Vk) · Product Designer (UX/UI) & Front-end Developer, remoto",
        "desc": "Product designer (UX/UI) e front-end developer no Brasil, aberto a vagas remotas. 7 anos de experiência, 6 em product design e UI/UX. Estudos de caso, CV e design system.",
        "locale": "pt_BR", "back": "Todos os projetos", "case": "estudo de caso",
        "og_alt": "Victor Cavalcante, Product Designer (UX/UI) & Front-end Developer",
        "role": "Product Designer (UX/UI) & Front-end Developer · Remoto, do Brasil",
        "h1": "Oi, eu sou o Vk. Eu projeto produtos e coloco no ar.",
        "booking": "Agendar conversa de 30 min",
        "portrait_alt": "Victor “Vk” Cavalcante", "hud": ["Vk", "Brasil", "UTC-3", "Inglês C1"], "chip": "design → código",
        "services": ["Flow Audit", "Design de produto e pesquisa de UX", "Conversão e onboarding", "Design systems e front-end", "Gamificação e retenção"],
    },
}


def fail(msg):
    print("BUILD FAILED:", msg, file=sys.stderr)
    sys.exit(1)


def prefix(lang): return "/pt" if lang == "pt" else ""
def url(path): return SITE + path
def esc(s): return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
def inlang(lang): return "pt-BR" if lang == "pt" else "en"
def trunc(s, n=158):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0].rstrip(",;:.") + "…"


def blacklist_hits(text):
    low = text.lower()
    hits = [w for w in BLACKLIST if w.lower() in low]
    hits += [p for p in BLACKLIST_CS if re.search(p, text)]
    return hits


# ---------------------------------------------------------------- structured data
def person_node():
    return {
        "@type": "Person", "@id": SITE + "/#person", "name": NAME,
        "alternateName": ["Vk Cavalcante", "Victor Cavalcante"], "url": SITE + "/", "email": EMAIL,
        "image": SITE + (PORTRAIT if HAS_PORTRAIT else OG["en"]), "jobTitle": "Product Designer (UX/UI) & Front-end Developer",
        "description": "Product designer (UX/UI) and front-end developer from Brazil with 7 years of experience, 6 in product design and UI/UX. Designs and builds products people come back to.",
        "address": {"@type": "PostalAddress", "addressCountry": "BR"},
        "knowsLanguage": ["pt-BR", "en"], "sameAs": SAME_AS,
        "knowsAbout": ["Product design", "UX design", "UX research", "User-centered design", "Conversion rate optimization", "Onboarding",
                       "UI design", "Mobile app design", "Web design", "Prototyping", "Usability testing", "Accessibility",
                       "Design systems", "Gamification", "CRM", "Front-end development", "React", "Next.js", "Figma"],
    }


def home_jsonld(lang, faqs):
    cfg = HOME[lang]
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/", "name": NAME,
         "inLanguage": ["en", "pt-BR"], "publisher": {"@id": SITE + "/#person"}},
        person_node(),
        {"@type": "ProfilePage", "@id": url(prefix(lang) + "/") + "#page", "url": url(prefix(lang) + "/"),
         "name": cfg["title"], "description": cfg["desc"], "inLanguage": inlang(lang),
         "isPartOf": {"@id": SITE + "/#website"}, "mainEntity": {"@id": SITE + "/#person"},
         "primaryImageOfPage": {"@type": "ImageObject", "url": SITE + OG[lang], "width": 1200, "height": 630}},
        {"@type": "Service", "@id": SITE + "/#service", "name": NAME + " · Product design & front-end",
         "serviceType": "Product design, UX and front-end development", "url": SITE + "/",
         "provider": {"@id": SITE + "/#person"}, "areaServed": "Worldwide", "availableLanguage": ["English", "Portuguese"],
         "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Services", "itemListElement": [
             {"@type": "Offer", "itemOffered": {"@type": "Service", "name": n}} for n in cfg["services"]]}},
        {"@type": "FAQPage", "@id": url(prefix(lang) + "/") + "#faq", "inLanguage": inlang(lang),
         "mainEntity": [{"@type": "Question", "name": q[0], "acceptedAnswer": {"@type": "Answer", "text": q[1]}} for q in faqs]},
    ]}


def case_jsonld(lang, c, d, page_url, img):
    cfg = HOME[lang]
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "CreativeWork", "@id": page_url + "#work", "name": d["title"], "headline": d["title"],
         "description": trunc(d["sum"], 300), "url": page_url, "image": img, "inLanguage": inlang(lang),
         "keywords": ", ".join(c["tags"]), "author": {"@id": SITE + "/#person"}, "creator": {"@id": SITE + "/#person"},
         "isPartOf": {"@id": SITE + "/#website"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": NAME, "item": url(prefix(lang) + "/")},
            {"@type": "ListItem", "position": 2, "name": cfg["back"], "item": url(prefix(lang) + "/") + "#work"},
            {"@type": "ListItem", "position": 3, "name": d["title"], "item": page_url}]},
        person_node(),
    ]}


# ---------------------------------------------------------------- <head>
ANALYTICS = """<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",region:["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","NL","NO","PL","PT","RO","SK","SI","ES","SE","GB","CH"]});
gtag("consent","default",{analytics_storage:"granted",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});
(function(){var K="vk-consent",c=null;try{c=localStorage.getItem(K)}catch(e){}
if(c==="granted"||c==="denied")gtag("consent","update",{analytics_storage:c});
gtag("js",new Date());gtag("config","__GA__",{transport_type:"beacon"});
var done=0;function load(){if(done)return;done=1;var s=document.createElement("script");s.async=1;s.src="https://www.googletagmanager.com/gtag/js?id=__GA__";document.head.appendChild(s)}
addEventListener("load",function(){(window.requestIdleCallback||function(f){setTimeout(f,1200)})(load,{timeout:4000})});
addEventListener("scroll",load,{once:true,passive:true});addEventListener("click",load,{once:true});
var tz="";try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(e){}
if(c||tz.indexOf("Europe/")!==0)return;
document.addEventListener("DOMContentLoaded",function(){var pt=document.documentElement.lang.indexOf("pt")===0,b=document.createElement("div");
b.className="consent";b.setAttribute("role","region");b.setAttribute("aria-label",pt?"Cookies":"Cookies");
b.innerHTML="<p>"+(pt?"Cookies de análise me ajudam a melhorar o site.":"Analytics cookies help me improve this site.")+"</p><button type=button class=ok>OK</button><button type=button class=no>"+(pt?"Não, obrigado":"No thanks")+"</button>";
function set(v){try{localStorage.setItem(K,v)}catch(e){}gtag("consent","update",{analytics_storage:v});b.remove()}
b.querySelector(".ok").onclick=function(){set("granted")};b.querySelector(".no").onclick=function(){set("denied")};document.body.appendChild(b)})})();
</script>""".replace("__GA__", GA)


# Applies a stored theme choice before first paint. Never reads matchMedia, so the prerender bakes no theme in.
# Dark is the default. A stored "light" choice is applied before first paint; the prerender bakes no theme in.
THEME_BOOT = "<script>try{if(localStorage.getItem('vk-theme-2')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}</script>"
# The home hero shows a still deck of three case screens until the 3D scene starts; preload them.
PORTRAIT_PRELOAD = ('<link rel="preload" as="image" href="/img/w/orra-hero-titanium.webp" fetchpriority="high">\n'
                    '<link rel="preload" as="image" href="/img/w/tinker-hero.webp">\n<link rel="preload" as="image" href="/img/w/4play-home-desktop-hero.webp">\n')


def head(lang, title, desc, path_en, path_pt, og_image, jsonld, og_type="website", robots="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1", canonical=True, preload_portrait=False):
    if og_image.startswith(SITE + "/og/"):
        _f = os.path.join(PUB, og_image[len(SITE) + 1:])
        if os.path.exists(_f):
            import hashlib
            og_image += "?v=" + hashlib.md5(open(_f, "rb").read()).hexdigest()[:8]
    cur = path_pt if lang == "pt" else path_en
    other_locale = "en_US" if lang == "pt" else "pt_BR"
    h = f'''<meta charset="utf-8">
{THEME_BOOT}
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="{robots}">
<meta name="author" content="{esc(NAME)}">
<meta name="theme-color" content="#07060b">
<meta name="color-scheme" content="dark light">
'''
    if preload_portrait:
        h += PORTRAIT_PRELOAD
    if canonical:
        h += f'<link rel="canonical" href="{url(cur)}">\n'
        if path_pt:
            h += f'<link rel="alternate" hreflang="en" href="{url(path_en)}">\n<link rel="alternate" hreflang="pt-BR" href="{url(path_pt)}">\n<link rel="alternate" hreflang="x-default" href="{url(path_en)}">\n'
    h += f'''<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{esc(NAME)}">
<meta property="og:locale" content="{HOME[lang]['locale']}">
<meta property="og:locale:alternate" content="{other_locale}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{url(cur)}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="{esc(HOME[lang]['og_alt'])}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{og_image}">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
'''
    h += ANALYTICS + "\n"
    h += '<script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False, separators=(",", ":")) + "</script>"
    return h


def src_for(lang):
    """Source with placeholders resolved for a language (used for rendering)."""
    s = SRC.replace('<html lang="en">', f'<html lang="{inlang(lang)}">', 1)
    s = s.replace("<!--URL_EN-->", "/").replace("<!--URL_PT-->", "/pt/").replace("<!--URL_HOME-->", prefix(lang) + "/")
    cfg = HOME[lang]
    hud = '<i aria-hidden="true">·</i>'.join(f"<span>{esc(x)}</span>" for x in cfg["hud"][1:])
    portrait = (f'<figure class="portrait"><img src="{PORTRAIT}" srcset="{PORTRAIT_400} 400w, {PORTRAIT} 600w" sizes="(max-width: 899px) 90vw, 440px" width="600" height="800" loading="lazy" decoding="async" alt="{esc(cfg["portrait_alt"])}">'
                '</figure>' if HAS_PORTRAIT else "")
    s = s.replace("<!--PORTRAIT-->", portrait)
    book_attrs = f'href="{esc(BOOKING_URL)}" target="_blank" rel="noopener" data-ev="booking_click"'
    hero_booking = (f'<a class="btn btn-violet" {book_attrs} data-service="hero">{esc(cfg["booking"])} <span aria-hidden="true">↗</span></a>' if BOOKING_URL else "")
    s = s.replace("<!--BOOKING_HERO-->", hero_booking)
    avatar = (f'<img src="{PORTRAIT_400}" width="64" height="64" alt="{esc(cfg["portrait_alt"])}" loading="lazy" decoding="async">' if HAS_PORTRAIT else "")
    booking = (f'<div class="book-row">{avatar}<a class="btn btn-book" {book_attrs} data-service="contact">{esc(cfg["booking"])} <span aria-hidden="true">↗</span></a></div>'
               if BOOKING_URL else "")
    s = s.replace("<!--BOOKING-->", booking)
    return s.replace("<!--SEO_HEAD-->", "<meta charset='utf-8'><title>render</title>").replace("<!--PRE_HEAD-->", "")


def write(path, content):
    full = os.path.join(PUB, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    mode = "wb" if isinstance(content, bytes) else "w"
    with open(full, mode, **({} if mode == "wb" else {"encoding": "utf-8"})) as f:
        f.write(content)


# ---------------------------------------------------------------- local render server
VIRTUAL = {}  # path -> bytes, served from memory (no temp files on disk)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path in VIRTUAL:
            body = VIRTUAL[path]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def translate_path(self, path):
        p = unquote(urlparse(path).path).lstrip("/")
        for base in (PUB, ROOT):
            full = os.path.normpath(os.path.join(base, p))
            if full.startswith(base) and os.path.exists(full):
                return full
        return os.path.join(PUB, p)


def start_server():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=PUB))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


OG_BASE_CSS = """@font-face{font-family:B;font-weight:100 900;src:url(/fonts/geist.woff2) format("woff2")}
@font-face{font-family:G;font-weight:100 900;src:url(/fonts/geist.woff2) format("woff2")}
@font-face{font-family:M;font-weight:100 900;src:url(/fonts/geist-mono.woff2) format("woff2")}
*{box-sizing:border-box}html,body{margin:0}
body{width:1200px;height:630px;overflow:hidden;position:relative;color:#f3f0fa;font-family:G,Arial,sans-serif;
background:radial-gradient(circle at 88% 12%,rgba(108,76,245,.55),transparent 52%),radial-gradient(circle at 0% 100%,rgba(85,53,217,.28),transparent 50%),#07060b}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:48px 48px}
.left{position:absolute;left:72px;top:64px;bottom:60px;display:flex;flex-direction:column;justify-content:space-between}
.name{font-family:B;font-weight:700;font-size:26px;letter-spacing:-.01em}
.pill{display:inline-flex;align-items:center;gap:10px;margin-top:18px;padding:8px 14px;border-radius:999px;border:1px solid #3a2f50;background:rgba(29,22,41,.8);font-size:17px;color:#e6deff}
.pill i{width:9px;height:9px;border-radius:50%;background:#3ddc97;box-shadow:0 0 0 4px rgba(61,220,151,.18)}
.kind{font-family:M;font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:#b9a6ff}
h1{font-family:B;font-weight:600;line-height:1.02;letter-spacing:-.045em;margin:0}
.sub{font-size:22px;line-height:1.4;color:#a9a1c0;margin:0}
.foot{display:flex;align-items:center;gap:14px;font-size:18px;color:#a9a1c0}
.foot b{font-family:M;font-weight:500;color:#f3f0fa}
.foot i{width:36px;height:3px;background:#7c5cff;display:block}
"""

OG_TEMPLATE = """<!doctype html><html lang="__LANG__"><head><meta charset="utf-8"><style>""" + OG_BASE_CSS + """
.left{width:640px}
h1{font-size:56px}
.card{position:absolute;right:78px;top:70px;width:330px;padding:12px 12px 6px;background:#f6f4fb;border-radius:18px;transform:rotate(3deg);box-shadow:0 30px 80px rgba(0,0,0,.55)}
.card img{display:block;width:100%;height:384px;object-fit:cover;border-radius:10px}
.hud{font-family:M;font-size:15px;color:#5a5470;padding:10px 4px 6px}.hud b{color:#15111f}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{font-family:M;font-size:15px;padding:6px 10px;border-radius:6px;background:#1d1629;border:1px solid #2f2542;color:#cfc6ea}
</style></head><body><div class="grid"></div>
<div class="left"><div><div class="name">__NAME__</div><div class="pill"><i></i>__AVAIL__</div></div>
<div style="display:grid;gap:22px"><h1>__H1__</h1><div class="chips">__CHIPS__</div></div>
<div class="foot"><i></i><span>__ROLE__</span><b>victorvk.com</b></div></div>
__CARD__
</body></html>"""

OG_CASE = """<!doctype html><html lang="__LANG__"><head><meta charset="utf-8"><style>""" + OG_BASE_CSS + """
.left{width:470px}
h1{font-size:54px;margin-top:14px}
.sub{margin-top:18px;font-size:21px}
.shot{position:absolute;left:588px;top:72px;width:700px;height:486px;border-radius:18px;overflow:hidden;border:1px solid #3a2f50;box-shadow:0 30px 90px rgba(0,0,0,.6);background:#15101f}
.shot img{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}
</style></head><body><div class="grid"></div>
<div class="left"><div class="name">Victor “Vk” Cavalcante</div>
<div><div class="kind">__KIND__</div><h1>__TITLE__</h1><p class="sub">__RES__</p></div>
<div class="foot"><i></i><span>__ROLE__</span><b>victorvk.com</b></div></div>
<div class="shot"><img src="__IMG__" alt=""></div>
</body></html>"""

OG_TXT = {
    "en": {"avail": "Open to remote roles", "chips": ["UX/UI", "Product design", "Design systems", "Front-end"], "role": "Product Designer"},
    "pt": {"avail": "Aberto a vagas remotas", "chips": ["UX/UI", "Product design", "Design systems", "Front-end"], "role": "Product Designer"},
}



async def main():
    errors = []
    srv, base = start_server()
    for p_ in (os.path.join(PUB, "work"), os.path.join(PUB, "pt", "work")):
        shutil.rmtree(p_, ignore_errors=True)
    stale_og = os.path.join(PUB, "og.png")
    if os.path.exists(stale_og):
        os.remove(stale_og)

    # CVs: the Master CV PDFs (no phone) live in src/cv/ and are copied as is
    os.makedirs(os.path.join(PUB, "cv"), exist_ok=True)
    for lang in ("en", "pt"):
        name = os.path.basename(CV_FILES[lang])
        srcpdf = os.path.join(CV_DIR, name)
        if not os.path.exists(srcpdf): fail(f"missing src/cv/{name}")
        shutil.copyfile(srcpdf, os.path.join(PUB, CV_FILES[lang].lstrip("/")))

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        await ctx.add_init_script("window.__BUILD = true")
        await ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())

        def watch(pg, label):
            pg.on("pageerror", lambda e: errors.append(f"{label}: pageerror: {e}"))
            pg.on("console", lambda m: errors.append(f"{label}: console: {m.text}") if m.type == "error" and "favicon" not in m.text else None)

        # ---- render home (EN, PT) and collect case bodies
        cases, faqs, pages = None, {}, {}
        for lang in ("en", "pt"):
            vpath = f"/_render_{lang}.html"
            VIRTUAL[vpath] = src_for(lang).encode("utf-8")
            pg = await ctx.new_page(); watch(pg, f"render.{lang}")
            await pg.goto(base + vpath, wait_until="networkidle")
            await pg.wait_for_function("document.querySelectorAll('#cases .case').length > 0")
            if cases is None:
                cases = await pg.evaluate("CASES.map(c=>({id:c.id,img:c.img||null,phones:c.phones||null,tags:c.tags,en:c.en,pt:c.pt}))")
            faqs[lang] = await pg.evaluate("FAQS.map(f=>f[lang])")
            works = await pg.evaluate("CASES.map(c=>[c.id, casePage(c.id)])")
            ds_body = await pg.evaluate("dsPage()")
            await pg.evaluate("document.getElementById('app').remove()")
            dom = await pg.evaluate("document.documentElement.outerHTML")
            pages[lang] = {"dom": dom, "works": dict(works), "ds": ds_body}
            await pg.close()
            del VIRTUAL[vpath]

        # ---- OG images (dark, portrait / case screenshot)
        os.makedirs(os.path.join(PUB, "og"), exist_ok=True)
        jobs = []
        for lang in ("en", "pt"):
            tx = OG_TXT[lang]
            card = ('<div class="card"><img src="' + PORTRAIT + '" alt=""><div class="hud"><b>Vk</b> · ' + ("Brasil" if lang == "pt" else "Brazil") + ' · UTC-3</div></div>') if HAS_PORTRAIT else ""
            html = (OG_TEMPLATE.replace("__LANG__", inlang(lang)).replace("__NAME__", esc(NAME.replace('"Vk"', "“Vk”")))
                    .replace("__AVAIL__", esc(tx["avail"])).replace("__H1__", esc(HOME[lang]["h1"]))
                    .replace("__CHIPS__", "".join(f"<span>{esc(c)}</span>" for c in tx["chips"]))
                    .replace("__ROLE__", esc(HOME[lang]["role"].split(" · ")[0])).replace("__CARD__", card))
            jobs.append((f"/_og_{lang}.html", html, OG[lang]))
            for c in cases:
                if not c.get("img"):
                    continue
                d = c[lang]
                html = (OG_CASE.replace("__LANG__", inlang(lang)).replace("__KIND__", esc(d["kind"].split(" · ")[0]))
                        .replace("__TITLE__", esc(d["title"])).replace("__RES__", esc(d["res"]))
                        .replace("__ROLE__", esc(OG_TXT[lang]["role"])).replace("__IMG__", c["img"]))
                jobs.append((f"/_og_{c['id']}_{lang}.html", html, f"/og/work-{c['id']}-{lang}.jpg"))
        for vpath, html, out in jobs:
            VIRTUAL[vpath] = html.encode("utf-8")
            pg = await b.new_page(viewport={"width": 1200, "height": 630}); watch(pg, f"og{vpath}")
            await pg.goto(base + vpath, wait_until="networkidle")
            await pg.evaluate("document.fonts.ready")
            await pg.screenshot(path=os.path.join(PUB, out.lstrip("/")), type="jpeg", quality=86)
            await pg.close()
            del VIRTUAL[vpath]
        await b.close()
    srv.shutdown()
    if errors:
        fail("errors while rendering:\n  " + "\n  ".join(errors))

    # CV PDFs: no phone number (when pdftotext exists)
    if shutil.which("pdftotext"):
        for lang in ("en", "pt"):
            txt = subprocess.run(["pdftotext", os.path.join(PUB, CV_FILES[lang].lstrip("/")), "-"], capture_output=True, text=True).stdout
            if re.search(r"\+?\d{2}\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}", txt): fail(f"phone number in {CV_FILES[lang]}")
    else:
        print("WARNING: pdftotext not found, skipped the blacklist check on the CV PDFs")

    pre_head = SRC[SRC.index("<!--PRE_HEAD-->") + len("<!--PRE_HEAD-->"):SRC.index("</head>")].lstrip()
    written = []  # (path, lang, path_en, path_pt, kind)

    def piece(dom, pattern):
        m = re.search(pattern, dom, re.S)
        if not m: fail(f"pattern not found in rendered page: {pattern}")
        return m.group(0)

    # ---- home pages
    for lang in ("en", "pt"):
        cfg = HOME[lang]
        d = pages[lang]["dom"]
        body = d[d.index("<body"):].replace("</html>", "").rstrip()
        hd = head(lang, cfg["title"], cfg["desc"], "/", "/pt/", SITE + OG[lang], home_jsonld(lang, faqs[lang]), preload_portrait=True)
        html = f'<!doctype html>\n<html lang="{inlang(lang)}"><head>\n{hd}\n{pre_head}</head>\n{body}\n</html>\n'
        out = ("pt/" if lang == "pt" else "") + "index.html"
        write(out, html)
        written.append((out, lang, "/", "/pt/", "home"))

    # ---- work pages
    for lang in ("en", "pt"):
        cfg = HOME[lang]
        home = prefix(lang) + "/"
        d = pages[lang]["dom"]
        nav = piece(d, r'<nav class="nav".*?</nav>')
        menu = piece(d, r'<dialog id="menu".*?</dialog>')
        foot = piece(d, r"<footer>.*?</footer>")
        skip = piece(d, r'<a class="skip".*?</a>')
        common = piece(d, r'<script id="common">.*?</script>')
        nav = re.sub(r'href="#([\w-]+)"', lambda m: f'href="{home}#{m.group(1)}"', nav)
        menu = re.sub(r'href="#([\w-]+)"', lambda m: f'href="{home}#{m.group(1)}"', menu)
        for c in cases:
            cid = c["id"]
            dd = c[lang]
            path_en, path_pt = f"/work/{cid}/", f"/pt/work/{cid}/"
            cur = path_pt if lang == "pt" else path_en
            img = SITE + (f"/og/work-{cid}-{lang}.jpg" if c.get("img") else OG[lang])
            title = f'{dd["title"]}: {cfg["case"]} | Victor Cavalcante'
            if len(title) > 60: title = f'{dd["title"]} | Victor Cavalcante'
            if len(title) > 60: title = dd["title"]
            desc = trunc(dd["sum"])
            body = pages[lang]["works"][cid]
            others = "".join(f'<li><a href="{prefix(lang)}/work/{o["id"]}/">{esc(o[lang]["title"])}</a></li>' for o in cases if o["id"] != cid)

            def fix_lang(s):
                s = re.sub(r'<a href="[^"]*"( (?:id|class)="lang-en")', lambda m: f'<a href="{path_en}"{m.group(1)}', s)
                return re.sub(r'<a href="[^"]*"( (?:id|class)="lang-pt")', lambda m: f'<a href="{path_pt}"{m.group(1)}', s)
            hd = head(lang, title, desc, path_en, path_pt, img, case_jsonld(lang, c, dd, url(cur), img), og_type="article")
            html = f'''<!doctype html>
<html lang="{inlang(lang)}"><head>
{hd}
{pre_head}</head>
<body class="nav-page">
{skip}
{fix_lang(nav)}
{fix_lang(menu)}
<main id="main" tabindex="-1"><div class="wrap cp">
{body}
<section class="more" aria-labelledby="more-t"><h2 id="more-t">{"Outros projetos" if lang == "pt" else "More projects"}</h2><ul>{others}</ul></section>
</div></main>
{foot}
{common}
</body></html>
'''
            out = cur.strip("/") + "/index.html"
            write(out, html)
            written.append((out, lang, path_en, path_pt, "work"))

    # ---- design system pages
    write("design-system/tokens.json", json.dumps(TOKENS, ensure_ascii=False, indent=2) + "\n")
    for lang in ("en", "pt"):
        home = prefix(lang) + "/"
        d = pages[lang]["dom"]
        nav = re.sub(r'href="#([\w-]+)"', lambda m: f'href="{home}#{m.group(1)}"', piece(d, r'<nav class="nav".*?</nav>'))
        menu = re.sub(r'href="#([\w-]+)"', lambda m: f'href="{home}#{m.group(1)}"', piece(d, r'<dialog id="menu".*?</dialog>'))
        foot, skip, common = piece(d, r"<footer>.*?</footer>"), piece(d, r'<a class="skip".*?</a>'), piece(d, r'<script id="common">.*?</script>')
        path_en, path_pt = "/design-system/", "/pt/design-system/"
        cur = path_pt if lang == "pt" else path_en
        def fix_lang_ds(s):
            s = re.sub(r'<a href="[^"]*"( (?:id|class)="lang-en")', lambda m: f'<a href="{path_en}"{m.group(1)}', s)
            return re.sub(r'<a href="[^"]*"( (?:id|class)="lang-pt")', lambda m: f'<a href="{path_pt}"{m.group(1)}', s)
        title = "Violet Ink · Design system | Victor Cavalcante"
        desc = ("O design system aberto deste site: tokens, componentes, temas e regras de acessibilidade, com tokens.json para baixar."
                if lang == "pt" else "The open design system behind this site: tokens, components, theming and accessibility rules, with a downloadable tokens.json.")
        jl = {"@context": "https://schema.org", "@graph": [
            {"@type": "CreativeWork", "@id": url(cur) + "#ds", "name": "Violet Ink design system", "description": desc, "url": url(cur),
             "inLanguage": inlang(lang), "author": {"@id": SITE + "/#person"}, "isPartOf": {"@id": SITE + "/#website"}}, person_node()]}
        hd = head(lang, title, desc, path_en, path_pt, SITE + OG[lang], jl, og_type="article")
        html = f'''<!doctype html>
<html lang="{inlang(lang)}"><head>
{hd}
{pre_head}</head>
<body class="nav-page">
{skip}
{fix_lang_ds(nav)}
{fix_lang_ds(menu)}
<main id="main" tabindex="-1"><div class="wrap cp">
{pages[lang]["ds"]}
</div></main>
{foot}
{common}
</body></html>
'''
        out = cur.strip("/") + "/index.html"
        write(out, html)
        written.append((out, lang, path_en, path_pt, "work"))

    # ---- 404 (noindex, no canonical, links to every page)
    links_en = "".join(f'<li><a href="/work/{c["id"]}/">{esc(c["en"]["title"])}</a></li>' for c in cases)
    links_pt = "".join(f'<li><a href="/pt/work/{c["id"]}/">{esc(c["pt"]["title"])}</a></li>' for c in cases)
    nf_head = head("en", "Page not found | Victor Cavalcante", "This page does not exist.", "/", None, SITE + OG["en"],
                   {"@context": "https://schema.org", "@type": "WebPage", "name": "Page not found"}, robots="noindex", canonical=False)
    write("404.html", f'''<!doctype html>
<html lang="en"><head>
{nf_head}
{pre_head}<style>.nf{{padding-block:clamp(56px,9vw,104px)}}.nf .lv{{display:inline-flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:12.5px;letter-spacing:.02em;text-transform:uppercase;color:var(--accent-ink)}}.nf .lv::before{{content:"";width:6px;height:6px;background:var(--highlight);transform:rotate(45deg)}}.nf h1{{font-size:clamp(38px,6vw,68px);line-height:1.04;letter-spacing:-.03em;margin:14px 0 14px;max-width:16ch}}.nf .cols{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:32px;margin-top:48px;padding-top:32px;border-top:1px solid var(--line)}}.nf ul{{list-style:none;padding:0;margin:10px 0 0;display:grid;gap:4px}}</style></head>
<body><main id="main" class="wrap nf">
<span class="lv">LV ?? · 404</span><h1>You found a hidden room.</h1>
<p class="lead">This page does not exist, but every other level does. · <span lang="pt-BR">Você achou uma sala secreta: esta página não existe.</span></p>
<p class="btn-row"><a class="btn btn-primary" href="/">Back to home <span class="arrow" aria-hidden="true">→</span></a> <a class="btn btn-ghost" href="/pt/" lang="pt-BR">Voltar ao início (PT)</a></p>
<div class="cols"><div><h2 style="font-size:20px">Work</h2><ul>{links_en}</ul></div><div lang="pt-BR"><h2 style="font-size:20px">Projetos</h2><ul>{links_pt}</ul></div></div>
</main></body></html>
''')
    written.append(("404.html", "en", "/", None, "404"))

    # ---- sitemap
    def entry(path_en, path_pt, image=None):
        out = ""
        for p_ in (path_en, path_pt):
            out += f'<url><loc>{url(p_)}</loc><lastmod>{TODAY}</lastmod>'
            out += f'<xhtml:link rel="alternate" hreflang="en" href="{url(path_en)}"/><xhtml:link rel="alternate" hreflang="pt-BR" href="{url(path_pt)}"/><xhtml:link rel="alternate" hreflang="x-default" href="{url(path_en)}"/>'
            if image: out += f'<image:image><image:loc>{image}</image:loc></image:image>'
            out += "</url>\n"
        return out
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
    sm += entry("/", "/pt/", SITE + OG["en"])
    sm += entry("/design-system/", "/pt/design-system/")
    for c in cases:
        sm += entry(f"/work/{c['id']}/", f"/pt/work/{c['id']}/", SITE + c["img"] if c["img"] else None)
    sm += "</urlset>\n"
    write("sitemap.xml", sm)

    write("robots.txt", f"# AI crawlers intentionally allowed\nUser-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")

    llm = f"""# {NAME}

> Product designer (UX/UI) and front-end developer based in Brazil (UTC-3), open to remote roles. 7 years of experience, 6 in product design and UI/UX, with a game design background. Designs flows, design systems and gamification, and builds the front-end (React, Next.js, TypeScript).

- Contact: {EMAIL}
- Languages: Portuguese (native), English (C1, EF SET certified)

## Pages

- [Home (EN)]({SITE}/): featured case studies, selected work, process, about, for recruiters, contact
- [Início (PT)]({SITE}/pt/)
- [Design system (EN)]({SITE}/design-system/): Violet Ink, the open design system behind the site ([tokens.json]({SITE}/design-system/tokens.json))

## Freelance

- Also open to freelance product design and front-end projects. Contact: {EMAIL}

## Hire me

- Roles: Product Designer (UX/UI), Front-end Developer
- Time zone: UTC-3 (full overlap with US Eastern hours, about 4 h with Central Europe)
- Contract: full-time via EOR or as a contractor
- Contact: {EMAIL}
- CV (EN, PDF): {SITE}{CV_FILES["en"]}
- CV (PT, PDF): {SITE}{CV_FILES["pt"]}

## Projects

"""
    for c in cases:
        llm += f"- [{c['en']['title']}]({SITE}/work/{c['id']}/) ([PT]({SITE}/pt/work/{c['id']}/)): {trunc(c['en']['sum'], 140)}\n"
    write("llms.txt", llm)

    write("_headers", """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()

/img/*
  Cache-Control: public, max-age=604800

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/cv/*
  X-Robots-Tag: noindex
  Cache-Control: public, max-age=86400

/og/*
  Cache-Control: public, max-age=604800

/*.png
  Cache-Control: public, max-age=86400

/game/*
  ! X-Frame-Options
  Content-Security-Policy: frame-ancestors 'self' https://enois.ia.br
""")
    write("_redirects", "/case-email-builder /work/email/ 301\n/case-design-systems /work/ds/ 301\n/case-* / 301\n/og.png /og/home-en.jpg 301\n")

    # ---------------------------------------------------------------- checks
    problems = []
    for out, lang, path_en, path_pt, kind in written:
        html = open(os.path.join(PUB, out), encoding="utf-8").read()
        hits = blacklist_hits(html)
        if hits: problems.append(f"{out}: blacklisted {hits}")
        if len(re.findall(r"<h1[\s>]", html)) != 1: problems.append(f"{out}: needs exactly one <h1>")
        if kind != "404":
            for cls in ("lang-en", "lang-pt"):
                want = path_en if cls == "lang-en" else path_pt
                for href in re.findall(r'<a href="([^"]*)" (?:id|class)="' + cls + '"', html):
                    if href != want: problems.append(f"{out}: {cls} points to {href}, expected {want}")
                if not re.search(r'(?:id|class)="' + cls + '"', html): problems.append(f"{out}: missing {cls}")
        else:
            if 'rel="canonical"' in html: problems.append("404.html: must not have a canonical")
            if 'content="noindex"' not in html: problems.append("404.html: must be noindex")
        if kind == "work":
            navs = re.findall(r'<nav class="nav".*?</nav>', html, re.S) + re.findall(r'<dialog id="menu".*?</dialog>', html, re.S)
            for n in navs:
                if re.search(r'href="#', n): problems.append(f"{out}: in-page #anchor in the nav of a work page")
        for tag in re.findall(r"<img\b[^>]*>", html):
            if not re.search(r'\balt="[^"]+"', tag) and not ('alt=""' in tag and "data-deco" in tag): problems.append(f"{out}: <img> without alt: {tag[:90]}")
            if not (re.search(r'\bwidth="\d+"', tag) and re.search(r'\bheight="\d+"', tag)): problems.append(f"{out}: <img> without width/height: {tag[:90]}")
        refs = re.findall(r'\b(?:src|href)="(/[^"#?]*)', html) + re.findall(r'<meta property="og:image" content="' + re.escape(SITE) + r'(/[^"?#]*)', html)
        for r in set(refs):
            if r.startswith("//"): continue
            local = os.path.join(PUB, r.lstrip("/"))
            if r.endswith("/"): local = os.path.join(local, "index.html")
            if not os.path.exists(local): problems.append(f"{out}: broken local reference {r}")
    llm_hits = blacklist_hits(open(os.path.join(PUB, "llms.txt"), encoding="utf-8").read())
    if llm_hits: problems.append(f"llms.txt: blacklisted {llm_hits}")
    if "og.png" in "".join(open(os.path.join(PUB, w[0]), encoding="utf-8").read() for w in written): problems.append("a page still references og.png")
    if problems:
        fail(f"{len(problems)} problem(s):\n  " + "\n  ".join(problems))

    def kb(path): return f"{os.path.getsize(os.path.join(PUB, path.lstrip('/'))) / 1024:.0f} KB"
    n_home = sum(1 for w in written if w[4] == "home"); n_work = sum(1 for w in written if w[4] == "work")
    print(f"OK: {n_home} home + {n_work} work + 1 404 = {len(written)} pages · {len(cases)} projects · "
          f"CV EN {kb(CV_FILES['en'])}, PT {kb(CV_FILES['pt'])} · OG EN {kb(OG['en'])}, PT {kb(OG['pt'])}"
          f" · portrait {'on' if HAS_PORTRAIT else 'off'} · booking {'on' if BOOKING_URL else 'off'}")


asyncio.run(main())
