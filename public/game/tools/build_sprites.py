#!/usr/bin/env python3
"""KROWLECT sprite authoring script.

Composes the pixel art (hand-drawn row stamps + a few shape helpers for the
larger pieces) and emits js/art/sprites.js with literal row strings.
Run:  python3 tools/build_sprites.py
"""
import math, random, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------- palettes
BASE = {
    # ink / raven body
    'k': '#0e0b16', 'K': '#181225', 'b': '#271f3b', 'B': '#372c55',
    'h': '#4b3a78', 'H': '#8b6fd1',
    'p': '#1a1426',
    # violet
    'u': '#4a2a9e', 'v': '#7c4dff', 'V': '#a78bfa', 'l': '#ddd0ff',
    # gold
    'G': '#b07d23', 'g': '#f5c542', 'y': '#fff2b0',
    # eye white
    'w': '#f4f1ea', 'W': '#c4bccf',
    # blood
    'R': '#741a2e', 'r': '#c2334a', 't': '#ff6b81',
    # moss
    'M': '#2c4a37', 'm': '#4a7a5a', 'n': '#7fae6e',
    # stone
    'x': '#2c2839', 's': '#4b4560', 'S': '#6e6788', 'X': '#9a93b0',
    # wood / straw
    'e': '#3d2a1d', 'o': '#6b4a2f', 'O': '#946b43', 'T': '#c9a36a',
    # fire
    'f': '#ff8a3d', 'F': '#ffd27a',
    # ice
    'C': '#2f8fc0', 'c': '#6fe3ff',
    # beak steel
    'N': '#4f4a66', 'j': '#8a85a6',
    # ---- king-swappable keys ----
    'A': '#f5c542', 'a': '#b07d23', 'Y': '#fff2b0', 'J': '#c2334a',   # crown + gem
    'P': '#6b3fd9', 'q': '#3b2287', 'Q': '#9c7bf2',                   # cape
    'E': '#f6f0ff', 'I': '#b996ff', 'i': '#7c4dff',                   # eyes
    '7': '#4a3880', '8': '#9a7fe6',                                   # feather sheen
    'Z': '#f4f1ea', 'z': '#c4bccf',                                   # ermine collar
    # ---- background scene ----
    '1': '#0c0a15', '2': '#110d1e', '3': '#171229', '4': '#1e1735', '5': '#271e43',
    '6': '#31275a',
    'L': '#ece6f7', 'D': '#c6bce0', 'd': '#a397c6', '9': '#3a2f63',
    '*': '#d8d0f5', '+': '#6f6596',
    '0': '#120e1d', '#': '#1a1429', '=': '#211a34', '-': '#2a2141',
    '@': '#e6b34a', '%': '#8a6a3a',
    '^': '#16121f', '~': '#1d1729', '&': '#251d33',
}

SKIN_OVERRIDES = {
    'default': {},
    'frost': {
        'A': '#c4f1ff', 'a': '#5fb2d6', 'Y': '#ffffff', 'J': '#6fe3ff',
        'P': '#3f8fcf', 'q': '#1f527f', 'Q': '#8fd2f5',
        'E': '#f0ffff', 'I': '#7fe9ff', 'i': '#1fa6d6',
        '7': '#2b4466', '8': '#73b9e3',
    },
    'blood': {
        'A': '#d9a43a', 'a': '#8a5a18', 'Y': '#ffe39a', 'J': '#ff4d6a',
        'P': '#8f1d33', 'q': '#4d0c1a', 'Q': '#c8374f',
        'E': '#ffe0e5', 'I': '#ff5a74', 'i': '#c2334a',
        '7': '#4a1e2e', '8': '#b23a55',
    },
    'gold': {
        'A': '#ffd84a', 'a': '#c0861c', 'Y': '#fffbe0', 'J': '#7c4dff',
        'P': '#e3a92e', 'q': '#93620f', 'Q': '#ffe08a',
        'E': '#fffbe6', 'I': '#ffd84a', 'i': '#d4951c',
        '7': '#5c4520', '8': '#e0b245',
    },
}
PALETTES = {name: {**BASE, **ov} for name, ov in SKIN_OVERRIDES.items()}


# ---------------------------------------------------------------- canvas
class Cv:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [['.'] * w for _ in range(h)]

    def set(self, x, y, c):
        x, y = int(x), int(y)
        if c and 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.g[y][x]
        return '.'

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def ell(self, cx, cy, rx, ry, f, only_on=None):
        for y in range(self.h):
            for x in range(self.w):
                nx = (x + .5 - cx) / rx
                ny = (y + .5 - cy) / ry
                if nx * nx + ny * ny <= 1:
                    if only_on and self.get(x, y) not in only_on:
                        continue
                    self.set(x, y, f(x, y, nx, ny) if callable(f) else f)

    def line(self, x0, y0, x1, y1, c):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            self.set(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), c)

    def stamp(self, rows, ox, oy, mirror=False):
        for dy, row in enumerate(rows):
            if mirror:
                row = row[::-1]
            for dx, c in enumerate(row):
                if c != '.':
                    self.set(ox + dx, oy + dy, c)

    def outline(self, c='k', diag=False):
        pts = []
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diag:
            nb += [(1, 1), (-1, -1), (1, -1), (-1, 1)]
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] != '.':
                    continue
                for dx, dy in nb:
                    v = self.get(x + dx, y + dy)
                    if v != '.' and v != c:
                        pts.append((x, y))
                        break
        for x, y in pts:
            self.g[y][x] = c
        return self

    def rows(self):
        return [''.join(r) for r in self.g]


def from_rows(rows, outline=True, diag=False):
    h, w = len(rows), len(rows[0])
    cv = Cv(w, h)
    cv.stamp(rows, 0, 0)
    if outline:
        cv.outline(diag=diag)
    return cv.rows()


# ---------------------------------------------------------------- the king
# 3/4 view facing right: round body, big head, thick hooked beak, high cape collar.
CROWN = [
    "Y...YY...Y",
    "AY.AYYA.YA",
    "AAAAAJAAAA",
    "AYAJAAAJAa",
    "aaaaaaaaaa",
]
EYE_NEAR = {
    0: [".iIIi.",
        "iIEEIi",
        "IEEkkI",
        "IEEkkI",
        "iIEEIi",
        ".iIIi."],
    1: ["......",
        "777777",
        "iiiiii",
        "IEEkkI",
        "iIEEIi",
        ".iIIi."],
    2: ["......",
        "..ii..",
        ".iIIi.",
        "iI..Ii",
        "i....i",
        "......"],
}
EYE_FAR = {
    0: ["iI", "Ek", "iI"],
    1: ["77", "ii", "iI"],
    2: ["..", ".i", "i."],
}
BEAK = [
    "jXjj....",
    "jjjjjj..",
    "Njjjjjjj",
    "kkNNNNkN",
    "NNNNN.kN",
    "NNN...k.",
]
FOOT = [
    ".N..",
    ".N..",
    "NjjN",
    "j.jj",
]


def shade(r, l):
    if r > 0.84 and l < -0.2:
        return 'K'
    if 0.58 < r < 0.92 and l > 0.62:
        return '8' if (0.68 < r < 0.84 and l > 0.9) else '7'
    if l > 0.2 and r > 0.35:
        return 'B'
    return 'b'


def king(frame):
    cv = Cv(32, 32)
    LX, LY = -0.6, -0.8
    if frame == 0:
        brx, bry, bcx, bcy, hdy, hsx = 10.6, 9.6, 15.0, 19.4, 0, 1.0
    elif frame == 1:
        brx, bry, bcx, bcy, hdy, hsx = 10.9, 9.2, 15.0, 19.8, 1, 1.0
    else:
        brx, bry, bcx, bcy, hdy, hsx = 12.4, 7.8, 15.0, 21.2, 4, 1.08
    hcx, hcy, hrx, hry = 17.2, 11.6 + hdy, 7.8 * hsx, 6.9 / hsx ** 0.5

    # cape behind (drapes off the back/left and pools at the bottom)
    ytop = int(hcy + 4)
    for y in range(ytop, 30):
        t = (y - ytop) / max(1, 29 - ytop)
        xl = bcx - brx + 0.5 - t * 4.5
        xr = bcx + brx - 0.5 + t * 3.5
        for x in range(32):
            if xl <= x + .5 <= xr:
                e = (x + .5 - xl) / (xr - xl)
                c = 'P'
                if e < 0.18:
                    c = 'Q'
                elif e > 0.85:
                    c = 'q'
                if y == 29:
                    c = 'q'
                if e < 0.5 and ((x - y // 3) % 4 == 0) and y > ytop + 2:
                    c = 'q'
                cv.set(x, y, c)

    # feet
    cv.stamp(FOOT, 11, 27)
    cv.stamp(FOOT, 16, 27)

    # body
    cv.ell(bcx, bcy, brx, bry, lambda x, y, nx, ny: shade(math.hypot(nx, ny), LX * nx + LY * ny))
    # folded wing (hand-drawn stamp): sheen on the coverts, feather tips pointing back/down
    WING = [
        "....77887...",
        "..778BBBB87.",
        ".7BBBbbbbBB7",
        "7BbbKbbbbKbb",
        "BbbKbbbbKbbb",
        "bbKbb7bKbbbK",
        "bKbb7bKbbbK.",
        "Kbb7bKbbbK..",
        "bb7bKbbK....",
        "b7bK.bK.....",
        "7bK.........",
    ]
    wy = int(hcy + hry) - 1 + (0 if frame != 2 else -1)
    wrows = WING if frame != 2 else WING[:9]
    wx = int(bcx - brx) - 1
    for dy, row in enumerate(wrows):
        for dx, c in enumerate(row):
            if c != '.' and cv.get(wx + dx, wy + dy) in 'bBK78':
                cv.set(wx + dx, wy + dy, c)

    # head
    cv.ell(hcx, hcy, hrx, hry, lambda x, y, nx, ny: shade(math.hypot(nx, ny), LX * nx + LY * ny))
    # cheek fluff tufts on the back of the head
    tx = int(hcx - hrx)
    cv.set(tx, int(hcy) + 1, 'b'); cv.set(tx - 1, int(hcy) + 2, 'b')
    # top-of-head tuft (raven hackles) left of the crown
    ty = int(hcy - hry)
    cv.set(12, ty + 1, 'B'); cv.set(11, ty, 'B'); cv.set(11, ty + 1, 'b')

    # high royal collar: a crescent hanging under the head, rising at the back
    ccy = hcy + hry - 1.6
    ox, orx = hcx - 0.8, hrx + 2.2
    for y in range(32):
        for x in range(32):
            nx = (x + .5 - ox) / orx
            ny = (y + .5 - (ccy - 0.6)) / 3.6
            ix = (x + .5 - ox) / (orx - 1.2)
            iy = (y + .5 - (ccy - 2.6)) / 3.0
            if nx * nx + ny * ny <= 1 and not (ix * ix + iy * iy <= 1):
                c = 'P'
                if ix * ix + iy * iy <= 1.45:
                    c = 'Q'
                elif nx * nx + ny * ny > 0.72:
                    c = 'q'
                cv.set(x, y, c)
    # collar flare rising behind the head
    cl = int(ox - orx) + 1
    fy = int(ccy) - 1
    cv.set(cl, fy, 'Q'); cv.set(cl, fy - 1, 'Q'); cv.set(cl - 1, fy - 2, 'Q'); cv.set(cl + 1, fy, 'P'); cv.set(cl + 1, fy - 1, 'P'); cv.set(cl, fy - 2, 'P')
    # gold clasp
    cx2 = int(ox) + 2
    cyc = int(ccy + 1.6)
    cv.stamp(["YA", "Aa"], cx2, cyc)

    # eyes
    ey = int(hcy - 3)
    cv.stamp(EYE_NEAR[frame], 12, ey)
    cv.stamp(EYE_FAR[frame], 21, ey + 1)

    # beak
    cv.stamp(BEAK, 22, ey + 3)

    # crown on top of the head
    crb = int(math.floor(hcy - hry)) + 1
    cv.stamp(CROWN, 12, crb - 4)

    cv.outline('k')
    return cv.rows()


# ---------------------------------------------------------------- small icons (interiors; outline auto)
ICONS12 = {}


def icon(name, rows, outline=True, diag=False):
    ICONS12[name] = from_rows(rows, outline, diag)


def eye12():
    cv = Cv(12, 12)
    def f(x, y, nx, ny):
        r = math.hypot(nx, ny)
        l = -0.6 * nx - 0.8 * ny
        if l < -0.45 and r > 0.6:
            return 'W'
        return 'w'
    cv.ell(6, 6, 5, 5, f)
    cv.ell(6.5, 6.5, 2.9, 2.9, lambda x, y, nx, ny: 'u' if (nx + ny) > 0.9 else ('V' if (nx + ny) < -0.7 else 'v'))
    cv.rect(6, 6, 6, 6, 'k'); cv.rect(5, 6, 5, 6, 'k'); cv.rect(6, 5, 6, 5, 'k'); cv.rect(5, 5, 5, 5, 'k')
    cv.set(5, 4, 'w')
    cv.set(4, 5, 'w')
    cv.set(1, 7, 'r'); cv.set(2, 8, 'r'); cv.set(9, 2, 'r'); cv.set(10, 4, 'r')
    cv.outline()
    return cv.rows()


ICONS12['eye'] = eye12()

icon('mana', [
    "............",
    ".....l......",
    "....lVv.....",
    "...lVVvv....",
    "..lVVVvvu...",
    "..VVVvvvu...",
    "..vVVvvuu...",
    "...vVvvu....",
    "....vvu.....",
    ".....u......",
    "............",
    "............",
])
icon('feather', [
    "............",
    "........7B..",
    ".......7BBb.",
    "......7BhBb.",
    ".....7BhBbb.",
    "....7BhBbb..",
    "...7BhBbb...",
    "...BhBbb....",
    "..BhBb......",
    "..h.b.......",
    ".j..........",
    "............",
])

icon('up_talons', [
    "............",
    ".....Ns.....",
    ".....Ns.....",
    "....NNss....",
    "...NNsSss...",
    "..Ns.Ns.ss..",
    "..Ns.Ns..s..",
    ".Ns..Ns..Ss.",
    ".Ww..Ww...W.",
    ".W....W...W.",
    "............",
    "............",
])
icon('up_beak', [
    "............",
    "............",
    "...yggg.....",
    "..yyyygggg..",
    "..gyyyyyyggg",
    "..GGGGGGGGG.",
    "..ggggggG...",
    "...GGGGG....",
    "............",
    "............",
    "............",
    "............",
])
icon('up_cage', [
    ".....g......",
    "....gyg.....",
    "...gG.Gg....",
    "..g.g.g.g...",
    "..g.g.g.g...",
    "..g.gbBgg...",
    "..g.bVbgg...",
    "..g.bbbgg...",
    "..gggggggg..",
    "..GGGGGGGG..",
    "............",
    "............",
])
icon('up_anvil', [
    "............",
    "............",
    "...F........",
    "..XXXXXXXX..",
    ".SXXXXXXXS..",
    "..SSSSSSs...",
    "....SSs.....",
    "....Sss.....",
    "...SSsss....",
    "..sssssss...",
    "............",
    "............",
])
icon('up_scroll', [
    "............",
    "..OTTTTTTO..",
    "..TwwwwwwT..",
    "...wWWWWw...",
    "...wwwwww...",
    "...wWWWww...",
    "...wwwwww...",
    "...wWWWrw...",
    "..TwwwwwwT..",
    "..OTTTTTTO..",
    "............",
    "............",
])
icon('up_lens', [
    "............",
    "...gggg.....",
    "..gwwwwg....",
    ".gwwVvwwg...",
    ".gwVkkvwg...",
    ".gwvkkuwg...",
    "..gwvuwwg...",
    "...ggggGo...",
    ".......Ooo..",
    "........ooo.",
    ".........oo.",
    "............",
])
icon('up_crown', [
    "............",
    "............",
    "..y..y..y...",
    "..gy.gy.gy..",
    "..gggrgggg..",
    "..gyggggyg..",
    "..gggggggg..",
    "..GGGGGGGG..",
    "............",
    "............",
    "............",
    "............",
])
icon('up_tome', [
    "............",
    "..uuuuuuu...",
    ".uvvvvvvuw..",
    ".uvvwwvvuw..",
    ".uvwvkwvuw..",
    ".uvvwwvvuw..",
    ".uvvvvvvuw..",
    ".uvgvvgvuW..",
    ".uuuuuuuuW..",
    "..WWWWWWWW..",
    "............",
    "............",
])
icon('up_potion', [
    "............",
    ".....oO.....",
    ".....WW.....",
    ".....wW.....",
    "....wWWW....",
    "...wVVvvW...",
    "..wlVvvvuW..",
    "..wVvvvvuW..",
    "..WvvvvuuW..",
    "...WuuuuW...",
    "............",
    "............",
])
icon('up_bell', [
    "............",
    ".....G......",
    "....ggg.....",
    "...gyggg....",
    "...gyggg....",
    "...gygggG...",
    "..gygggggG..",
    "..gggggggG..",
    ".GGGGGGGGGG.",
    ".....gG.....",
    "............",
    "............",
])
icon('sp_frenzy', [
    "............",
    "..bb........",
    ".bbBb.......",
    "..bbbbr.....",
    "...bbbbbb...",
    "...bhhbbbbb.",
    "r..bbbbbb...",
    ".r..bbbb....",
    "..r..N.N....",
    "............",
    "............",
    "............",
])
icon('sp_gaze', [
    ".....V......",
    "..V..V..V...",
    "...V...V....",
    "...wwwww....",
    "..wwvvvww...",
    ".VwvkkVvwV..",
    "..wwvvvww...",
    "...wwwww....",
    "...V...V....",
    "..V..V..V...",
    ".....V......",
    "............",
])
icon('sp_moon', [
    "............",
    "....rrrr....",
    "...rtrr.....",
    "..rtr.......",
    "..rr........",
    "..rr........",
    "..rr........",
    "..rRr.......",
    "...RRr......",
    "....RRRR....",
    "............",
    "............",
])
icon('sp_storm', [
    "............",
    "...sSSs.....",
    "..sSSSSss...",
    ".sSSSSSSss..",
    ".sssssssss..",
    "....yg......",
    "...yg.......",
    "...yggg.....",
    ".....gg.....",
    ".....g......",
    "............",
    "............",
])
icon('mk_jar', [
    "............",
    "...oooooo...",
    "...OOOOOO...",
    "..W......W..",
    "..WwwvwvwW..",
    "..WwkwwkwW..",
    "..WwvwwvwW..",
    "..WwwkwwwW..",
    "..WwwwwwwW..",
    "...WWWWWW...",
    "............",
    "............",
])
icon('mk_potion', [
    "............",
    "....oO......",
    "....WW......",
    "....wW......",
    "....wW......",
    "...wnnW.....",
    "..wnmmmW....",
    "..wnmmmW....",
    "..WmmmMW....",
    "...WWWW.....",
    "............",
    "............",
])
icon('mk_chest', [
    "............",
    "............",
    "...oooooo...",
    "..oOOOOOOo..",
    "..oOOOOOOo..",
    "..ggggyggg..",
    "..oOOgGOOo..",
    "..oOOOOOOo..",
    "..oeeeeeeo..",
    "............",
    "............",
    "............",
])
icon('ach', [
    "............",
    "..gyyyggg...",
    ".gg.yggg.g..",
    ".g..yggg.g..",
    "..g.yggggg..",
    "...yggggG...",
    "....gggG....",
    ".....gG.....",
    "....ggGG....",
    "...GGGGGG...",
    "............",
    "............",
])
icon('lock', [
    "............",
    "....SSSS....",
    "...S....S...",
    "...S....S...",
    "..gggggggg..",
    "..gyyyyyyg..",
    "..gyykkyyG..",
    "..gyyykyyG..",
    "..ggggggGG..",
    "............",
    "............",
    "............",
])
icon('sound_on', [
    "............",
    "....W...V...",
    "...wW....V..",
    ".wwwW..V.V..",
    ".wwwW...V.V.",
    ".wwwW...V.V.",
    ".wwwW..V.V..",
    "...wW....V..",
    "....W...V...",
    "............",
    "............",
    "............",
])
icon('sound_off', [
    "............",
    "....W.......",
    "...wW.......",
    ".wwwW.r...r.",
    ".wwwW..r.r..",
    ".wwwW...r...",
    ".wwwW..r.r..",
    "...wW.r...r.",
    "....W.......",
    "............",
    "............",
    "............",
])

# ---------------------------------------------------------------- 16x16
B16 = {}


def b16(name, rows, outline=True):
    B16[name] = from_rows(rows, outline)


B16['eye_gold'] = from_rows([
    "................",
    "................",
    "................",
    ".w...........w..",
    ".ww.........ww..",
    ".Www.yyyyy.wwW..",
    "..WwyggggggwW...",
    "...ygggkkgggG...",
    "..yggggkkggggG..",
    "...gggggggggG...",
    "....ggggggGG....",
    ".....GGGGGG.....",
    "................",
    "................",
    "................",
    "................",
])

b16('servant_raven', [
    "................",
    "................",
    "................",
    "......bbbb......",
    ".....bBBbbb.....",
    "....bBhEbbbNN...",
    "....bBhbbbbjNN..",
    "...bbBbbbbb.....",
    "..bBhhbbbbbb....",
    "..bBhhhbbbbbb...",
    "..bbbhbbbbbww...",
    "...bbbbbbbwvkw..",
    "....bbbbb.wvvw..",
    ".....N.N...ww...",
    "....NN.NN.......",
    "................",
])
b16('scarecrow', [
    "................",
    "......GTTG......",
    ".....GTTTTG.....",
    "...GTTTTTTTTG...",
    "......OOOO..bb..",
    "......OkOk.bbbN.",
    "......OOOO..bb..",
    "..T.mmmmmmmmoo..",
    ".TOoMmmrmmmMoTT.",
    "..T.mmmmmmmm.T..",
    ".....mMmmMm.....",
    "......oOO.......",
    "......oOO.......",
    "......oOO.......",
    "...mmnmoOmnmm...",
    "................",
])
b16('rookery', [
    "................",
    "....MmmnmM......",
    "...MmeobOmmM....",
    "..MmmoTTomnmM...",
    "..mmnmmmmmmmMb..",
    ".MmmmmmmbbmmmM..",
    ".MmeTTomoTTomM..",
    "..MMmmmmmmmMM...",
    "....M.oO.M......",
    "......oO.bb.....",
    "......oOOoob....",
    "......oO........",
    "......oO........",
    ".....ooOO.......",
    "...nmmoOOmnm....",
    "................",
])
b16('blacksmith', [
    "................",
    "..sss...........",
    "..sXs....f......",
    "..sSs...fFf.....",
    "..sSs..fFyFf....",
    ".sssss.fFyFf....",
    ".sSSSs..fFf.....",
    ".sffSs..........",
    ".sFfSs.XXXXXXX..",
    ".sffSs.SXXXXXS..",
    ".sssss..SSSSs...",
    ".sSSSs...SSs....",
    ".sSSSs..SSsss...",
    ".sssss.ssssss...",
    "eeeeeeeeeeeeeee.",
    "................",
])
b16('watchtower', [
    "................",
    "......r.........",
    "......rr........",
    "......o.........",
    "....SsSsSs......",
    "....SSSSSs......",
    "....SS@@Ss......",
    "....SS@@Ss......",
    ".....SSSs.......",
    ".....SxSs.......",
    ".....SSSs.......",
    ".....SSxs.......",
    "....SSSSss......",
    "....SSeess......",
    "..mmSSeessmm....",
    "................",
])
b16('wizard_tower', [
    "......V.........",
    "......v.........",
    ".....uvu........",
    ".....uvu........",
    "....uuvvu.......",
    "....uvvvu.......",
    "...uuuuuuu......",
    ".....SSs........",
    ".....SlVs.......",
    ".....SVvs.......",
    ".....SSs........",
    "....SSSss.......",
    "....SxSss.......",
    "....SSees.......",
    "..mmSSeesmm.....",
    "................",
])
b16('catacombs', [
    "................",
    "................",
    "....ssssssss....",
    "...sSSSSSSSss...",
    "..sSSwwwwwSSss..",
    "..sSwwwwwwwSss..",
    "..sSwkkwkkwSss..",
    "..sSwkkwkkwSss..",
    "..sSwwwkwwwSss..",
    "..sSSwkkkwSSss..",
    "..sSSwwwwwSSss..",
    "..sSSwkwkwSSss..",
    "..sSSkkkkkSSss..",
    "..sSSkkkkkSSss..",
    ".mmmSSkkkSSsmmm.",
    "................",
])
b16('cathedral', [
    ".......V........",
    ".......S........",
    "......SSs.......",
    "......SSs.......",
    ".....SSSss......",
    ".....SSSss......",
    "....SSSSsss.....",
    "....SVvvVss.....",
    "...SVlVlVVss....",
    "...SvVrVvVss....",
    "...SVlVlVVss....",
    "...SSVvvVsss....",
    "..sSSSSSsssss...",
    "..sSSSkkSsssS...",
    ".mSSSSkkSsssSm..",
    "................",
])
b16('moon_altar', [
    "................",
    ".....rrrr.......",
    "....rrtrrr......",
    "...rrtrrrRr.....",
    "...rrrrrrRr.....",
    "...rrrrrRRr.....",
    "....rrRRRr......",
    ".....rrrr.......",
    "................",
    "...XXXXXXXXX....",
    "...SSSSSSSSs....",
    ".....SrrSs......",
    ".....SSSSs......",
    "....SSSSSss.....",
    "..mmSSSSSssmm...",
    "................",
])
b16('eclipse_portal', [
    "................",
    ".....V.vV.V.....",
    "...V.vVlVv.V....",
    "..V.vvkkkkvv.V..",
    "...vVkkkkkkVv...",
    "..vVkk....kkVv..",
    ".VvVk......kVvV.",
    "..vlk......klv..",
    ".VvVk......kVvV.",
    "..vVkk....kkVv..",
    "...vVkkkkkkVv...",
    "..V.vvkkkkvv.V..",
    "...V.vVlVv.V....",
    ".....V.vV.V.....",
    "................",
    "................",
])
b16('bg_tile', [
    "xxxxxxxpxxxxxxxp",
    "xpppppppxppppppp",
    "xpppppppxppppppp",
    "xpppppppxppppppp",
    "pppppppppppppppp",
    "pppxxxxxxxxpxxxx",
    "pppxpppppppppxpp",
    "pppxpppppppppxpp",
    "pppxpppppppppxpp",
    "pppppppppppppppp",
    "xxxxxxxpxxxxxxxp",
    "xpppppppxppppppp",
    "xpppppppxppppppp",
    "xpppppppxppppppp",
    "pppppppppppppppp",
    "pppxpppppppppxpp",
], outline=False)


# ---------------------------------------------------------------- pass-2 replacements
def _eye_gold():
    cv = Cv(16, 16)
    # wings
    L = ["w....",
         "Ww...",
         "WWw..",
         ".WWw.",
         "WWWw.",
         ".WWw.",
         "..W.."]
    cv.stamp(L, 0, 4)
    cv.stamp(L, 11, 4, mirror=True)
    def f(x, y, nx, ny):
        r = math.hypot(nx, ny)
        l = -0.6 * nx - 0.8 * ny
        if r > 0.8 and l < -0.3:
            return 'G'
        if r > 0.72 and l > 0.5:
            return 'y'
        return 'g'
    cv.ell(8, 8.5, 4.6, 4.6, f)
    cv.ell(8.5, 8.5, 2.2, 2.2, 'G')
    cv.rect(8, 8, 8, 9, 'k'); cv.rect(9, 8, 9, 9, 'k')
    cv.set(7, 7, 'w'); cv.set(6, 6, 'y')
    cv.outline()
    # sparkles
    for (x, y) in [(2, 1), (13, 2), (1, 14), (14, 13)]:
        cv.set(x, y, 'y')
    cv.set(2, 0, 'G'); cv.set(2, 2, 'G'); cv.set(1, 1, 'G'); cv.set(3, 1, 'G')
    return cv.rows()


B16['eye_gold'] = _eye_gold()


def pad(rows, w):
    out = []
    for r in rows:
        assert len(r) <= w, (r, len(r))
        out.append(r + '.' * (w - len(r)))
    return out


b16('servant_raven', pad([
    "",
    "",
    "",
    "......bbb",
    ".....b8BBb",
    "....b8BIEbb",
    "....bBBIIbjj",
    "...bbBbbbbNjww",
    "..b78Bbbbbbwvvw",
    "..b78Bbbbbbwvkw",
    "..b7BbbbbbK.ww",
    "...b7bbbbK",
    "....bbbbK",
    ".....N.N",
    "....NjNNjN",
    "",
], 16))
b16('rookery', pad([
    "",
    ".....MmmmM",
    "...MmmnnmmmM",
    "..MmnnmmbbnmM",
    "..mmmmmmOoOmmM",
    ".MmbbmmmmmmmmM",
    ".MmOoOmmnmmnmM",
    "..MmmmmmmmmmM",
    "...MMMmoOmMMM",
    "......oO.bb",
    "......oOOoo",
    "......oO",
    "......oO",
    ".....ooOO",
    "...nmmoOOmnm",
    "",
], 16))
b16('wizard_tower', pad([
    ".......V",
    ".......v",
    "......uvu",
    "......uvV",
    ".....uuvVu",
    ".....uvvvV",
    "....uuvvvVu",
    "...uuuuuuuuu",
    ".....SSSSs",
    ".....SlVSs",
    ".....SVvSs",
    ".....SSSSs",
    "....SSSSSss",
    "....SxSSSss",
    "...mSSeeSssm",
    "",
], 16))


def _portal():
    cv = Cv(16, 16)
    rnd = random.Random(3)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x + .5 - 8, y + .5 - 8)
            a = math.atan2(y + .5 - 8, x + .5 - 8)
            ray = (math.cos(a * 8) + 1) / 2
            if d < 4.6:
                cv.set(x, y, 'k')
            elif d < 5.6:
                cv.set(x, y, 'l' if a < -1.2 and a > -2.6 else 'V')
            elif d < 6.4:
                cv.set(x, y, 'v')
            elif d < 6.4 + 1.5 * ray:
                cv.set(x, y, 'u' if (x + y) % 2 else 'v')
    cv.set(6, 6, 'u'); cv.set(5, 7, 'u')
    return cv.rows()


B16['eclipse_portal'] = _portal()

icon('up_talons', [
    "............",
    ".....NX.....",
    ".....NX.....",
    "....NXXS....",
    "...NXSSSS...",
    "..NX.NX.SS..",
    "..NX.NX..S..",
    ".NX..NX..XS.",
    ".ww..ww...w.",
    ".w....w...w.",
    "............",
    "............",
])
icon('up_cage', [
    ".....y......",
    "....gGg.....",
    "...ggggg....",
    "..gy.g.Gg...",
    "..g..g..g...",
    "..g.bbb.g...",
    "..g.bIbbg...",
    "..g.bbb.g...",
    "..g..N..g...",
    "..yggggggG..",
    "..GGGGGGGG..",
    "............",
])


def _flock():
    cv = Cv(12, 12)
    big = ["H.....H", "hH...Hh", ".hHbHh.", "..hrh..", "...b..."]
    small = ["H...H", ".hbh.", "..b.."]
    cv.stamp(big, 0, 1)
    cv.stamp(small, 6, 6)
    cv.stamp(small, 1, 8)
    cv.outline()
    return cv.rows()


ICONS12['sp_frenzy'] = _flock()


def _feather():
    cv = Cv(12, 12)
    x0, y0, x1, y1 = 1.5, 10.5, 10.5, 1.5
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    for y in range(12):
        for x in range(12):
            px, py = x + .5 - x0, y + .5 - y0
            t = (px * ux + py * uy) / L
            s = px * -uy + py * ux     # signed side distance
            if t < 0.18 or t > 1.0:
                continue
            wdt = 2.3 * math.sin(math.pi * min(1, (t - 0.12) / 0.9)) + 0.3
            if abs(s) <= wdt:
                if abs(s) < 0.55:
                    c = 'X' if t < 0.5 else 'W'
                elif s < 0:
                    c = 'H' if abs(s) > wdt - 0.9 and t > 0.4 else 'h'
                else:
                    c = 'b' if abs(s) > wdt - 0.9 else 'B'
                cv.set(x, y, c)
    cv.line(1, 10, 2, 9, 'X')
    cv.outline()
    return cv.rows()


ICONS12['feather'] = _feather()


def _jar():
    cv = Cv(12, 12)
    cv.rect(3, 1, 8, 1, 'O')
    cv.rect(3, 2, 8, 2, 'o')
    cv.ell(6, 7, 4.5, 4.2, lambda x, y, nx, ny: 'W' if nx < -0.75 else ('S' if (nx > 0.75 or ny > 0.8) else 'x'))
    for (x, y, p) in [(4, 5, 'v'), (7, 6, 'r'), (5, 8, 'v')]:
        cv.set(x, y - 1, 'w'); cv.set(x - 1, y, 'w'); cv.set(x, y, p); cv.set(x + 1, y, 'w'); cv.set(x, y + 1, 'W')
    cv.set(3, 3, 'S'); cv.set(8, 3, 'S')
    cv.outline()
    return cv.rows()


ICONS12['mk_jar'] = _jar()


# ---------------------------------------------------------------- background
def bg_castle():
    W, H = 160, 90
    rnd = random.Random(7)
    cv = Cv(W, H)
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    bands = ['1', '2', '3', '4', '5', '6']
    for y in range(H):
        t = y / (H - 1) * (len(bands) - 1)
        i = int(t)
        f = t - i
        for x in range(W):
            th = (bayer[y % 4][x % 4] + .5) / 16
            c = bands[min(i + (1 if f > th else 0), len(bands) - 1)]
            cv.set(x, y, c)
    # moon glow
    mx, my, mr = 124, 22, 11
    for y in range(H):
        for x in range(W):
            d = math.hypot(x + .5 - mx, y + .5 - my)
            if mr < d < mr + 7:
                th = (bayer[y % 4][x % 4] + .5) / 16
                if (1 - (d - mr) / 7) * 0.6 > th:
                    cv.set(x, y, '9')
    # stars
    for _ in range(70):
        x, y = rnd.randrange(W), rnd.randrange(52)
        if math.hypot(x - mx, y - my) < mr + 8:
            continue
        cv.set(x, y, '+' if rnd.random() < 0.7 else '*')
    for (x, y) in [(18, 10), (64, 6), (98, 14), (148, 40), (40, 28)]:
        cv.set(x, y, '*'); cv.set(x - 1, y, '+'); cv.set(x + 1, y, '+'); cv.set(x, y - 1, '+'); cv.set(x, y + 1, '+')
    # moon
    def moonf(x, y, nx, ny):
        l = -0.6 * nx - 0.5 * ny
        r = math.hypot(nx, ny)
        if r > 0.8 and l < -0.3:
            return 'D'
        return 'L'
    cv.ell(mx, my, mr, mr, moonf)
    for (x, y, st) in [(119, 17, ["dd", "dd"]), (127, 24, [".dd", "ddd", ".dD"]), (127, 15, ["d"]), (118, 26, ["dd"])]:
        cv.stamp(st, x, y)
    # far hills
    for x in range(W):
        h1 = 62 + 4 * math.sin(x / 17.0 + 1) + 2 * math.sin(x / 7.3)
        for y in range(int(h1), H):
            cv.set(x, y, '-')
    # castle silhouette (left-centre)
    C = '='
    def tower(x0, w, ytop, roof=True):
        cv.rect(x0, ytop, x0 + w - 1, 75, C)
        if roof:
            for i in range(w // 2 + 2):
                cv.rect(x0 - 1 + i, ytop - 1 - i * 2, x0 + w - i, ytop - i * 2, C)
            cv.set(x0 + w // 2 - (0 if w % 2 else 1), ytop - (w // 2 + 2) * 2 - 1, C)
        else:
            for xx in range(x0, x0 + w, 2):
                cv.set(xx, ytop - 1, C)
    cv.rect(22, 54, 72, 75, C)
    for xx in range(22, 73, 3):
        cv.set(xx, 53, C)
    tower(18, 6, 46)
    tower(30, 7, 38)
    tower(44, 9, 28)
    tower(58, 6, 42, roof=False)
    tower(68, 7, 48)
    # windows
    for (x, y) in [(46, 34), (50, 34), (32, 44), (47, 41), (61, 47), (20, 52), (70, 54), (36, 60), (54, 58)]:
        cv.set(x, y, '@')
        cv.set(x, y + 1, '%')
    # gate
    cv.rect(46, 66, 50, 75, '0')
    cv.rect(47, 65, 49, 65, '0')
    # flag
    cv.line(48, 13, 48, 16, C)
    cv.rect(49, 13, 51, 14, '%')
    # mid hills
    for x in range(W):
        h2 = 72 + 3 * math.sin(x / 11.0 + 3) + 2.5 * math.sin(x / 23.0)
        for y in range(int(h2), H):
            cv.set(x, y, '&')
    # dead trees on mid hill
    def tree(x, y):
        cv.line(x, y, x, y - 7, '&')
        cv.line(x, y - 4, x - 3, y - 7, '&')
        cv.line(x, y - 5, x + 2, y - 8, '&')
        cv.set(x - 3, y - 8, '&')
    tree(100, 74); tree(140, 73); tree(8, 74)
    # near hills
    for x in range(W):
        h3 = 81 + 2.5 * math.sin(x / 9.0) + 2 * math.sin(x / 31.0 + 2)
        for y in range(int(h3), H):
            cv.set(x, y, '~' if y < h3 + 1 else '^')
    # grave stones
    for gx in (112, 120, 131):
        gy = int(81 + 2.5 * math.sin(gx / 9.0) + 2 * math.sin(gx / 31.0 + 2))
        cv.rect(gx, gy - 3, gx + 1, gy, '&')
    return cv.rows()


# ---------------------------------------------------------------- assemble
SPRITES = {}
SPRITES['king'] = {'w': 32, 'h': 32, 'frames': [king(0), king(1), king(2)], 'palette': 'default'}
for k, v in ICONS12.items():
    SPRITES[k] = {'w': 12, 'h': 12, 'frames': [v], 'palette': 'default'}
for k, v in B16.items():
    SPRITES[k] = {'w': 16, 'h': 16, 'frames': [v], 'palette': 'default'}
SPRITES['bg_castle'] = {'w': 160, 'h': 90, 'frames': [bg_castle()], 'palette': 'default'}

REQUIRED = {
    'king': (32, 32), 'eye': (12, 12), 'eye_gold': (16, 16), 'mana': (12, 12), 'feather': (12, 12),
    **{b: (16, 16) for b in ['servant_raven', 'scarecrow', 'rookery', 'blacksmith', 'watchtower',
                             'wizard_tower', 'catacombs', 'cathedral', 'moon_altar', 'eclipse_portal', 'bg_tile']},
    **{i: (12, 12) for i in ['up_talons', 'up_beak', 'up_cage', 'up_anvil', 'up_scroll', 'up_lens', 'up_crown',
                             'up_tome', 'up_potion', 'up_bell', 'sp_frenzy', 'sp_gaze', 'sp_moon', 'sp_storm',
                             'mk_jar', 'mk_potion', 'mk_chest', 'ach', 'lock', 'sound_on', 'sound_off']},
    'bg_castle': (160, 90),
}


def validate():
    errs = []
    for rid, (w, h) in REQUIRED.items():
        s = SPRITES.get(rid)
        if not s:
            errs.append(f'missing {rid}'); continue
        if (s['w'], s['h']) != (w, h):
            errs.append(f'{rid} size {s["w"]}x{s["h"]} != {w}x{h}')
        for fi, fr in enumerate(s['frames']):
            if len(fr) != h:
                errs.append(f'{rid}[{fi}] rows {len(fr)} != {h}')
            for ri, row in enumerate(fr):
                if len(row) != w:
                    errs.append(f'{rid}[{fi}] row {ri} len {len(row)} != {w}')
                for ch in row:
                    if ch != '.' and ch not in PALETTES[s['palette']]:
                        errs.append(f'{rid}[{fi}] row {ri} bad char {ch!r}')
    if len(SPRITES['king']['frames']) != 3:
        errs.append('king needs 3 frames')
    return errs


JS_RUNTIME = r'''
export const SKINS = ['default', 'frost', 'blood', 'gold'];

const _cache = new Map();

function _paletteFor(id, sprite, skin) {
  if (id === 'king' && skin && PALETTES[skin]) return PALETTES[skin];
  return PALETTES[sprite.palette] || PALETTES.default;
}

/** Draw a sprite to a new canvas. Unknown ids return a 1x1 transparent canvas. */
export function renderSprite(id, { scale = 4, frame = 0, skin = null } = {}) {
  const s = SPRITES[id];
  const cv = document.createElement('canvas');
  if (!s) { cv.width = cv.height = 1; return cv; }
  scale = Math.max(1, Math.round(scale));
  const n = s.frames.length;
  const rows = s.frames[((frame % n) + n) % n];
  const pal = _paletteFor(id, s, skin);
  cv.width = s.w * scale;
  cv.height = s.h * scale;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < s.h; y++) {
    const row = rows[y];
    let x = 0;
    while (x < s.w) {
      const ch = row[x];
      let run = 1;
      while (x + run < s.w && row[x + run] === ch) run++;
      if (ch !== '.' && pal[ch]) {
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x * scale, y * scale, run * scale, scale);
      }
      x += run;
    }
  }
  return cv;
}

/** PNG data URL of a sprite, cached by id + options. */
export function spriteDataURL(id, opts = {}) {
  const { scale = 4, frame = 0, skin = null } = opts || {};
  const key = `${id}|${scale}|${frame}|${id === 'king' ? (skin || '') : ''}`;
  let url = _cache.get(key);
  if (!url) {
    url = renderSprite(id, { scale, frame, skin }).toDataURL('image/png');
    _cache.set(key, url);
  }
  return url;
}
'''


def emit():
    out = ['// KROWLECT pixel art. Generated by tools/build_sprites.py (edit there, then re-run).',
           '// Rows are strings, one char per pixel; "." is transparent; other chars index the palette.', '']
    out.append('export const PALETTES = ' + json.dumps(PALETTES, indent=2) + ';\n')
    out.append('export const SPRITES = {')
    for k, s in SPRITES.items():
        out.append(f'  {k}: {{ w: {s["w"]}, h: {s["h"]}, palette: {json.dumps(s["palette"])}, frames: [')
        for fr in s['frames']:
            out.append('    [')
            for r in fr:
                out.append('      ' + json.dumps(r) + ',')
            out.append('    ],')
        out.append('  ] },')
    out.append('};')
    out.append(JS_RUNTIME)
    p = os.path.join(ROOT, 'js', 'art', 'sprites.js')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write('\n'.join(out))
    return p


if __name__ == '__main__':
    errs = validate()
    if errs:
        print('\n'.join(errs))
        raise SystemExit(1)
    print('ok ->', emit(), len(SPRITES), 'sprites')
