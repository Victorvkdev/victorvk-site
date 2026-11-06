# Krowlect · guia de manutenção

Idle/clicker medieval. O Rei Corvo coleta olhos e transforma em magia (mana).
No ar em **https://victorvk.com/game/**. É uma pasta estática dentro de `public/game/` do site.
Sem build, sem dependências: HTML + CSS + JS puro.

## Onde mexer (90% das melhorias)

| Quero… | Arquivo (em `public/game/`) |
|---|---|
| Novo prédio, upgrade, feitiço, item de loja, conquista, frase do corvo, balanceamento | `js/data/config.js` |
| Nova arte / ícone / skin do rei | `tools/build_sprites.py` → gera `js/art/sprites.js` |
| Visual, cores, layout | `css/style.css` |
| Regras novas (novo tipo de efeito, nova mecânica) | `js/economy.js` (matemática) + `js/ui.js` (tela) |
| Mudou o formato do save | `js/state.js` → `MIGRATIONS` + subir `GAME.saveVersion` |

O topo do `config.js` tem o passo a passo "HOW TO ADD CONTENT". Resumo: copia um objeto parecido,
troca o `id` (único), escolhe um ícone que já existe, ajusta custo/efeito.

## Fluxo de uma melhoria (sempre igual)

1. Na branch `dev`, edite o arquivo.
2. Teste local: no Terminal, dentro de `public/game`, rode
   `python3 -m http.server 8000` e abra http://localhost:8000
3. Se mexeu em números, rode o simulador de ritmo: `node tools/sim.mjs`
   (mostra em quanto tempo o jogador compra cada prédio e chega no Eclipse).
4. Se mexeu em `economy.js`: `node tools/test-economy.mjs` (tem que dar tudo "passed").
5. Suba `GAME.version` no `config.js` (ex.: 1.0.0 → 1.1.0) e anote no `CHANGELOG.md`.
6. Commit e push na `dev` (ex.: `git commit -am "feat(krowlect): 1.3 daily missions" && git push`),
   confira o preview do Cloudflare e abra um Pull Request para a `main`. O merge publica.

## Regras para não quebrar o save dos jogadores

- **Nunca troque o `id`** de algo que já foi publicado. Pode mudar nome, texto, preço, efeito.
- Remover conteúdo é seguro (o save ignora ids que sumiram), mas evite.
- Mudou a estrutura do save? Suba `GAME.saveVersion` e escreva a migração em `state.js`.

## Depurar no navegador

Console (F12): `__krowlect.addResource('eyes', 1e6)`, `__krowlect.setBuilding('rookery', 10)`,
`__krowlect.warp(3600)` (avança 1h), `__krowlect.spawnOmen()`, `__krowlect.reset()`.

## Roadmap (a partir da 1.2.1)

- **1.3** mais prédios (11–15), mais conquistas, missões diárias
- **1.4** árvore de talentos com Black Feathers (prestígio vira loja permanente)
- **1.5** eventos sazonais (Halloween, lua de sangue)
- **2.0** segunda camada de prestígio, mini-boss que rouba olhos

Já entregue: save na nuvem e ranking (1.1, `worker/index.js` + D1 `krowlect`, cliente em `js/cloud.js`),
tradução PT-BR e Eclipse cinematográfico (1.2). Histórico completo em `public/game/CHANGELOG.md`.

## Testes de preview

Na `dev`, o Cloudflare usa o banco D1 `krowlect-preview` (bloco `previews` do `wrangler.jsonc`).
Contas e saves criados no preview não aparecem no jogo real.

`tools/`, `README.md`, `ARCHITECTURE.md` e `CHANGELOG.md` do jogo não vão pro ar (estão no `public/.assetsignore`).
