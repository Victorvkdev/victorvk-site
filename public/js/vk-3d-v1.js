/* ===== VK 3D DICE: d6 (hero) · d10 (process) · d20 (contact) =====
   One small WebGL canvas moves between empty corners of the page and shows the die of that corner.
   It never sits over content: a slot only shows when 20px of air around it are free.
   Click / tap / Enter on a die rolls it: it tumbles, lands on a random face and says something.
   At the end of the page the d20 rolls a natural 20 on its own.
   Loaded lazily; skipped with reduced motion or without WebGL. */
(function () {
  if (window.__BUILD) return;
  var d = document, root = d.documentElement, pt = (root.lang || "").indexOf("pt") === 0;
  if (!window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var probe = d.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;
  var COARSE = matchMedia("(pointer: coarse)").matches;
  var SRC = (d.currentScript && d.currentScript.dataset.three) || "/vendor/three.min.js";
  function idle() { (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(function () {
    var s = d.createElement("script"); s.src = SRC; s.async = true; s.onload = init; d.head.appendChild(s); }); }
  if (d.readyState === "complete") idle(); else addEventListener("load", idle);

  var SAY = {
    max: pt ? "Sorte grande!" : "Critical hit. Lucky you!",
    min: pt ? "Falha crítica. Vamos resolver." : "Critical fail. Let's fix it.",
    high: pt ? "Mandou bem." : "Great roll.",
    mid: pt ? "Rolagem sólida. Segue o jogo." : "Solid roll. Keep going.",
    low: pt ? "Rolagem baixa. Acontece em todo funil." : "Low roll. Happens in every funnel."
  };
  function phrase(n, sides) { if (n === sides) return SAY.max; if (n === 1) return SAY.min; var r = n / sides; return r >= .75 ? SAY.high : r >= .4 ? SAY.mid : SAY.low; }

  function init() {
    var T = window.THREE; if (!T) return;
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }; // easeInOutCubic
    var BOX = 240;
    var cv = d.createElement("canvas"); cv.className = "d20"; cv.setAttribute("aria-hidden", "true");
    cv.style.width = cv.style.height = BOX + "px"; d.body.appendChild(cv);
    var hit = d.createElement("button"); hit.type = "button"; hit.className = "die-hit"; hit.hidden = true; d.body.appendChild(hit);
    var say = d.createElement("div"); say.className = "die-say"; say.setAttribute("role", "status"); say.setAttribute("aria-live", "polite"); d.body.appendChild(say);

    var rd = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: "low-power" });
    rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 1.75)); rd.setSize(BOX, BOX, false);
    rd.outputEncoding = T.sRGBEncoding; rd.toneMapping = T.ACESFilmicToneMapping; rd.toneMappingExposure = 1.05;
    var scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 0, 6.2);
    var envS = new T.Scene(); envS.background = new T.Color(0x0d0a16);
    function panel(c, x, y, z, w, h) { var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envS.add(m); }
    panel(0xffffff, 0, 6, 3, 8, 3); panel(0xb9a8ff, -6, 1, 2, 3, 6); panel(0xff6fa5, 6, -1, -1, 2.5, 5); panel(0x5b3fd6, 0, -6, 0, 10, 2);
    var pm = new T.PMREMGenerator(rd); scene.environment = pm.fromScene(envS, .04).texture; pm.dispose();
    scene.add(new T.HemisphereLight(0xd9d0ff, 0x1a1230, .5));
    var key = new T.DirectionalLight(0xffffff, 1.1); key.position.set(2, 3, 4); scene.add(key);
    var rim = new T.DirectionalLight(0xff6fa5, .9); rim.position.set(-3, -1, -2); scene.add(rim);

    /* ---------- dice ---------- */
    function label(n, pips) {
      var k = d.createElement("canvas"); k.width = k.height = 128; var g = k.getContext("2d"); g.fillStyle = "#f3f0fb";
      if (pips) {
        var P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[34, 34], [64, 64], [94, 94]], 4: [[38, 38], [90, 38], [38, 90], [90, 90]], 5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], 6: [[38, 32], [90, 32], [38, 64], [90, 64], [38, 96], [90, 96]] }[n];
        P.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 11, 0, Math.PI * 2); g.fill(); });
      } else {
        g.font = "600 " + (n > 9 ? 58 : 66) + "px Geist, 'Bricolage Grotesque', system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(n), 64, 70); if (n === 6 || n === 9) g.fillRect(48, 104, 32, 6);
      }
      var t = new T.CanvasTexture(k); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
    }
    function numberOpposites(faces, sides) {
      var next = 1;
      faces.forEach(function (fa) {
        if (fa.num) return;
        var opp = faces.reduce(function (best, o) { return o !== fa && !o.num && (!best || o.n.dot(fa.n) < best.n.dot(fa.n)) ? o : best; }, null);
        fa.num = next; if (opp) opp.num = sides + 1 - next; next++;
      });
    }
    function build(kind) {
      var geo, faces = [], sides, lbl;
      if (kind === 6) {
        sides = 6; var S = 1.5, h = S / 2; geo = new T.BoxGeometry(S, S, S);
        [[1, 0, 0, 0, 1, 0], [-1, 0, 0, 0, 1, 0], [0, 1, 0, 0, 0, -1], [0, -1, 0, 0, 0, 1], [0, 0, 1, 0, 1, 0], [0, 0, -1, 0, 1, 0]].forEach(function (a) {
          var n = new T.Vector3(a[0], a[1], a[2]); faces.push({ n: n, c: n.clone().multiplyScalar(h), up: new T.Vector3(a[3], a[4], a[5]) }); });
        numberOpposites(faces, 6); lbl = .78;
      } else if (kind === 10) {
        sides = 10; var R = 1.15, H = 1.25, e = H * (1 - Math.cos(Math.PI / 5)) / (1 + Math.cos(Math.PI / 5));
        var top = new T.Vector3(0, H, 0), bot = new T.Vector3(0, -H, 0), U = [], L = [], pos = [];
        for (var i = 0; i < 5; i++) { var a1 = i * 2 * Math.PI / 5, a2 = a1 + Math.PI / 5; U.push(new T.Vector3(R * Math.cos(a1), e, R * Math.sin(a1))); L.push(new T.Vector3(R * Math.cos(a2), -e, R * Math.sin(a2))); }
        function tri(a, b, c) { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); }
        function kite(apex, s1, opp, s2) { // planar kite apex-s1-opp-s2
          tri(apex, s1, opp); tri(apex, opp, s2);
          var c = new T.Vector3().addVectors(apex, opp).multiplyScalar(.5).lerp(new T.Vector3().addVectors(s1, s2).multiplyScalar(.5), .5);
          var n = new T.Vector3().subVectors(s1, apex).cross(new T.Vector3().subVectors(s2, apex)).normalize(); if (n.dot(c) < 0) n.negate();
          faces.push({ c: c.lerp(apex, .12), n: n, up: new T.Vector3().subVectors(apex, opp).normalize() });
        }
        for (i = 0; i < 5; i++) { kite(top, U[i], L[i], U[(i + 1) % 5]); kite(bot, L[i], U[(i + 1) % 5], L[(i + 1) % 5]); }
        geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
        var p = geo.attributes.position, A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3();
        for (var t = 0; t < p.count; t += 3) { A.fromBufferAttribute(p, t); B.fromBufferAttribute(p, t + 1); C.fromBufferAttribute(p, t + 2);
          var nn = new T.Vector3().subVectors(B, A).cross(new T.Vector3().subVectors(C, A)), cc = A.clone().add(B).add(C);
          if (nn.dot(cc) < 0) { p.setXYZ(t + 1, C.x, C.y, C.z); p.setXYZ(t + 2, B.x, B.y, B.z); } }
        geo.computeVertexNormals();
        numberOpposites(faces, 10); lbl = .52;
      } else {
        sides = 20; var R2 = 1.25; geo = new T.IcosahedronGeometry(R2, 0);
        var ps = geo.attributes.position;
        for (var f = 0; f < 20; f++) {
          var a = new T.Vector3().fromBufferAttribute(ps, f * 3), b = new T.Vector3().fromBufferAttribute(ps, f * 3 + 1), c = new T.Vector3().fromBufferAttribute(ps, f * 3 + 2);
          var cen = a.clone().add(b).add(c).divideScalar(3); faces.push({ c: cen, n: cen.clone().normalize(), up: b.clone().sub(cen).normalize() });
        }
        numberOpposites(faces, 20); lbl = .46 * R2;
      }
      var mat = new T.MeshPhysicalMaterial({ color: new T.Color(0x5b3fd6).convertSRGBToLinear(), metalness: .2, roughness: .26, clearcoat: 1, clearcoatRoughness: .08, flatShading: true, envMapIntensity: .9 });
      var edgeMat = new T.LineBasicMaterial({ color: 0xd9ceff, transparent: true, opacity: .85 });
      var grp = new T.Group(); grp.add(new T.Mesh(geo, mat)); grp.add(new T.LineSegments(new T.EdgesGeometry(geo, 10), edgeMat));
      var lg = new T.PlaneGeometry(lbl, lbl);
      faces.forEach(function (fa) {
        fa.up = fa.up.clone().sub(fa.n.clone().multiplyScalar(fa.up.dot(fa.n))).normalize(); // flat on its face
        var m = new T.Mesh(lg, new T.MeshBasicMaterial({ map: label(fa.num, false), transparent: true, depthWrite: false, toneMapped: false }));
        m.position.copy(fa.c).addScaledVector(fa.n, .006); m.up.copy(fa.up); m.lookAt(fa.c.clone().add(fa.n)); grp.add(m);
      });
      grp.visible = false; scene.add(grp);
      return { kind: kind, sides: sides, grp: grp, mat: mat, edge: edgeMat, faces: faces, held: null, rolling: 0, from: new T.Quaternion(), to: new T.Quaternion(), result: 0, spin: [2, 1, 1] };
    }
    function faceQuat(fa) { // shows this face to the camera with its number upright
      var q1 = new T.Quaternion().setFromUnitVectors(fa.n, new T.Vector3(0, 0, 1));
      var up = fa.up.clone().applyQuaternion(q1), ang = Math.atan2(up.x, up.y);
      return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), ang).multiply(q1);
    }
    var DICE = { hero: build(6), process: build(10), contact: build(20) };
    var NAME = { 6: "d6", 10: "d10", 20: "d20" };

    /* ---------- slots (all in empty air) ---------- */
    function rectOf(sel) { var e = d.querySelector(sel); return e ? e.getBoundingClientRect() : null; }
    function padTop(sel) { var e = d.querySelector(sel); return e ? parseFloat(getComputedStyle(e).paddingTop) : 0; }
    var SLOTS = [
      { id: "hero", get: function () {
          if (innerWidth < 860) return null;
          var h1 = d.querySelector(".hero h1"), pcc = d.querySelector(".pc-card img"), ctas = d.querySelector(".hero-ctas"); if (!h1 || !pcc) return null;
          var r2 = pcc.getBoundingClientRect(), rg = d.createRange(); rg.selectNodeContents(h1); var tr = rg.getBoundingClientRect();
          var gap = r2.left - tr.right, s = Math.min(110, gap - 100);
          if (s >= 70) return { x: tr.right + gap / 2, y: r2.top + s * .7, s: s };
          if (!ctas) return null; // headline too wide: use the air to the right of the buttons
          var cb = ctas.lastElementChild.getBoundingClientRect(), g2 = r2.left - cb.right; s = Math.min(96, g2 - 110); if (s < 64) return null;
          return { x: cb.right + g2 / 2, y: cb.top + cb.height / 2, s: s };
        } },
      { id: "process", get: function () {
          var sec = rectOf("#process"), w = rectOf("#process .wrap"); if (!sec || !w) return null; var p = padTop("#process");
          var wide = innerWidth >= 860, s = Math.min(wide ? 92 : 56, p - (wide ? 40 : 26)); if (s < 44) return null;
          return { x: w.right - (wide ? 100 : 30) - s / 2, y: sec.top + p / 2 + 4, s: s };
        } },
      { id: "contact", get: function () {
          var sec = rectOf("#contact"), r = rectOf("#contact .ct-r"); if (!sec || !r) return null; var p = padTop("#contact");
          var s = Math.min(innerWidth >= 860 ? 100 : 60, p - 30); if (s < 50) return null;
          return { x: innerWidth >= 860 ? r.left + r.width * .78 : r.right - 36, y: sec.top + p / 2 + 8, s: s };
        } }
    ];
    var TEXT = "h1,h2,h3,h4,p,li,.label,.pc-hud,blockquote,dt,dd", BOXES = "img,figure,button:not(.die-hit),input,a.btn,.case,.svc,.flow,.steps,.metric,.pc-chip,.ach,nav,.xp-lv,.play-card";
    function hits(r) {
      var els = d.querySelectorAll(TEXT + "," + BOXES);
      for (var k = 0; k < els.length; k++) {
        var el = els[k], b = el.getBoundingClientRect();
        if (!b.width || b.bottom < r.top || b.top > r.bottom || b.right < r.left || b.left > r.right) continue;
        if (el.matches(BOXES)) return true;
        var rg = d.createRange(); rg.selectNodeContents(el); var ls = rg.getClientRects();
        for (var m = 0; m < ls.length; m++) { var q = ls[m]; if (q.width && !(q.bottom < r.top || q.top > r.bottom || q.right < r.left || q.left > r.right)) return true; }
      }
      return false;
    }
    function clear(g) { var a = g.s / 2 + 20; return !hits({ left: g.x - a, right: g.x + a, top: g.y - a, bottom: g.y + a }); }
    var dirty = true, cached = null;
    function pick() {
      var vh = innerHeight;
      if (!dirty) { if (cached) { var g2 = SLOTS.filter(function (x) { return x.id === cached.id; })[0].get(); if (g2 && g2.y >= 64 + g2.s * .6 && g2.y <= vh - g2.s * .6) cached.g = g2; else dirty = true; } if (!dirty) return cached; }
      dirty = false; var best = null, bd = 1e9;
      SLOTS.forEach(function (sl) {
        var g = sl.get(); if (!g) return;
        if (g.y < 64 + g.s * .6 || g.y > vh - g.s * .6 || !clear(g)) return;
        var dist = Math.abs(g.y - vh / 2); if (dist < bd) { bd = dist; best = { id: sl.id, g: g }; }
      });
      cached = best; return best;
    }

    /* ---------- state ---------- */
    var idleT = 0, cur = null, die = null, shown = 0, leaving = false, target = null, hover = 0, hoverT = 0;
    var px = 0, py = 0, tx = 0, ty = 0, vis = !d.hidden, last = performance.now(), sayT = 0, lastR = 0;
    var eul = new T.Euler(), qa = new T.Quaternion(), qt = new T.Quaternion();
    addEventListener("pointermove", function (e) { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; kick(); }, { passive: true });
    d.addEventListener("visibilitychange", function () { vis = !d.hidden; if (vis) kick(); });
    /* full slot check (text hit-tests) at most every 150 ms while scrolling, plus once when it settles: running it every frame made touch scrolling stutter */
    var lastPick = 0, settle = 0;
    addEventListener("scroll", function () { var n = performance.now(); if (n - lastPick > 150) { dirty = true; lastPick = n; } clearTimeout(settle); settle = setTimeout(function () { dirty = true; kick(); }, 120); kick(); }, { passive: true });
    addEventListener("resize", function () { dirty = true; kick(); });
    setInterval(function () { dirty = true; kick(); }, 1000);

    function roll(dc, forced) {
      var n = forced || 1 + Math.floor(Math.random() * dc.sides);
      var fa = dc.faces.filter(function (f) { return f.num === n; })[0];
      dc.from.copy(dc.grp.quaternion); dc.to.copy(faceQuat(fa)); dc.rolling = 1; dc.result = n; dc.held = null;
      dc.spin = [2 + Math.floor(Math.random() * 2), 1 + Math.floor(Math.random() * 2), Math.random() < .5 ? 1 : -1];
      say.classList.remove("on"); kick();
    }
    var sayPos = null;
    function placeSay(g) { // below the die if that is free air, else left, else above
      var w = say.offsetWidth || 180, h = say.offsetHeight || 52, r = g.s / 2, opts = [
        [g.x - w / 2, g.y + r * 1.1 + 10], [g.x - r * 1.1 - 14 - w, g.y - h / 2], [g.x - w / 2, g.y - r * 1.1 - 10 - h]];
      if (!sayPos) {
        sayPos = opts[0];
        for (var i = 0; i < opts.length; i++) { var o = opts[i], L = clamp(o[0], 12, innerWidth - w - 12);
          if (!hits({ left: L - 12, right: L + w + 12, top: o[1] - 12, bottom: o[1] + h + 12 })) { sayPos = [o[0], o[1]]; break; } }
        sayPos = [sayPos[0] - g.x, sayPos[1] - g.y]; // keep it relative so it scrolls with the die
      }
      say.style.left = clamp(g.x + sayPos[0], 12, innerWidth - w - 12).toFixed(0) + "px"; say.style.top = (g.y + sayPos[1] + scrollY).toFixed(0) + "px";
    }
    function speak(dc) {
      sayPos = null;
      say.innerHTML = "<small>" + NAME[dc.kind] + " · " + dc.result + "</small><span>" + phrase(dc.result, dc.sides) + "</span>";
      say.classList.toggle("crit", dc.result === dc.sides); say.classList.toggle("fail", dc.result === 1);
      say.classList.add("on"); sayT = 3;
    }
    hit.addEventListener("click", function (e) { e.preventDefault(); if (die && !die.rolling) roll(die); });
    d.addEventListener("pointerup", function (e) { // fallback: a click inside the die's circle rolls it even if another layer took the event
      if (!die || die.rolling || !cur || hit.hidden || e.target === hit || e.button > 0) return;
      var g = cur.g, dx = e.clientX - g.x, dy = e.clientY - g.y; if (dx * dx + dy * dy > (g.s / 2) * (g.s / 2)) return;
      if (e.target.closest && e.target.closest("a,button,input,label,summary,[role=button]")) return;
      roll(die);
    });
    hit.addEventListener("pointerenter", function () { hoverT = 1; kick(); });
    hit.addEventListener("pointerleave", function () { hoverT = 0; kick(); });
    hit.addEventListener("focus", function () { hoverT = 1; kick(); });
    hit.addEventListener("blur", function () { hoverT = 0; kick(); });
    var pendingNat = false;
    addEventListener("vk:achievement", function () { pendingNat = true; kick(); });

    var raf = 0;
    function kick() { if (!raf && vis) raf = requestAnimationFrame(loop); }
    function loop(now) {
      raf = 0; var rdt = Math.min(.25, (now - last) / 1000), dt = Math.min(.05, rdt); last = now;
      var p = pick();
      if (!cur && p) { cur = p; shown = 0; leaving = false; }
      else if (cur && (!p || p.id !== cur.id)) { leaving = true; target = p; var og = SLOTS.filter(function (x) { return x.id === cur.id; })[0].get(); if (og) cur.g = og; }
      else if (cur && p) { cur.g = p.g; leaving = false; }
      if (leaving) { shown = Math.max(0, shown - rdt / .55); if (shown === 0) { cur = target; target = null; leaving = false; } }
      else if (cur) shown = Math.min(1, shown + rdt / .75);
      var nd = cur ? DICE[cur.id] : null;
      if (nd !== die) { if (die) { die.grp.visible = false; if (die.rolling) { die.rolling = 0; die.held = die.to.clone(); } } die = nd; if (die) die.grp.visible = true; }
      if (sayT > 0) { sayT -= rdt; if (sayT <= 0 || leaving) { sayT = 0; say.classList.remove("on"); } }
      if (!cur) { cv.style.opacity = "0"; hit.hidden = true; return; }
      if (cur.id === "contact" && pendingNat && shown > .8 && !die.rolling) { pendingNat = false; roll(die, 20); }

      /* the die lives in page coordinates (position: absolute), so native scrolling carries it with the content; JS only moves it between slots */
      var g = cur.g, k = ease(shown), size = g.s / (BOX * .6), sy0 = scrollY;
      hover += (hoverT - hover) * Math.min(1, dt * 8);
      var sc = size * (.86 + .14 * k) * (1 + .07 * hover);
      cv.style.opacity = k.toFixed(3);
      cv.style.transform = "translate3d(" + (g.x - BOX / 2).toFixed(1) + "px," + (g.y + sy0 - BOX / 2 + (1 - k) * 14).toFixed(1) + "px,0) scale(" + sc.toFixed(3) + ")";
      var hs = g.s * 1.05; hit.hidden = k < .5;
      hit.style.left = (g.x - hs / 2).toFixed(0) + "px"; hit.style.top = (g.y + sy0 - hs / 2).toFixed(0) + "px"; hit.style.width = hit.style.height = hs.toFixed(0) + "px";
      var lbl = (pt ? "Rolar o " : "Roll the ") + NAME[die.kind]; if (hit.getAttribute("aria-label") !== lbl) { hit.setAttribute("aria-label", lbl); hit.title = lbl; }
      if (say.classList.contains("on")) placeSay(g);

      px += (tx - px) * Math.min(1, dt * 5); py += (ty - py) * Math.min(1, dt * 5);
      qt.setFromEuler(eul.set(py * .45, px * .6, 0));
      if (die.rolling > 0) {
        die.rolling = Math.max(0, die.rolling - rdt / 1.5); var t = 1 - die.rolling, e = 1 - Math.pow(1 - t, 4);
        qa.setFromEuler(eul.set(e * Math.PI * 2 * die.spin[0], e * Math.PI * 2 * die.spin[1] * die.spin[2], e * Math.PI * .5)).premultiply(die.from);
        die.grp.quaternion.copy(qa).slerp(die.to, Math.pow(t, 2.2));
        if (die.rolling === 0) { die.held = die.to.clone(); speak(die); }
      } else if (die.held) {
        die.grp.quaternion.copy(die.held).premultiply(qa.setFromEuler(eul.set(-.12 + py * .12, .15 + px * .16, 0)));
      } else {
        var sy = scrollY, spin = 1 - hover;
        idleT += rdt * spin; qa.setFromEuler(eul.set(sy * .0021 + idleT * .12, sy * .0034 + idleT * .2, 0));
        die.grp.quaternion.copy(qa).premultiply(qt);
      }
      var hot = cur.id === "contact" ? 1 : cur.id === "process" ? .4 : 0;
      die.mat.color.setRGB(.357 + .2 * hot, .247 - .05 * hot, .839 - .25 * hot).convertSRGBToLinear();
      die.edge.color.setRGB(.85 + .15 * hot, .81 - .25 * hot, 1 - .2 * hot);
      var busy = die.rolling > 0 || shown < 1 || leaving || Math.abs(hoverT - hover) > .01;
      if (!COARSE || busy || now - lastR > 32) { rd.render(scene, cam); lastR = now; } // touch: idle spin at 30 fps
      if (vis && !raf) raf = requestAnimationFrame(loop);
    }
    kick();
  }
})();
