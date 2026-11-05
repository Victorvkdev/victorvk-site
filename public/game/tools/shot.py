# usage: python3 shot.py <url> <out.png> [width height]  (full page)
import sys, os
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH','/opt/pw-browsers')
from playwright.sync_api import sync_playwright
url, out = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv)>3 else 1400
h = int(sys.argv[4]) if len(sys.argv)>4 else 900
full = len(sys.argv)<=4
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':w,'height':h})
    pg.on('console', lambda m: print('console:', m.text))
    pg.on('pageerror', lambda e: print('pageerror:', e))
    pg.goto(url); pg.wait_for_selector('body[data-done]', timeout=15000)
    pg.wait_for_timeout(300)
    pg.screenshot(path=out, full_page=full, omit_background=False)
    b.close()
print('saved', out)
