# victorvk.com

Site estático no Cloudflare. A cada `git push` na `main`, o Cloudflare publica a pasta `public/`.

## Como editar
1. Conteúdo (textos EN/PT, projetos `CASES`, FAQ, CSS, JS) em `src/index.src.html`.
   Texto em inglês fica no HTML (`data-i`); o português fica em `I18N.pt` no mesmo arquivo.
2. Currículos: os PDFs do CV Master (sem telefone) ficam em `src/cv/Victor-Cavalcante-CV-{EN,PT}.pdf`; o build copia para `public/cv/`. Para atualizar, troque esses dois arquivos.
3. Gere tudo: `python3 build.py` (uma vez: `pip install playwright && playwright install chromium`).
4. Publique: `git add -A && git commit -m "ajuste" && git push`.

O build gera: `/` (EN), `/pt/` (PT), uma página por projeto (`/work/<id>/` e `/pt/work/<id>/`),
`404.html`, `cv/*.pdf`, `og/home-{en,pt}.jpg`, `sitemap.xml`, `robots.txt`, `llms.txt`, `_headers` e `_redirects`.
O script `#app` (dados e i18n) roda só no build e não vai para o HTML publicado.

## O build falha quando
- há erro de JS ao renderizar;
- aparece uma palavra da lista negra (lista em `blacklist.local.txt`, fora do repo, + TODO/TBD) em qualquer página, no `llms.txt`, nas fontes do CV ou no texto dos PDFs (se `pdftotext` existir);
- um link local, imagem ou og:image aponta para arquivo inexistente;
- uma `<img>` não tem `alt`, `width` e `height`;
- uma página não tem exatamente um `<h1>` ou o seletor EN/PT aponta para a página errada.

## Ajustes rápidos em `build.py`
- `BOOKING_URL`: link de agenda (Cal.com etc.). Vazio = botão escondido.
- Retrato: coloque `public/img/vk.webp` (4:5, mín. 960×1200). O build mostra no "Sobre" e usa como `Person.image`.

## Arquivos que ficam direto em `public/` (não são gerados)
`img/`, `fonts/`, `favicon-32.png`, `favicon-64.png`, `apple-touch-icon.png`.

## Analytics (GA4 `G-3H81YHRL1H`)
Consent Mode v2: negado por padrão na UE/EEE/UK/CH; barra de cookies só para fusos `Europe/*`.
Eventos: `contact_click` (service), `email_copy`, `cv_download` (lang), `case_open` (id), `booking_click`, `outbound_profile` (network).
No GA4, marque `contact_click` como evento-chave.

## Novo projeto
No `src/index.src.html`, copie um bloco do array `CASES` (EN e PT), troque o `id` e rode o build.
O sitemap e as páginas do projeto são criados sozinhos.
