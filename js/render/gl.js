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
  const FS_MAIN = PREC + 'varying vec2 uv;uniform sampler2D uScene,uLight,uBloom;uniform vec2 uRes,uCam;uniform float uBloomOn;' +
    'float bayer(vec2 b){' +
    'vec4 r=b.y<.5?vec4(0.,8.,2.,10.):b.y<1.5?vec4(12.,4.,14.,6.):b.y<2.5?vec4(3.,11.,1.,9.):vec4(15.,7.,13.,5.);' +
    'float v=b.x<.5?r.x:b.x<1.5?r.y:b.x<2.5?r.z:r.w;return (v+.5)/16.;}' +
    'void main(){' +
    'vec2 px=floor(uv*uRes);vec2 c=(px+.5)/uRes;' +                 // scene + light sampled at the scene-pixel centre: identical look at any output size
    'vec3 s=texture2D(uScene,c).rgb;' +
    'vec3 l=texture2D(uLight,c).rgb*1.25;' +
    'float bay=bayer(mod(px+uCam,4.));' +
    'l=clamp(floor(l*9.+bay)/9.,0.,1.);' +
    'vec3 col=s*l;' +
    'if(uBloomOn>.5){vec3 b=texture2D(uBloom,uv).rgb;col+=.85*b*(1.-col);}' +
    'gl_FragColor=vec4(col,1.);}';

  function create(cv, VW, VH, LW, LH) {
    let gl = null;
    const attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
    try { gl = cv.getContext('webgl2', attrs) || cv.getContext('webgl', attrs); } catch (e) { gl = null; }
    if (!gl) return null;
    if (cv._itComp) cv._itComp.release();          // a new session reuses the canvas/context: free the previous resources first
    const C = { ok: false, canvas: cv, kind: (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) ? 'webgl2' : 'webgl', frames: 0, err: '' };
    const light8 = new Uint8ClampedArray(LW * LH * 4);
    let progMain, progH, progV, vbo, texScene, texLight, texGlow, texA, texB, fboA, fboB, uM, uH, uV, curW = 0, curH = 0;

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
      bindTex(0, texScene = tex(VW, VH, gl.NEAREST));
      bindTex(1, texLight = tex(LW, LH, gl.LINEAR));
      bindTex(2, texGlow = tex(VW, VH, gl.NEAREST));
      bindTex(3, texA = tex(VW, VH, gl.LINEAR));
      texB = tex(VW, VH, gl.LINEAR);
      fboA = fbo(texA); fboB = fbo(texB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      curW = curH = 0;
      if (gl.getError() !== gl.NO_ERROR) throw new Error('gl error at init');
    }
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
      } catch (e) { /* context already gone */ }
      if (cv._itComp === C) cv._itComp = null;
    };
    cv._itComp = C;

    function size() {
      let w = want.w || VW * 2, h = want.h || VH * 2;
      if (w > MAXW) { h = Math.round(h * MAXW / w); w = MAXW; }
      if (w !== curW || h !== curH) { cv.width = curW = w; cv.height = curH = h; }
    }

    // scene: 2D canvas (unlit, opaque); lightmap: Light instance (already folded); glowCv: additive glow canvas
    C.present = function (scene, lightmap, glowCv, camX, camY, bloom) {
      if (!C.ok) return false;
      try {
        size();
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        bindTex(0, texScene); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, scene);
        lightmap.pack(light8);
        bindTex(1, texLight); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LW, LH, gl.RGBA, gl.UNSIGNED_BYTE, light8);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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
        gl.useProgram(progMain);
        gl.uniform1f(uM.flip, 1); gl.uniform1i(uM.scene, 0); gl.uniform1i(uM.light, 1); gl.uniform1i(uM.bloom, 2);
        gl.uniform2f(uM.res, VW, VH); gl.uniform2f(uM.cam, Math.floor(camX) & 3, Math.floor(camY) & 3); gl.uniform1f(uM.on, bloom ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (C.frames++ < 3 && gl.getError() !== gl.NO_ERROR) throw new Error('gl error in present');
        return true;
      } catch (e) { fail(e); return false; }
    };
    return C;
  }

  IT.GL = { create, setSize, GW };
})(typeof window !== 'undefined' ? window : globalThis);
