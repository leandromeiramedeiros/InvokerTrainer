// WebGL compositor: lit scene (bilinear light grid + 9-level Bayer quantise + multiply) and the glow-canvas bloom,
// output at stage resolution. IT.GL.create returns null (or comp.ok turns false) on any failure -> caller keeps the 2D path.
// GLSL ES 1.00 only, so the same shaders run on WebGL2 and WebGL1 contexts.
(function (G) {
  'use strict';
  const IT = G.IT = G.IT || {};
  const MAXW = 1920;
  const want = { w: 0, h: 0 };
  function setSize(w, h) { want.w = w | 0; want.h = h | 0; }

  // gaussian sigma 1.2 internal px (matches the old CSS blur), radius 4, normalised
  const GW = (() => { const w = []; let s = 0; for (let k = 0; k <= 4; k++) { w[k] = Math.exp(-k * k / (2 * 1.44)); s += k ? 2 * w[k] : w[k]; } return w.map(v => v / s); })();
  const f = v => v.toFixed(6);

  const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const VS = 'attribute vec2 p;varying vec2 uv;uniform float uFlip;' +
    'void main(){uv=vec2(p.x*.5+.5,mix(p.y*.5+.5,.5-p.y*.5,uFlip));gl_Position=vec4(p,0.,1.);}';
  const TAPS = [1, 2, 3, 4].map(k => 'c+=(texture2D(t,uv+d*' + k + '.)+texture2D(t,uv-d*' + k + '.))*' + f(GW[k]) + ';').join('');
  const FS_BLUR_H = PREC + 'varying vec2 uv;uniform sampler2D t;uniform vec2 d;void main(){' +
    'vec4 c=texture2D(t,uv)*' + f(GW[0]) + ';' + TAPS + 'gl_FragColor=c;}';
  // vertical blur + CSS brightness(1.8) saturate(1.2) on the premultiplied value (unpremult clamp == clamp to alpha)
  const FS_BLUR_V = PREC + 'varying vec2 uv;uniform sampler2D t;uniform vec2 d;void main(){' +
    'vec4 c=texture2D(t,uv)*' + f(GW[0]) + ';' + TAPS +
    'vec3 p=min(c.rgb*1.8,vec3(c.a));float l=dot(p,vec3(.2126,.7152,.0722));p=clamp(mix(vec3(l),p,1.2),0.,c.a);gl_FragColor=vec4(p,1.);}';
  const BAYER = 'float bayer(vec2 b){' +
    'vec4 r=b.y<.5?vec4(0.,8.,2.,10.):b.y<1.5?vec4(12.,4.,14.,6.):b.y<2.5?vec4(3.,11.,1.,9.):vec4(15.,7.,13.,5.);' +
    'float v=b.x<.5?r.x:b.x<1.5?r.y:b.x<2.5?r.z:r.w;return (v+.5)/16.;}';
  const FS_MAIN = PREC + 'varying vec2 uv;uniform sampler2D uScene,uLight,uBloom;uniform vec2 uRes,uCam;uniform float uBloomOn;' + BAYER +
    'void main(){' +
    'vec2 px=floor(uv*uRes);vec2 c=(px+.5)/uRes;' +                 // scene + light sampled at the scene-pixel centre: identical look at any output size
    'vec3 s=texture2D(uScene,c).rgb;' +
    'vec3 l=texture2D(uLight,c).rgb*1.25;' +
    'float bay=bayer(mod(px+uCam,4.));' +
    'l=clamp(floor(l*9.+bay)/9.,0.,1.);' +
    'vec3 col=s*l;' +
    'if(uBloomOn>.5){vec3 b=texture2D(uBloom,uv).rgb;col+=.85*b*(1.-col);}' +
    'gl_FragColor=vec4(col,1.);}';

  // ---- v6 #76 L3: dynamic lighting (docs/LIGHTING-v6.md). Off = FS_MAIN untouched (bit-identical); on = light pass(es) into view-sized
  // (Low: half-res) RGBA8 buffers, then FS_MAIN_LIT adds them to the light grid before the same Bayer quantise.
  // G-buffer texel (render.js, opaque canvas): R,G = normal xy (n*.5+.5, y down), B = height6 << 2 | material2, A = 255.
  const MAXL = 32, HZ = 24, ZMIN = 10;   // HZ: px of height for G-buffer h = 1; ZMIN: lights sit >= 10 px above the ground (no grazing)
  const LEVELS = {
    // shadows: lights per caster for silhouette shadows (0 = none); march: 6-step height-channel ray-march toward the 2 strongest lights
    // casters / trees: per-frame shadow-draw budget (all casters / of which trees), read by render.js drawShadows
    off:    { lights: 0,  half: false, rim: false, glow: false, shadows: 0, march: false, casters: 0,   trees: 0 },
    low:    { lights: 8,  half: true,  rim: false, glow: false, shadows: 0, march: false, casters: 0,   trees: 0 },
    medium: { lights: 16, half: false, rim: true,  glow: false, shadows: 1, march: false, casters: 60,  trees: 20 },
    high:   { lights: 32, half: false, rim: true,  glow: true,  shadows: 2, march: true,  casters: 120, trees: 40 },
  };
  // L4 shadows: silhouette shadow buffer (alpha = shadowed) darkens the diffuse / glow on ground pixels only; the march walks <= MARCH_RANGE px toward a light
  const SHK = 0.85, MARCH_STEPS = 6, MARCH_RANGE = 40, MARCH_LIGHTS = 2;
  const RIMK = 0.9, GLOWK = 0.35;
  // art rule: the dynamic term tops out at +15 % by day, +60 % at night (night = Light.night, already smoothstepped)
  const lightCap = night => { const n = night > 0 ? Math.min(1, night) : 0; return 0.15 + 0.45 * n; };
  // G-buffer B channel: height 0..1 (6 bits) + material 0..3
  const packB = (h, mat) => ((Math.max(0, Math.min(63, Math.round(h * 63))) << 2) | (mat & 3));
  // IT.Lights.uniforms(world cam) -> screen px in place: pos / P (z >= ZMIN px), radius / P. Returns u.
  function toScreen(u, P) {
    for (let i = 0; i < u.count; i++) {
      u.pos[i * 3] /= P; u.pos[i * 3 + 1] /= P; u.pos[i * 3 + 2] = Math.max(ZMIN, u.pos[i * 3 + 2] / P);
      u.rad[i * 2] /= P;
    }
    return u;
  }
  // uMode 0: diffuse sum (multiplies albedo), 1: rim + glow (additive). Output = cap * (1 - e^-2x) * vision (fog stays unlit).
  const MARCH = 'float march(vec3 P,vec3 Lp){vec2 dv=Lp.xy-P.xy;float dd=length(dv);if(dd<1.)return 0.;vec2 dir=dv/dd;float rng=min(dd,' + MARCH_RANGE + '.);float occ=0.;' +
    'for(int k=0;k<' + MARCH_STEPS + ';k++){float s=rng*(float(k)+1.)/' + MARCH_STEPS + '.;' +
    'vec4 gs=texture2D(uG,(P.xy+dir*s)/uRes);float bs=floor(gs.b*255.+.5);float ms=mod(bs,4.);' +
    'float hs=floor(bs/4.)/63.*' + HZ + '.;float zr=P.z+(Lp.z-P.z)*s/dd;' +       // sample height above the ray height = occluded
    'occ=max(occ,(step(ms,.5)+step(1.5,ms)*step(ms,2.5))*clamp((hs-zr)/3.,0.,1.));}return occ;}';
  const FS_LIT = PREC + 'varying vec2 uv;uniform sampler2D uG,uLight,uShadow;uniform vec2 uRes;uniform float uShOn,uMarch;' + MARCH +
    'uniform vec3 uLP[' + MAXL + '],uLC[' + MAXL + '];uniform vec2 uLR[' + MAXL + '];uniform int uN;uniform float uMode,uRim,uGlow,uCap;' +
    'void main(){' +
    'vec2 px=floor(uv*uRes)+.5;vec4 g=texture2D(uG,uv);' +
    'float b=floor(g.b*255.+.5);float mat=mod(b,4.);float h=floor(b/4.)/63.;' +
    'vec2 nx=g.rg*2.-1.;vec3 N=vec3(nx,sqrt(max(0.,1.-dot(nx,nx))));vec3 P=vec3(px,h*' + HZ + '.);' +
    'float rk=uRim*pow(1.-N.z,3.)*step(.5,mat)*step(mat,2.5);' +       // rim only on units / trees (material 1-2)
    'vec3 dif=vec3(0.),add=vec3(0.);' +
    'for(int i=0;i<' + MAXL + ';i++){if(i>=uN)break;' +
    'vec3 D=uLP[i]-P;float d=length(D),r=uLR[i].x;float a=clamp(1.-d/r,0.,1.);a=a*a*uLR[i].y;' +
    'float nl=max(0.,dot(N,D/max(d,.001)));' +
    'if(uMarch>.5&&i<' + MARCH_LIGHTS + '&&mat<.5)nl*=1.-' + f(SHK) + '*march(P,uLP[i]);' +   // ground only: casters are not self-shadowed
    'dif+=uLC[i]*(a*nl);add+=uLC[i]*(a*nl*rk);' +
    'if(uGlow>.5){float s=clamp(1.-length(D.xy)/(r*.6),0.,1.);add+=uLC[i]*(s*s*uLR[i].y*' + f(GLOWK) + ');}' +
    '}' +
    'if(mat>2.5)dif=vec3(0.);' +                                        // emissive FX: own colour, no diffuse
    'float sh=uShOn*' + f(SHK) + '*clamp(texture2D(uShadow,uv).a,0.,1.)*step(mat,.5);dif*=1.-sh;add*=1.-sh;' +   // silhouette shadows: ground only (units / trees keep their light)
    'vec3 o=uMode<.5?dif:add;' +
    'gl_FragColor=vec4(uCap*(1.-exp(-2.*o))*texture2D(uLight,uv).a,1.);}';
  const FS_MAIN_LIT = PREC + 'varying vec2 uv;uniform sampler2D uScene,uLight,uBloom,uDyn,uAdd;uniform vec2 uRes,uCam;uniform float uBloomOn,uAddOn,uCap;' + BAYER +
    'void main(){' +
    'vec2 px=floor(uv*uRes);vec2 c=(px+.5)/uRes;' +
    'vec3 s=texture2D(uScene,c).rgb;' +
    'vec3 l=texture2D(uLight,c).rgb*1.25+texture2D(uDyn,c).rgb;' +     // ambient (day/night) + 2D cell lights + fog, plus the dynamic diffuse
    'float bay=bayer(mod(px+uCam,4.));' +
    'l=clamp(floor(l*9.+bay)/9.,0.,1.);' +
    'vec3 col=s*l;' +
    'if(uAddOn>.5)col=min(col+floor(texture2D(uAdd,c).rgb/uCap*4.+bay)/4.*uCap,1.);' +   // rim + glow: 4 shade steps
    'if(uBloomOn>.5){vec3 b=texture2D(uBloom,uv).rgb;col+=.85*b*(1.-col);}' +
    'gl_FragColor=vec4(col,1.);}';

  function create(cv, VW, VH, LW, LH) {
    let gl = null;
    const attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
    try { gl = cv.getContext('webgl2', attrs) || cv.getContext('webgl', attrs); } catch (e) { gl = null; }
    if (!gl) return null;
    if (cv._itComp) cv._itComp.release();          // a new session reuses the canvas/context: free the previous resources first
    const C = { ok: false, canvas: cv, kind: (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) ? 'webgl2' : 'webgl', frames: 0, err: '' };
    let light8 = new Uint8ClampedArray(LW * LH * 4);
    let progMain, progH, progV, vbo, texScene, texLight, texGlow, texA, texB, texN = [null, null], normSrc = [null, null], fboA, fboB, uM, uH, uV, curW = 0, curH = 0;
    // L3 lighting state: programs built lazily on the first non-off level; buffers follow the view size and the level's half-res flag
    let level = 'off', progLit = null, progML = null, uL = null, uML = null, texSh = null, texG = null, texDyn = null, texAdd = null, fboDyn = null, fboAdd = null, dynW = 0, dynH = 0, gW = 0, gH = 0;

    function shader(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    }
    function program(fs) {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      return p;
    }
    function tex(w, h, filter) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    }
    function fbo(t) {
      const b = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, b);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
      return b;
    }
    function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
    function build() {
      progMain = program(FS_MAIN); progH = program(FS_BLUR_H); progV = program(FS_BLUR_V);
      const loc = (p, n) => gl.getUniformLocation(p, n);
      uM = { flip: loc(progMain, 'uFlip'), scene: loc(progMain, 'uScene'), light: loc(progMain, 'uLight'), bloom: loc(progMain, 'uBloom'), res: loc(progMain, 'uRes'), cam: loc(progMain, 'uCam'), on: loc(progMain, 'uBloomOn') };
      uH = { flip: loc(progH, 'uFlip'), t: loc(progH, 't'), d: loc(progH, 'd') };
      uV = { flip: loc(progV, 'uFlip'), t: loc(progV, 't'), d: loc(progV, 'd') };
      vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DITHER);
      progLit = progML = texSh = texG = texDyn = texAdd = fboDyn = fboAdd = null; dynW = dynH = gW = gH = 0;   // (re)built lazily by litReady()
      textures();
      for (let k = 0; k < 2; k++) if (normSrc[k]) upNormals(k);   // context restored: re-upload the G-buffer inputs
      if (gl.getError() !== gl.NO_ERROR) throw new Error('gl error at init');
    }
    function textures() {   // view-sized targets (rebuilt on zoom)
      bindTex(0, texScene = tex(VW, VH, gl.NEAREST));
      bindTex(1, texLight = tex(LW, LH, gl.LINEAR));
      bindTex(2, texGlow = tex(VW, VH, gl.NEAREST));
      bindTex(3, texA = tex(VW, VH, gl.LINEAR));
      texB = tex(VW, VH, gl.LINEAR);
      fboA = fbo(texA); fboB = fbo(texB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      curW = curH = 0;
      freeLit();
    }
    // v6 #76 L2: normal/height G-buffer inputs, units 4 (terrain) / 5 (sprite atlas). Raw RGBA (alpha is material: never premultiplied); L3 samples them.
    function upNormals(k) {
      const n = normSrc[k], big = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (!n || n.w > big || n.h > big) return false;
      if (texN[k]) gl.deleteTexture(texN[k]);
      gl.activeTexture(gl.TEXTURE0 + 4 + k);
      const t = texN[k] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (n.px) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n.w, n.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, n.px);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, n.src);
      gl.activeTexture(gl.TEXTURE0);
      return true;
    }
    // src: IT.Normals result ({data,w,h} / forSheet / terrain), ImageData, a Uint8(Clamped)Array + w,h, a canvas (debug: premultiplied), or null to free.
    // which: 'terrain' (default, unit 4) | 'sprites' (unit 5). Returns false when GL is off or the image is too large.
    C.setNormals = function (src, w, h, which) {
      if (!C.ok) return false;
      const k = which === 'sprites' ? 1 : 0;
      try {
        if (!src) { if (texN[k]) gl.deleteTexture(texN[k]); texN[k] = null; normSrc[k] = null; return true; }
        const raw = src.data && (src.w || src.width) ? src.data : (src.length != null && w ? src : null);
        normSrc[k] = raw ? { px: raw instanceof Uint8Array ? raw : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), w: src.w || src.width || w, h: src.h || src.height || h } : { src, w: src.width, h: src.height };
        return upNormals(k);
      } catch (e) { normSrc[k] = null; return false; }
    };
    C.hasNormals = which => !!texN[which === 'sprites' ? 1 : 0];

    // ---- L3 lighting: units 6 (G-buffer), 7 (diffuse buffer); the rim/glow buffer is bound on unit 3 (blur scratch) for the final pass only
    function freeLit() {
      try { [texSh, texG, texDyn, texAdd].forEach(t => t && gl.deleteTexture(t)); [fboDyn, fboAdd].forEach(b => b && gl.deleteFramebuffer(b)); } catch (e) { /* lost */ }
      texSh = texG = texDyn = texAdd = fboDyn = fboAdd = null; dynW = dynH = gW = gH = 0;
    }
    function litReady() {
      const L = LEVELS[level];
      if (!progLit) {
        progLit = program(FS_LIT); progML = program(FS_MAIN_LIT);
        const loc = (p, n) => gl.getUniformLocation(p, n);
        uL = { flip: loc(progLit, 'uFlip'), g: loc(progLit, 'uG'), light: loc(progLit, 'uLight'), res: loc(progLit, 'uRes'), lp: loc(progLit, 'uLP'), lc: loc(progLit, 'uLC'), lr: loc(progLit, 'uLR'),
          n: loc(progLit, 'uN'), shadow: loc(progLit, 'uShadow'), shOn: loc(progLit, 'uShOn'), march: loc(progLit, 'uMarch'), mode: loc(progLit, 'uMode'), rim: loc(progLit, 'uRim'), glow: loc(progLit, 'uGlow'), cap: loc(progLit, 'uCap') };
        uML = { flip: loc(progML, 'uFlip'), scene: loc(progML, 'uScene'), light: loc(progML, 'uLight'), bloom: loc(progML, 'uBloom'), dyn: loc(progML, 'uDyn'), add: loc(progML, 'uAdd'),
          res: loc(progML, 'uRes'), cam: loc(progML, 'uCam'), on: loc(progML, 'uBloomOn'), addOn: loc(progML, 'uAddOn'), cap: loc(progML, 'uCap') };
      }
      const w = L.half ? Math.ceil(VW / 2) : VW, h = L.half ? Math.ceil(VH / 2) : VH;
      if (w !== dynW || h !== dynH || gW !== VW || gH !== VH) {
        freeLit();
        bindTex(6, texG = tex(VW, VH, gl.NEAREST)); gW = VW; gH = VH;
        texSh = tex(VW, VH, gl.NEAREST);
        bindTex(7, texDyn = tex(w, h, gl.LINEAR)); fboDyn = fbo(texDyn);
        texAdd = tex(w, h, gl.LINEAR); fboAdd = fbo(texAdd);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        dynW = w; dynH = h;
      }
    }
    // 'off' | 'low' | 'medium' | 'high' (LEVELS). Drives IT.Lights.enabled; a shader that fails to build drops back to 'off'. Returns the level in force.
    C.setLighting = function (lv) {
      lv = LEVELS[lv] ? lv : 'off';
      level = lv;
      if (lv !== 'off' && C.ok) {
        try { litReady(); } catch (e) { try { console.warn('[GL] lighting disabled:', (e && e.message) || e); } catch (x) { /* ignore */ } level = 'off'; progLit = progML = null; freeLit(); }
      }
      if (level === 'off') freeLit();
      C.lighting = level;
      if (IT.Lights) IT.Lights.enabled = level !== 'off';
      IT.GL.lightingLevel = level;
      return level;
    };
    C.lighting = 'off';
    C.levelInfo = () => LEVELS[level];

    function fail(e) { C.ok = false; C.err = String((e && e.message) || e); try { console.warn('[GL] disabled:', C.err); } catch (x) { /* ignore */ } }
    try { build(); C.ok = true; } catch (e) { fail(e); return null; }

    const onLost = ev => { ev.preventDefault(); C.ok = false; C.err = 'context lost'; };
    const onRestored = () => { try { build(); C.ok = true; C.err = ''; C.frames = 0; } catch (e) { fail(e); } };
    cv.addEventListener('webglcontextlost', onLost); cv.addEventListener('webglcontextrestored', onRestored);
    C.release = function () {
      C.ok = false; cv.removeEventListener('webglcontextlost', onLost); cv.removeEventListener('webglcontextrestored', onRestored);
      try {
        [progMain, progH, progV].forEach(p => gl.deleteProgram(p)); [texScene, texLight, texGlow, texA, texB].forEach(t => gl.deleteTexture(t));
        [fboA, fboB].forEach(b => gl.deleteFramebuffer(b)); gl.deleteBuffer(vbo);
        [progLit, progML].forEach(p => p && gl.deleteProgram(p)); freeLit();
      } catch (e) { /* context already gone */ }
      if (cv._itComp === C) cv._itComp = null;
    };
    cv._itComp = C; current = C;
    C.resize = function (w, h, lw, lh) {
      VW = w; VH = h; LW = lw; LH = lh; light8 = new Uint8ClampedArray(LW * LH * 4);
      if (!C.ok) return;
      try {
        [texScene, texLight, texGlow, texA, texB].forEach(t => gl.deleteTexture(t)); [fboA, fboB].forEach(b => gl.deleteFramebuffer(b));
        textures();
      } catch (e) { fail(e); }
    };

    function size() {
      let w = want.w || VW * 2, h = want.h || VH * 2;
      if (w > MAXW) { h = Math.round(h * MAXW / w); w = MAXW; }
      if (w !== curW || h !== curH) { cv.width = curW = w; cv.height = curH = h; }
    }

    // L3 light pass(es): G-buffer -> diffuse buffer (+ rim/glow buffer on Medium/High). lit = { gbuf: opaque canvas VWxVH, u: screen-px uniforms, night }
    function lightPass(lit, L) {
      litReady();
      bindTex(6, texG); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, lit.gbuf);
      const u = lit.u, cap = lightCap(lit.night), add = L.rim || L.glow;
      gl.viewport(0, 0, dynW, dynH);
      gl.useProgram(progLit);
      gl.uniform1f(uL.flip, 0); gl.uniform1i(uL.g, 6); gl.uniform1i(uL.light, 1); gl.uniform2f(uL.res, VW, VH);
      gl.uniform3fv(uL.lp, u.pos); gl.uniform3fv(uL.lc, u.col); gl.uniform2fv(uL.lr, u.rad); gl.uniform1i(uL.n, Math.min(u.count, L.lights));
      // L4: shadow canvas (alpha) on unit 3 (blur scratch, rebound before use). Always bound: a stale texAdd there would feed back into fboAdd.
      const shOn = !!(lit.shadow && L.shadows);
      bindTex(3, texSh);
      if (shOn) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, lit.shadow);
      gl.uniform1i(uL.shadow, 3); gl.uniform1f(uL.shOn, shOn ? 1 : 0); gl.uniform1f(uL.march, L.march ? 1 : 0);
      gl.uniform1f(uL.rim, L.rim ? RIMK : 0); gl.uniform1f(uL.glow, L.glow ? 1 : 0); gl.uniform1f(uL.cap, cap);
      gl.uniform1f(uL.mode, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, fboDyn); gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (add) { gl.uniform1f(uL.mode, 1); gl.bindFramebuffer(gl.FRAMEBUFFER, fboAdd); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      return { cap, add };
    }

    // scene: 2D canvas (unlit, opaque); lightmap: Light instance (already folded); glowCv: additive glow canvas;
    // lit (L3, optional): { gbuf, u, night, vis, shadow (L4: canvas, alpha = shadowed, or null) } -> dynamic lighting when the level is not 'off'
    C.present = function (scene, lightmap, glowCv, camX, camY, bloom, lit) {
      if (!C.ok) return false;
      try {
        size();
        const L = lit && level !== 'off' && lit.gbuf && lit.u ? LEVELS[level] : null;
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        bindTex(0, texScene); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, scene);
        lightmap.pack(light8);
        if (L && lit.vis) for (let i = 0, n = Math.min(lit.vis.length, LW * LH); i < n; i++) light8[i * 4 + 3] = lit.vis[i];   // vision mask: fog stays unlit
        bindTex(1, texLight); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LW, LH, gl.RGBA, gl.UNSIGNED_BYTE, light8);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        let lp = null;
        if (L) try { lp = lightPass(lit, L); } catch (e) { try { console.warn('[GL] lighting off:', (e && e.message) || e); } catch (x) { /* ignore */ } C.setLighting('off'); }
        if (bloom) {
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);      // keep the canvas's premultiplied values
          bindTex(2, texGlow); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, glowCv);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.viewport(0, 0, VW, VH);
          gl.useProgram(progH); gl.uniform1f(uH.flip, 0); gl.uniform1i(uH.t, 2); gl.uniform2f(uH.d, 1 / VW, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fboA); gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.useProgram(progV); gl.uniform1f(uV.flip, 0); gl.uniform1i(uV.t, 3); gl.uniform2f(uV.d, 0, 1 / VH);
          bindTex(3, texA);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fboB); gl.drawArrays(gl.TRIANGLES, 0, 3);
          bindTex(2, texB);                                              // bloom result for the main pass
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, curW, curH);
        if (lp) {
          gl.useProgram(progML);
          bindTex(7, texDyn); bindTex(3, texAdd);
          gl.uniform1f(uML.flip, 1); gl.uniform1i(uML.scene, 0); gl.uniform1i(uML.light, 1); gl.uniform1i(uML.bloom, 2); gl.uniform1i(uML.dyn, 7); gl.uniform1i(uML.add, 3);
          gl.uniform2f(uML.res, VW, VH); gl.uniform2f(uML.cam, Math.floor(camX) & 3, Math.floor(camY) & 3); gl.uniform1f(uML.on, bloom ? 1 : 0);
          gl.uniform1f(uML.addOn, lp.add ? 1 : 0); gl.uniform1f(uML.cap, lp.cap);
        } else {
          gl.useProgram(progMain);
          gl.uniform1f(uM.flip, 1); gl.uniform1i(uM.scene, 0); gl.uniform1i(uM.light, 1); gl.uniform1i(uM.bloom, 2);
          gl.uniform2f(uM.res, VW, VH); gl.uniform2f(uM.cam, Math.floor(camX) & 3, Math.floor(camY) & 3); gl.uniform1f(uM.on, bloom ? 1 : 0);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (C.frames++ < 3 && gl.getError() !== gl.NO_ERROR) throw new Error('gl error in present');
        return true;
      } catch (e) { fail(e); return false; }
    };
    return C;
  }

  // dev hook (L5 wires the setting): IT.GL.setLighting('high') from the console; level sticks for the next compositor too
  let current = null, wantLevel = 'off';
  function setLighting(lv) {
    wantLevel = LEVELS[lv] ? lv : 'off';
    if (current && current.ok) return current.setLighting(wantLevel);
    if (IT.Lights) IT.Lights.enabled = false;
    IT.GL.lightingLevel = 'off';
    return 'off';
  }
  IT.GL = {
    create(cv, VW, VH, LW, LH) { const C = create(cv, VW, VH, LW, LH); if (C) C.setLighting(wantLevel); return C; },
    setSize, GW, LEVELS, SHK, MARCH_STEPS, MARCH_RANGE, MAXL, HZ, ZMIN, RIMK, GLOWK, lightCap, packB, toScreen, setLighting, lightingLevel: 'off',
    SHADERS: { FS_MAIN, FS_LIT, FS_MAIN_LIT, FS_BLUR_H, FS_BLUR_V, VS },
  };
})(typeof window !== 'undefined' ? window : globalThis);
