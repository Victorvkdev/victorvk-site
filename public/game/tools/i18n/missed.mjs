import fs from 'fs';
import { PT_UI } from '../../js/data/pt-ui.js';
for (const f of ['js/ui.js','js/main.js','js/eclipse.js','js/state.js','js/cloud.js']) {
  const s = fs.readFileSync(f,'utf8');
  for (const k of Object.keys(PT_UI)) {
    if (k.includes('{') || k.includes('|')) continue;
    const re = new RegExp("(?<!tr\\()(['\"])"+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"\\1",'g');
    let m; while ((m = re.exec(s))) console.log(f.split('/').pop(),'|',k,'|',s.slice(Math.max(0,m.index-35),m.index+k.length+25).replace(/\n/g,' '));
  }
}
