import os, base64
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH','/opt/pw-browsers')
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B='http://localhost:8765/tools/'
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1200,'height':630})
    pg.on('pageerror', lambda e: print('pageerror', e))
    pg.goto(B+'favicon.html'); pg.wait_for_selector('body[data-done]', state='attached')
    fav=pg.evaluate('window.FAV')
    for k,n in (('f32','favicon-32.png'),('f64','favicon-64.png')):
        open(os.path.join(ROOT,'img',n),'wb').write(base64.b64decode(fav[k].split(',')[1]))
    pg.goto(B+'og.html'); pg.wait_for_selector('body[data-done]', timeout=20000); pg.wait_for_timeout(300)
    print('font loaded:', pg.evaluate("document.fonts.check('700 40px \"Pixelify Sans\"')"))
    pg.screenshot(path=os.path.join(ROOT,'img','og.png'))
    b.close()
print('done')
