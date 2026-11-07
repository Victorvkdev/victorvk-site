/* victorvk.com · hero lineup (three.js r128)
   Real screens from the case studies on a shallow arc. The first scroll brings the lineup forward;
   once it is up front you can browse it (arrows, keys, drag, trackpad) and click a screen to open its case.
   Panels never tilt into each other: the whole arc only scales and moves, so no screen crosses another.
   Loads on the first sign of a person (or after 8 s), renders on demand, still frame with reduced motion. */
(function () {
  if (window.__BUILD) return;
  var d = document, root = d.documentElement, host = d.getElementById("hero-gl"), hero = d.getElementById("top");
  var list = d.getElementById("hero-list");
  if (!host || !hero || !list) return;
  var probe = d.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;
  var REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var SRC = (d.currentScript && d.currentScript.dataset.three) || "/vendor/three.min.js";
  var ITEMS = Array.prototype.map.call(list.querySelectorAll("a"), function (a) { return { src: a.getAttribute("data-shot"), href: a.getAttribute("href"), title: a.textContent }; });
  var started = false, EV = ["pointermove", "touchstart", "scroll", "keydown", "wheel"];
  function load() { var s = d.createElement("script"); s.src = SRC; s.async = true; s.onload = init; d.head.appendChild(s); }
  function go() { if (started) return; started = true; EV.forEach(function (e) { removeEventListener(e, go); }); load(); }
  EV.forEach(function (e) { addEventListener(e, go, { passive: true }); });
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
    camera.position.set(0, 0, 12);

    var N = ITEMS.length, PW = 3.2, PH = 2.0, R = 10, STEP = 0.4; // chord 2R·sin(STEP/2) ≈ 3.97 > PW: neighbours never touch
    var mask = new THREE.CanvasTexture(roundMask(512, 320, 20));
    var loader = new THREE.TextureLoader(), panels = [], group = new THREE.Group();
    scene.add(group);
    var light = function () { return root.getAttribute("data-theme") === "light"; };
    ITEMS.forEach(function (it, i) {
      var g = new THREE.Group();
      var mat = new THREE.MeshBasicMaterial({ color: 0x1a1724, alphaMap: mask, transparent: true });
      var face = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
      var rim = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.04, PH + 0.04), new THREE.MeshBasicMaterial({ color: light() ? 0xd9d3ea : 0x2c2638, alphaMap: mask, transparent: true }));
      rim.position.z = -0.004;
      g.add(rim); g.add(face);
      face.userData.index = i;
      loader.load(it.src, function (t) {
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
        var img = t.image, ar = img.width / img.height, target = PW / PH;
        if (ar > target) { t.repeat.set(target / ar, 1); t.offset.set((1 - target / ar) / 2, 0); }
        else { t.repeat.set(1, ar / target); t.offset.set(0, 1 - ar / target); }
        mat.map = t; mat.needsUpdate = true; wake();
      });
      group.add(g);
      panels.push({ g: g, face: face, mat: mat, rim: rim, i: i });
    });
    d.addEventListener("vk:theme", function () { panels.forEach(function (o) { o.rim.material.color.set(light() ? 0xd9d3ea : 0x2c2638); }); wake(); });

    // browsing state
    var startIdx = Math.max(0, ITEMS.findIndex(function (x) { return /\/orra\//.test(x.href); }));
    var focus = startIdx, target = startIdx, hover = -1;
    var now = d.getElementById("hero-now"), nowLink = now && now.querySelector("a"), nowCount = now && now.querySelector(".count");
    function setTarget(v) { target = Math.max(0, Math.min(N - 1, v)); syncNow(); wake(); }
    function syncNow() {
      var k = Math.round(target), it = ITEMS[k];
      if (nowLink) { nowLink.textContent = it.title; nowLink.setAttribute("href", it.href); }
      if (nowCount) nowCount.textContent = (k + 1) + " / " + N;
    }
    syncNow();
    var prev = d.getElementById("hero-prev"), next = d.getElementById("hero-next");
    if (prev) prev.addEventListener("click", function () { setTarget(Math.round(target) - 1); });
    if (next) next.addEventListener("click", function () { setTarget(Math.round(target) + 1); });
    addEventListener("keydown", function (e) {
      if (state.k < 0.7 || !visible || /input|textarea|select/i.test((e.target.tagName || ""))) return;
      if (e.key === "ArrowRight") { setTarget(Math.round(target) + 1); }
      if (e.key === "ArrowLeft") { setTarget(Math.round(target) - 1); }
    });

    // pointer: drag to browse, click to open
    var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), drag = null;
    function pick(ev) {
      var r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var hit = ray.intersectObjects(panels.map(function (o) { return o.face; }));
      return hit.length ? hit[0].object.userData.index : -1;
    }
    host.addEventListener("pointerdown", function (ev) { if (state.k < 0.7) return; drag = { x: ev.clientX, t: target, moved: false }; });
    addEventListener("pointermove", function (ev) {
      if (drag) {
        var dx = ev.clientX - drag.x;
        if (Math.abs(dx) > 6) drag.moved = true;
        if (drag.moved) { target = Math.max(0, Math.min(N - 1, drag.t - dx / (W * 0.18))); syncNow(); wake(); }
        return;
      }
      if (COARSE || state.k < 0.7) return;
      var h = pick(ev);
      if (h !== hover) { hover = h; host.style.cursor = h >= 0 ? "pointer" : ""; wake(); }
    }, { passive: true });
    addEventListener("pointerup", function (ev) {
      if (!drag) return;
      var wasDrag = drag.moved; drag = null;
      if (wasDrag) { setTarget(Math.round(target)); return; }
      var h = pick(ev);
      if (h < 0) return;
      if (h === Math.round(target)) location.href = ITEMS[h].href; else setTarget(h);
    });
    host.addEventListener("wheel", function (ev) {
      if (state.k < 0.7 || Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
      ev.preventDefault(); target = Math.max(0, Math.min(N - 1, target + ev.deltaX / 260)); syncNow(); wake();
      clearTimeout(host._snap); host._snap = setTimeout(function () { setTarget(Math.round(target)); }, 140);
    }, { passive: false });

    var state = { sp: 0, k: 0, mx: 0, my: 0, tx: 0, ty: 0 }, t0 = performance.now();
    function layout() { W = host.clientWidth; H = host.clientHeight; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); }
    layout();
    addEventListener("resize", function () { layout(); wake(); });
    if (!COARSE) addEventListener("pointermove", function (ev) { state.tx = ev.clientX / innerWidth - 0.5; state.ty = ev.clientY / innerHeight - 0.5; }, { passive: true });

    function progress() { var r = hero.getBoundingClientRect(), span = r.height - innerHeight; return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0; }
    function ease(x) { x = Math.min(1, Math.max(0, x)); return 1 - Math.pow(1 - x, 3); }
    function lerp(a, b, k) { return a + (b - a) * k; }
    function draw() {
      var p = REDUCE ? 1 : progress();
      state.sp += (p - state.sp) * 0.12; if (REDUCE) state.sp = 1;
      var k = ease(state.sp / 0.55); state.k = k;
      focus += (target - focus) * 0.14;
      state.mx += (state.tx - state.mx) * 0.06; state.my += (state.ty - state.my) * 0.06;
      var aspect = W / H, fit = Math.min(1, aspect / 1.55), mobile = W < 700;
      camera.position.set(state.mx * 0.35 * k, -state.my * 0.2 * k, (mobile ? 13.5 : 11) / Math.max(0.5, fit));
      camera.lookAt(0, 0, 0);
      group.scale.setScalar(lerp(mobile ? 0.5 : 0.56, mobile ? 0.82 : 1, k));
      group.position.y = lerp(mobile ? -0.75 : -1.3, mobile ? -0.15 : -0.45, k);
      panels.forEach(function (o) {
        var rel = o.i - focus, a = rel * STEP;
        o.g.position.set(Math.sin(a) * R, 0, (Math.cos(a) - 1) * R);
        o.g.rotation.set(0, -a, 0);
        var far = Math.min(1, Math.abs(rel) / 3.2);
        var shade = 1 - far * 0.55 + (o.i === hover ? 0.12 : 0);
        o.mat.color.setScalar(o.mat.map ? Math.min(1, shade) : 0.1);
        o.mat.opacity = 1 - Math.max(0, (Math.abs(rel) - 2.6)) * 0.9;
        o.rim.material.opacity = o.mat.opacity;
        o.g.visible = o.mat.opacity > 0.02;
      });
      hero.style.setProperty("--fan", k.toFixed(3));
      hero.classList.toggle("browse", k > 0.7);
      renderer.render(scene, camera);
    }
    var running = false, visible = true, raf = 0, aliveUntil = performance.now() + 1500;
    function settled() { return Math.abs(progress() - state.sp) < 0.0008 && Math.abs(target - focus) < 0.002 && Math.abs(state.tx - state.mx) < 0.002 && Math.abs(state.ty - state.my) < 0.002; }
    function loop(now) { if (!running) return; draw(); if (now > aliveUntil && settled()) { running = false; return; } raf = requestAnimationFrame(loop); }
    function wake() { aliveUntil = Math.max(aliveUntil, performance.now() + 600); start(); }
    function start() { if (running || !visible || d.hidden) return; running = true; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    addEventListener("scroll", wake, { passive: true });
    if (!COARSE) addEventListener("pointermove", wake, { passive: true });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? wake() : stop(); }).observe(hero);
    d.addEventListener("visibilitychange", function () { d.hidden ? stop() : wake(); });
    draw();
    hero.classList.add("gl-ready");
    wake();
  }
})();
