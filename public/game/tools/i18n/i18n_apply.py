#!/usr/bin/env python3
"""Wrap user-visible strings in tr()/tt()/tn() for the Portuguese localization. Run from public/game."""
import json, re, subprocess, sys
sys.path.insert(0, 'tools/i18n')
from scan import scan

PT = json.loads(subprocess.check_output(['node', '-e', "import('./js/data/pt-ui.js').then(m=>console.log(JSON.stringify(m.PT_UI)))"]))

def rd(f): return open(f).read()
def wr(f, s): open(f, 'w').write(s)

def rep(s, old, new, count=1):
    n = s.count(old)
    if n != count:
        raise SystemExit(f'expected {count} of {old!r}, found {n}')
    return s.replace(old, new)

# ------------------------------------------------------------------ ui.js
s = rd('js/ui.js')

# 1) manual spots first (nested templates, plurals, tooltips)
s = rep(s, "`${fmt(r.eyes)} eyes · ${r.eclipses} eclipse${r.eclipses === 1 ? '' : 's'}`", "tt`${fmt(r.eyes)} eyes · ${tn(r.eclipses, '{n} eclipse', '{n} eclipses')}`")
s = rep(s, "`${d.players} king${d.players === 1 ? '' : 's'} in the realm.`", "tn(d.players, '{n} king in the realm.', '{n} kings in the realm.')")
s = rep(s, "`${r.prestiges} ${this.cfg.PRESTIGE?.name || 'Eclipse'}${r.prestiges === 1 ? '' : 's'}`", "tn(r.prestiges, '{n} Eclipse', '{n} Eclipses')")
s = rep(s, "`${fmt(r.lifetimeEyes)} lifetime eyes`", "tt`${fmt(r.lifetimeEyes)} lifetime eyes`")
s = rep(s, "return parts.length ? 'needs ' + parts.join(', ') : '';", "return parts.length ? tr('needs ') + parts.join(', ') : '';")
s = rep(s, "`You were gone for ${fmtTime(r.elapsed)}. Your ravens kept working at ${fmtPct(r.efficiency)} efficiency${capped ? ` (capped at ${fmtTime(r.seconds)})` : ''}.`",
        "tt`You were gone for ${fmtTime(r.elapsed)}. Your ravens kept working at ${fmtPct(r.efficiency)} efficiency${capped ? tt` (capped at ${fmtTime(r.seconds)})` : ''}.`")
s = rep(s, "q === 'max' ? 'Max' : 'x' + q", "q === 'max' ? tr('Max') : 'x' + q")
s = rep(s, "label = 'ready!';", "label = tr('ready!');")
s = rep(s, "setText(c.action, eq ? 'equipped' : has ? 'equip' : 'buy');", "setText(c.action, eq ? tr('equipped') : has ? tr('equip') : tr('buy'));")
s = rep(s, "eq ? 'equipped' : has ? 'owned, equip' : 'buy'", "eq ? tr('equipped') : has ? tr('owned, equip') : tr('buy')")
s = rep(s, "owned ? 'owned' : 'upgrade'", "owned ? tr('owned') : tr('upgrade')")
s = rep(s, "st.owned ? 'owned' : 'skin') : (st.times ? 'bought ×' + st.times : 'consumable')", "st.owned ? tr('owned') : tr('skin')) : (st.times ? tr('bought ×') + st.times : tr('consumable'))")
s = rep(s, "got ? 'earned' : 'locked')", "got ? tr('earned') : tr('locked'))")
s = rep(s, "head(sp.icon, sp.name, 'spell')", "head(sp.icon, sp.name, tr('spell'))")
s = rep(s, "'owned ' + owned)", "tt`owned ${owned}`)")
s = rep(s, "<p>A mysterious structure. Collect ${fmt(b.unlockAt?.eyes || 0)} eyes to reveal it.</p>", "<p>${tt`A mysterious structure. Collect ${fmt(b.unlockAt?.eyes || 0)} eyes to reveal it.`}</p>")
s = rep(s, "<p>A spell not yet learned. It ${esc(this.reqText(sp.requires))}.</p>", "<p>${tr('A spell not yet learned. It ')}${esc(this.reqText(sp.requires))}.</p>")
s = rep(s, "Cost: ${this.costHTML(", "${tr('Cost')}: ${this.costHTML(", 3)
s = rep(s, "Next ${q > 1 ? '×' + q : ''}:", "${tr('Next')} ${q > 1 ? '×' + q : ''}:")
s = rep(s, "<li>Lasts <b>", "<li>${tr('Lasts')} <b>", 2)
s = rep(s, "<li>Recharge <b>", "<li>${tr('Recharge')} <b>")
s = rep(s, "<li>Each makes <b>", "<li>${tr('Each makes')} <b>")
s = rep(s, "<li>${owned} make <b>${fmtRate(per[r] || 0)}</b>/s · <b>${fmtPct(share)}</b> of total</li>", "<li>${tt`${owned} make`} <b>${fmtRate(per[r] || 0)}</b>/s · <b>${fmtPct(share)}</b> ${tr('of total')}</li>")
s = rep(s, "Reward: <b>${reward}</b>", "${tr('Reward')}: <b>${reward}</b>")
s = rep(s, "reward = a.reward?.globalMultPct ? `+${a.reward.globalMultPct}% production` : ''", "reward = a.reward?.globalMultPct ? tt`+${a.reward.globalMultPct}% production` : ''")
s = rep(s, "h('span', { class: 'news-new' }, 'NEW')", "h('span', { class: 'news-new' }, tr('NEW'))")
s = rep(s, "'Eyes / sec', 'eye')", "tr('Eyes / sec'), 'eye')") if "stat('eps', 'Eyes / sec', 'eye')" in s else s
# plain-label tags that were built from dict keys with a trailing space etc. are handled by the generic pass below

# language picker in Settings
s = rep(s, "      h('label', { class: 'field' }, h('span', null, 'Numbers'), fmtSel),",
        "      h('label', { class: 'field' }, h('span', null, 'Numbers'), fmtSel),\n      h('label', { class: 'field' }, h('span', null, 'Language'), langSel),")
s = rep(s, "    fmtSel.value = s.settings.numberFormat;",
        "    fmtSel.value = s.settings.numberFormat;\n    const langSel = h('select', { class: 'select', 'aria-label': tr('Language') },\n      h('option', { value: 'auto' }, tr('Auto (browser)')), h('option', { value: 'en' }, 'English'), h('option', { value: 'pt' }, 'Português'));\n    langSel.value = langPref();\n    langSel.addEventListener('change', () => { setLangPref(langSel.value); g.save(); location.reload(); });")
s = rep(s, "import { playEclipse } from './eclipse.js';",
        "import { playEclipse } from './eclipse.js';\nimport { t as tr, tt, tn, localizeData, pref as langPref, setPref as setLangPref } from './i18n.js';")
s = rep(s, "const NEWS_KEY", "localizeData(CHANGELOG);\nconst NEWS_KEY") if "const NEWS_KEY" in s else s

# 2) auto: template literals whose positional key is in the dictionary (no nested templates)
out, last = [], 0
for a, b, key, exprs, nested in scan(s):
    if nested or key not in PT or a < last:
        continue
    if s[a - 2:a] == 'tt':  # already tagged
        continue
    out.append(s[last:a]); out.append('tt' + s[a:b]); last = b
out.append(s[last:]); s = ''.join(out)

# 3) auto: plain string literals found in the dictionary
EXCLUDE = {'buy', 'owned', 'upgrade', 'spell', 'skin', 'locked', 'eyes', 'equipped', 'equip', 'owned, equip', 'earned', 'consumable', 'bought ×', 'needs ', 'ready!', 'Max',
           'not yet', 'Cost', 'Next', 'Reward', 'Lasts', 'Recharge', 'Each makes', 'of total', 'NEW', 'Language', 'Auto (browser)', 'A spell not yet learned. It ', 'eyes / sec', 'per click', 'made by Victor VK'}
keys = sorted((k for k in PT if '{' not in k and k not in EXCLUDE), key=len, reverse=True)
def wrap_plain(src, allow=None):
    n = 0
    for k in (allow or keys):
        pat = re.compile(r"(?<![\w$.])(['\"])" + re.escape(k) + r"\1(?!\s*[:\]])")
        def r(m):
            nonlocal n
            # skip if already inside tr( ... ) call
            pre = src[max(0, m.start() - 3):m.start()]
            if pre.endswith('tr('): return m.group(0)
            n += 1
            return "tr(" + m.group(0) + ")"
        src = pat.sub(r, src)
    return src, n
s, n = wrap_plain(s)
print('ui.js plain wraps', n)
wr('js/ui.js', s)

# ------------------------------------------------------------------ main.js
m = rd('js/main.js')
allow = ['Krowlect is open in another tab', 'Play here instead', 'Progress is saved only in one tab at a time, so this one is paused to protect your kingdom.',
         'Saving is blocked here', 'This browser will not keep your progress. Log in to save it in the cloud, or open Krowlect in its own tab.',
         'A newer version of Krowlect saved this kingdom. Reload the page to update.', 'The ravens could not find the castle (failed to load game data). Please refresh.']
m, n = wrap_plain(m, allow); print('main.js plain wraps', n)
m = rep(m, "import * as cloud from './cloud.js';", "import * as cloud from './cloud.js';\nimport { t as tr, localizeData, localizePage } from './i18n.js';")
m = rep(m, "async function boot() {\n  let config, art;", "async function boot() {\n  localizePage();\n  let config, art;")
m = rep(m, "  const { UI } = await import('./ui.js');", "  localizeData(config.RESOURCES, config.BUILDINGS, config.UPGRADES, config.SPELLS, config.MARKET, config.ACHIEVEMENTS, config.PRESTIGE, config.OMEN, config.CHATTER);\n  const { UI } = await import('./ui.js');")
wr('js/main.js', m)

# ------------------------------------------------------------------ state.js
st = rd('js/state.js')
st, n = wrap_plain(st, ['Empty save string', 'Save data is corrupted.', 'That is not a valid Krowlect save.']); print('state.js', n)
st = "import { t as tr } from './i18n.js';\n" + st
wr('js/state.js', st)

# ------------------------------------------------------------------ cloud.js
c = rd('js/cloud.js')
c = rep(c, "throw new ApiError('The ravens could not reach the castle. Check your connection.', 0);", "throw new ApiError(tr('The ravens could not reach the castle. Check your connection.'), 0);")
c = rep(c, "throw new ApiError(data.error || (res.status >= 500 ? 'The castle is busy. Try again in a moment.' : 'Something went wrong. Try again.'), res.status);",
        "throw new ApiError(ts(data.error) || (res.status >= 500 ? tr('The castle is busy. Try again in a moment.') : tr('Something went wrong. Try again.')), res.status);")
c = "import { t as tr, ts } from './i18n.js';\n" + c
wr('js/cloud.js', c)

# ------------------------------------------------------------------ eclipse.js
e = rd('js/eclipse.js')
e = rep(e, "overlay.setAttribute('aria-label', 'The Eclipse')", "overlay.setAttribute('aria-label', tr('The Eclipse'))")
e = rep(e, "el('div', 'ecl-panel ecl-title', 'The Eclipse')", "el('div', 'ecl-panel ecl-title', tr('The Eclipse'))")
e = rep(e, "el('span', 'ecl-lbl', 'eyes')", "el('span', 'ecl-lbl', tr('eyes'))")
e = rep(e, "el('div', 'ecl-hint', 'tap to skip')", "el('div', 'ecl-hint', tr('tap to skip'))")
e = rep(e, "`+${fmt(gained)} Black Feathers`", "tt`+${fmt(gained)} Black Feathers`")
e = rep(e, "import * as audio from './audio.js';", "import * as audio from './audio.js';\nimport { t as tr, tt } from './i18n.js';")
wr('js/eclipse.js', e)
print('done')
