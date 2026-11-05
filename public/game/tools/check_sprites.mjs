// Validates js/art/sprites.js shape: sizes, row lengths, palette chars, skins.
import { PALETTES, SPRITES, SKINS } from '../js/art/sprites.js';
const req = { king:[32,32], eye:[12,12], eye_gold:[16,16], mana:[12,12], feather:[12,12], bg_castle:[160,90], bg_tile:[16,16] };
for (const b of ['servant_raven','scarecrow','rookery','blacksmith','watchtower','wizard_tower','catacombs','cathedral','moon_altar','eclipse_portal']) req[b]=[16,16];
for (const i of ['up_talons','up_beak','up_cage','up_anvil','up_scroll','up_lens','up_crown','up_tome','up_potion','up_bell','sp_frenzy','sp_gaze','sp_moon','sp_storm','mk_jar','mk_potion','mk_chest','ach','lock','sound_on','sound_off']) req[i]=[12,12];
let errs = [];
for (const [id,[w,h]] of Object.entries(req)) {
  const s = SPRITES[id]; if (!s) { errs.push('missing '+id); continue; }
  if (s.w!==w||s.h!==h) errs.push(`${id} size`);
  s.frames.forEach((fr,fi)=>{ if(fr.length!==h) errs.push(`${id}[${fi}] rows ${fr.length}`);
    fr.forEach((r,ri)=>{ if(r.length!==w) errs.push(`${id}[${fi}] row ${ri} len ${r.length}`);
      for (const c of r) if(c!=='.' && !(c in PALETTES[s.palette])) errs.push(`${id} bad char ${c}`); }); });
}
if (SPRITES.king.frames.length!==3) errs.push('king frames');
for (const sk of SKINS) if (!PALETTES[sk]) errs.push('skin palette missing '+sk);
console.log(errs.length ? errs.join('\n') : `OK: ${Object.keys(SPRITES).length} sprites, ${SKINS.length} skins`);
process.exit(errs.length?1:0);
