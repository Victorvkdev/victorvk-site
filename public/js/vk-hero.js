/* victorvk.com · hero lineup (three.js r128)
   Real screens from the case studies as glossy panels. At the top they sit in a stacked deck;
   scrolling through the pinned hero fans them out into a lineup, so the work is the first thing you see.
   Loaded after the page, paused off-screen, a still lineup with reduced motion, CSS fallback without WebGL. */
(function () {
  if (window.__BUILD) return;
  var d = document, root = d.documentElement, host = d.getElementById("hero-gl"), hero = d.getElementById("top");
  if (!host || !hero) return;
  var probe = d.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;
  var REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var SRC = (d.currentScript && d.currentScript.dataset.three) || "/vendor/three.min.js";
  var SHOTS = (host.getAttribute("data-shots") || "").split(",").filter(Boolean);
  function load() { var s = d.createElement("script"); s.src = SRC; s.async = true; s.onload = init; d.head.appendChild(s); }
  // The scene loads on the first sign of a person (pointer, touch, scroll, key) or after 8 s, so it never competes with the first paint.
  var started = false;
  function go() { if (started) return; started = true; ["pointermove", "touchstart", "scroll", "keydown", "wheel"].forEach(function (e) { removeEventListener(e, go); }); load(); }
  ["pointermove", "touchstart", "scroll", "keydown", "wheel"].forEach(function (e) { addEventListener(e, go, { passive: true }); });
  setTimeout(go, 8000);

  function roundMask(w, h, r) {
    var c = d.createElement("canvas"); c.width = w; c.height = h; var g = c.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.closePath(); g.fill();
    return c;
  }

  function init() {
    var THREE = window.THREE; if (!THREE) return;
    var W = host.clientWidth, H = host.clientHeight;
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.6 : 2));
    renderer.setSize(W, H); renderer.setClearColor(0, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);

    var mobile = W < 700;
    var shots = mobile ? SHOTS.slice(1, 6) : SHOTS.slice(0, 7), N = shots.length;
    var PW = 3.2, PH = 2.0;
    var mask = new THREE.CanvasTexture(roundMask(512, 320, 22));
    var glowTex = (function () {
      var c = d.createElement("canvas"); c.width = c.height = 256; var g = c.getContext("2d");
      var r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
    })();
    var loader = new THREE.TextureLoader(), panels = [], group = new THREE.Group();
    scene.add(group);
    var accent = new THREE.Color(getComputedStyle(root).getPropertyValue("--scene-a").trim() || "#8a6cff");
    shots.forEach(function (src, i) {
      var g = new THREE.Group();
      var mat = new THREE.MeshBasicMaterial({ color: 0x15121d, alphaMap: mask, transparent: true });
      var face = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
      var edge = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.05, PH + 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: mask, transparent: true, opacity: 0.16 }));
      edge.position.z = -0.004;
      var sheen = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: mask, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      sheen.position.z = 0.003;
      var glow = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.9, PH * 1.9), new THREE.MeshBasicMaterial({ color: accent, map: glowTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.z = -0.05;
      g.add(glow); g.add(edge); g.add(face); g.add(sheen);
      loader.load(src, function (t) {
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
        var img = t.image, ar = img.width / img.height, target = PW / PH;
        if (ar > target) { t.repeat.set(target / ar, 1); t.offset.set((1 - target / ar) / 2, 0); }
        else { t.repeat.set(1, ar / target); t.offset.set(0, 1 - ar / target); }
        mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true;
        if (!running) draw();
      });
      group.add(g);
      panels.push({ g: g, sheen: sheen, glow: glow, i: i });
    });

    var state = { sp: 0, mx: 0, my: 0, tx: 0, ty: 0 }, t0 = performance.now();
    function layout() {
      W = host.clientWidth; H = host.clientHeight; mobile = W < 700;
      renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
    }
    layout();
    addEventListener("resize", function () { layout(); if (!running) draw(); });
    if (!COARSE) addEventListener("pointermove", function (ev) { state.tx = ev.clientX / innerWidth - 0.5; state.ty = ev.clientY / innerHeight - 0.5; }, { passive: true });
    d.addEventListener("vk:theme", function () { accent.set(getComputedStyle(root).getPropertyValue("--scene-a").trim() || "#8a6cff"); if (!running) draw(); });

    function progress() { var r = hero.getBoundingClientRect(), span = r.height - innerHeight; return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0; }
    function ease(x) { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function lerp(a, b, k) { return a + (b - a) * k; }
    function draw(now) {
      now = now || performance.now();
      var t = (now - t0) / 1000;
      var target = REDUCE ? 1 : progress();
      state.sp += (target - state.sp) * 0.09;
      if (REDUCE) state.sp = 1;
      var p = state.sp, k = ease(p / 0.8);
      state.mx += (state.tx - state.mx) * 0.05; state.my += (state.ty - state.my) * 0.05;
      var aspect = W / H, fit = Math.min(1, aspect / 1.6);
      camera.position.set(state.mx * 0.6, -state.my * 0.3 + lerp(0.9, 0, k), lerp(mobile ? 11 : 13.5, mobile ? 12 : 10.5, k) / Math.max(0.55, fit));
      camera.lookAt(0, lerp(-0.2, -0.25, k), 0);
      var R = 9, step = mobile ? 0.36 : 0.3;
      panels.forEach(function (o) {
        var i = o.i, c = i - (N - 1) / 2;
        // deck: stacked, laid back, slightly fanned
        var dx = c * 0.34, dy = (mobile ? -1.2 : -1.95) - Math.abs(c) * 0.05, dz = -Math.abs(c) * 0.5 + (c > 0 ? -0.1 : 0);
        var drx = -0.95, dry = c * 0.08, drz = -c * 0.06;
        // lineup: on a wide arc facing the camera
        var a = c * step, lx = Math.sin(a) * R, lz = (1 - Math.cos(a)) * -R + (c === 0 ? 0.6 : 0), ly = -0.55 + Math.sin(t * 0.8 + i) * 0.05 * (REDUCE ? 0 : 1);
        var lry = -a * 0.9;
        var kk = ease((p - 0.04 * Math.abs(c)) / 0.76);
        o.g.position.set(lerp(dx, lx, kk), lerp(dy, ly, kk) + (REDUCE ? 0 : Math.sin(t * 0.9 + i * 0.7) * 0.03), lerp(dz, lz, kk));
        o.g.rotation.set(lerp(drx, 0, kk) - state.my * 0.04, lerp(dry, lry, kk) + state.mx * 0.06, lerp(drz, 0, kk));
        var sc = c === 0 ? lerp(1, 1.18, kk) : 1;
        o.g.scale.setScalar(sc);
        o.sheen.material.opacity = 0.05 + 0.1 * Math.max(0, Math.sin(t * 0.6 + i * 0.9 + kk * 3)) * (1 - kk * 0.5);
        o.glow.material.opacity = (c === 0 ? 0.32 : 0.14) * (0.4 + 0.6 * kk);
      });
      hero.style.setProperty("--fan", k.toFixed(3));
      renderer.render(scene, camera);
    }
    // Render on demand: a few seconds of life after load, then only while scroll or pointer is still settling.
    var running = false, visible = true, raf = 0, aliveUntil = performance.now() + 3000;
    function settled() { return Math.abs(progress() - state.sp) < 0.0008 && Math.abs(state.tx - state.mx) < 0.002 && Math.abs(state.ty - state.my) < 0.002; }
    function loop(now) { if (!running) return; draw(now); if (now > aliveUntil && settled()) { running = false; return; } raf = requestAnimationFrame(loop); }
    function wake() { aliveUntil = Math.max(aliveUntil, performance.now() + 900); start(); }
    addEventListener("scroll", wake, { passive: true });
    if (!COARSE) addEventListener("pointermove", wake, { passive: true });
    function start() { if (running || REDUCE || !visible || d.hidden) return; running = true; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(hero);
    d.addEventListener("visibilitychange", function () { d.hidden ? stop() : start(); });
    draw();
    hero.classList.add("gl-ready");
    if (!REDUCE) start();
  }
})();
