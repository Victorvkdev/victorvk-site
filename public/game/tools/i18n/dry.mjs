import fs from 'fs';
import { PT_UI } from '../../js/data/pt-ui.js';
const files = ['js/ui.js','js/main.js','js/state.js','js/cloud.js','js/eclipse.js'];
const SHORT = k => !k.includes('{') && k.length <= 16;
for (const f of files) {
  const s = fs.readFileSync(f,'utf8');
  for (const k of Object.keys(PT_UI)) {
    if (k.includes('{')) continue;
    const re = new RegExp("(['\"])"+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"\\1",'g');
    let m; while ((m = re.exec(s))) {
      const ctx = s.slice(Math.max(0,m.index-45), m.index+k.length+30).replace(/\n/g,' ');
      if (SHORT(k)) console.log(f.split('/').pop(),'|',k,'|',ctx);
    }
  }
}
