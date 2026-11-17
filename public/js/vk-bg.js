/* victorvk.com · hero background (WebGL2 fragment shader)
   Liquid chrome in Violet Ink: a domain-warped height field lit like polished metal, with a thin iridescent edge.
   Renders at reduced resolution, only while visible, one still frame with reduced motion. Falls back to the CSS gradient. */
(function () {
  if (window.__BUILD) return;
  var d = document, host = d.getElementById("nebula");
  if (!host) return;
  var REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var cv = d.createElement("canvas");
  var gl = cv.getContext("webgl2", { antialias: false, alpha: true, powerPreference: "low-power" });
  if (!gl) return;

  var VS = "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FS = "#version 300 es\nprecision highp float;\n" +
    "uniform vec2 uRes;uniform float uT;uniform vec2 uM;uniform float uL;out vec4 o;\n" +
    "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n" +
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}\n" +
    "float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}\n" +
    "float field(vec2 p,float t){vec2 q=vec2(fbm(p+vec2(0.,t*.6)),fbm(p+vec2(5.2,1.3)-t*.4));vec2 r=vec2(fbm(p+2.2*q+vec2(1.7,9.2)+t*.3),fbm(p+2.2*q+vec2(8.3,2.8)-t*.25));return fbm(p+2.4*r);}\n" +
    "void main(){\n" +
    "vec2 uv=gl_FragCoord.xy/uRes;float asp=uRes.x/uRes.y;\n" +
    "vec2 p=vec2((uv.x-.5)*asp,uv.y-.5)*1.55+(uM-.5)*vec2(.18,.12);\n" +
    "float t=uT*.07;\n" +
    "float f=field(p,t);\n" +
    "float e=.012;vec2 g=vec2(field(p+vec2(e,0.),t)-field(p-vec2(e,0.),t),field(p+vec2(0.,e),t)-field(p-vec2(0.,e),t))/(2.*e);\n" +
    "vec3 nor=normalize(vec3(-g*.9,1.));\n" +
    "vec3 v=vec3(0.,0.,1.);vec3 rf=reflect(-v,nor);\n" +
    "float env=smoothstep(-.55,.85,rf.y+.25*sin(rf.x*3.+t*2.));\n" +
    "vec3 ink=vec3(.027,.024,.043);vec3 vi=vec3(.24,.13,.62);vec3 vh=vec3(.55,.45,1.);vec3 si=vec3(.86,.88,1.);\n" +
    "vec3 dk=mix(ink,vi,smoothstep(.25,.75,f));\n" +
    "vec3 c=mix(dk,vh*.55,pow(env,3.)*.75);\n" +
    "float rim=pow(1.-nor.z,2.2);float sp=pow(max(rf.y,0.),14.)*smoothstep(.3,.7,f);\n" +
    "c+=si*(sp*.7+rim*.55);\n" +
    "vec3 ir=.5+.5*cos(6.2831*(nor.x*1.6+nor.y*1.1+vec3(0.,.33,.67)));\n" +
    "c+=ir*rim*.22*vec3(.55,.7,1.);\n" +
    "vec3 lt=mix(vec3(.93,.92,.98),vec3(.62,.55,.96),smoothstep(.25,.75,f));\n" +
    "lt=mix(lt,vec3(1.),pow(env,3.)*.7)-rim*.18;\n" +
    "c=mix(c,lt,uL);\n" +
    "float vg=smoothstep(1.15,.25,length((uv-vec2(.5,.62))*vec2(1.,1.1)));\n" +
    "c=mix(mix(ink,vec3(.97,.96,1.),uL),c,mix(.35,1.,vg));\n" +
    "c*=mix(1.,.74,1.-uL*.6);float band=mix(.6,1.,smoothstep(0.,.26,abs(uv.y-.76)));float low=mix(.55,1.,smoothstep(.05,.5,uv.y));c*=mix(1.,band*low,1.-uL*.7);\n"+"c+=(h(gl_FragCoord.xy+uT)-.5)*.035;\n" +
    "o=vec4(c,1.);}";

  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
  var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  gl.useProgram(pr);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uRes = gl.getUniformLocation(pr, "uRes"), uT = gl.getUniformLocation(pr, "uT"), uM = gl.getUniformLocation(pr, "uM"), uL = gl.getUniformLocation(pr, "uL");

  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity 1.2s ease";
  host.appendChild(cv);

  var scale = COARSE ? 0.4 : 0.55, W = 0, H = 0, mx = .5, my = .5, tx = .5, ty = .5, running = false, vis = true, raf = 0, t0 = performance.now();
  function size() {
    var r = host.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width * scale)); H = Math.max(2, Math.round(r.height * scale));
    cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
  }
  function draw(now) {
    mx += (tx - mx) * .04; my += (ty - my) * .04;
    gl.uniform2f(uRes, W, H); gl.uniform1f(uT, REDUCE ? 14 : (now - t0) / 1000); gl.uniform2f(uM, mx, my);
    gl.uniform1f(uL, d.documentElement.getAttribute("data-theme") === "light" ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
  function start() { if (running || !vis || d.hidden || REDUCE) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  size(); draw(performance.now()); cv.style.opacity = "1"; host.classList.add("bg-live");
  addEventListener("resize", function () { size(); draw(performance.now()); });
  if (!COARSE) addEventListener("pointermove", function (e) { tx = e.clientX / innerWidth; ty = 1 - e.clientY / innerHeight; }, { passive: true });
  d.addEventListener("vk:theme", function () { draw(performance.now()); });
  if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; vis ? start() : stop(); }).observe(host);
  d.addEventListener("visibilitychange", function () { d.hidden ? stop() : start(); });
  start();
})();
