/* Real-time GPU fluid simulation (WebGL).
   Port of the well-known MIT-licensed WebGL fluid simulation (Pavel Dobryakov),
   the same technique wrapped by react-fluid-distortion.
   Exposes window.JFluid.start(canvas, opts) -> { setColors, resize, splat, destroy } */
(function () {
  'use strict';

  function start(canvas, opts) {
    opts = opts || {};
    var config = {
      SIM_RESOLUTION: 128,
      DYE_RESOLUTION: 1024,
      DENSITY_DISSIPATION: opts.densityDissipation != null ? opts.densityDissipation : 1.4,
      VELOCITY_DISSIPATION: opts.velocityDissipation != null ? opts.velocityDissipation : 0.25,
      PRESSURE: 0.8,
      PRESSURE_ITERATIONS: 20,
      CURL: opts.curl != null ? opts.curl : 30,
      SPLAT_RADIUS: opts.splatRadius != null ? opts.splatRadius : 0.2,
      SPLAT_FORCE: opts.splatForce != null ? opts.splatForce : 6000
    };

    var colorCfg = {
      hueBase: opts.hueBase != null ? opts.hueBase : 0.72,
      hueRange: opts.hueRange != null ? opts.hueRange : 0.13,
      sat: opts.sat != null ? opts.sat : 1.0,
      val: opts.val != null ? opts.val : 1.0,
      gain: opts.gain != null ? opts.gain : 0.16
    };

    var target = opts.target || canvas;

    var ctx = getWebGLContext(canvas);
    var gl = ctx.gl, ext = ctx.ext;
    if (!ext.supportLinearFiltering) {
      config.DYE_RESOLUTION = 512;
    }

    // ---------- shaders ----------
    var baseVertexShader = compileShader(gl.VERTEX_SHADER, [
      'precision highp float;',
      'attribute vec2 aPosition;',
      'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
      'uniform vec2 texelSize;',
      'void main () {',
      '  vUv = aPosition * 0.5 + 0.5;',
      '  vL = vUv - vec2(texelSize.x, 0.0);',
      '  vR = vUv + vec2(texelSize.x, 0.0);',
      '  vT = vUv + vec2(0.0, texelSize.y);',
      '  vB = vUv - vec2(0.0, texelSize.y);',
      '  gl_Position = vec4(aPosition, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var copyShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; uniform sampler2D uTexture;',
      'void main () { gl_FragColor = texture2D(uTexture, vUv); }'
    ].join('\n'));

    var clearShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;',
      'void main () { gl_FragColor = value * texture2D(uTexture, vUv); }'
    ].join('\n'));

    var splatShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio;',
      'uniform vec3 color; uniform vec2 point; uniform float radius;',
      'void main () {',
      '  vec2 p = vUv - point.xy; p.x *= aspectRatio;',
      '  vec3 splat = exp(-dot(p, p) / radius) * color;',
      '  vec3 base = texture2D(uTarget, vUv).xyz;',
      '  gl_FragColor = vec4(base + splat, 1.0);',
      '}'
    ].join('\n'));

    var advectionShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;',
      'uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;',
      'vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {',
      '  vec2 st = uv / tsize - 0.5;',
      '  vec2 iuv = floor(st); vec2 fuv = fract(st);',
      '  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);',
      '  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);',
      '  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);',
      '  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);',
      '  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);',
      '}',
      'void main () {',
      ext.supportLinearFiltering
        ? '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;\n  vec4 result = texture2D(uSource, coord);'
        : '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;\n  vec4 result = bilerp(uSource, coord, dyeTexelSize);',
      '  float decay = 1.0 + dissipation * dt;',
      '  gl_FragColor = result / decay;',
      '}'
    ].join('\n'));

    var divergenceShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;',
      'uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uVelocity, vL).x;',
      '  float R = texture2D(uVelocity, vR).x;',
      '  float T = texture2D(uVelocity, vT).y;',
      '  float B = texture2D(uVelocity, vB).y;',
      '  vec2 C = texture2D(uVelocity, vUv).xy;',
      '  if (vL.x < 0.0) { L = -C.x; }',
      '  if (vR.x > 1.0) { R = -C.x; }',
      '  if (vT.y > 1.0) { T = -C.y; }',
      '  if (vB.y < 0.0) { B = -C.y; }',
      '  float div = 0.5 * (R - L + T - B);',
      '  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var curlShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;',
      'uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uVelocity, vL).y;',
      '  float R = texture2D(uVelocity, vR).y;',
      '  float T = texture2D(uVelocity, vT).x;',
      '  float B = texture2D(uVelocity, vB).x;',
      '  float vorticity = R - L - T + B;',
      '  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var vorticityShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;',
      'uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;',
      'void main () {',
      '  float L = texture2D(uCurl, vL).x;',
      '  float R = texture2D(uCurl, vR).x;',
      '  float T = texture2D(uCurl, vT).x;',
      '  float B = texture2D(uCurl, vB).x;',
      '  float C = texture2D(uCurl, vUv).x;',
      '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
      '  force /= length(force) + 0.0001;',
      '  force *= curl * C;',
      '  force.y *= -1.0;',
      '  vec2 vel = texture2D(uVelocity, vUv).xy;',
      '  vel += force * dt;',
      '  vel = min(max(vel, -1000.0), 1000.0);',
      '  gl_FragColor = vec4(vel, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var pressureShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;',
      'uniform sampler2D uPressure; uniform sampler2D uDivergence;',
      'void main () {',
      '  float L = texture2D(uPressure, vL).x;',
      '  float R = texture2D(uPressure, vR).x;',
      '  float T = texture2D(uPressure, vT).x;',
      '  float B = texture2D(uPressure, vB).x;',
      '  float divergence = texture2D(uDivergence, vUv).x;',
      '  float pressure = (L + R + B + T - divergence) * 0.25;',
      '  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision mediump float; precision mediump sampler2D;',
      'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;',
      'uniform sampler2D uPressure; uniform sampler2D uVelocity;',
      'void main () {',
      '  float L = texture2D(uPressure, vL).x;',
      '  float R = texture2D(uPressure, vR).x;',
      '  float T = texture2D(uPressure, vT).x;',
      '  float B = texture2D(uPressure, vB).x;',
      '  vec2 velocity = texture2D(uVelocity, vUv).xy;',
      '  velocity.xy -= vec2(R - L, T - B);',
      '  gl_FragColor = vec4(velocity, 0.0, 1.0);',
      '}'
    ].join('\n'));

    var displayShader = compileShader(gl.FRAGMENT_SHADER, [
      'precision highp float; precision highp sampler2D;',
      'varying vec2 vUv; uniform sampler2D uTexture;',
      'void main () {',
      '  vec3 c = texture2D(uTexture, vUv).rgb;',
      '  float a = max(c.r, max(c.g, c.b));',
      '  gl_FragColor = vec4(c, a);',
      '}'
    ].join('\n'));

    // ---------- programs ----------
    var copyProgram = new Program(copyShader);
    var clearProgram = new Program(clearShader);
    var splatProgram = new Program(splatShader);
    var advectionProgram = new Program(advectionShader);
    var divergenceProgram = new Program(divergenceShader);
    var curlProgram = new Program(curlShader);
    var vorticityProgram = new Program(vorticityShader);
    var pressureProgram = new Program(pressureShader);
    var gradienSubtractProgram = new Program(gradientSubtractShader);
    var displayProgram = new Program(displayShader);

    var blit = (function () {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      return function (target, clear) {
        if (!target) {
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } else {
          gl.viewport(0, 0, target.width, target.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      };
    })();

    var dye, velocity, divergenceFBO, curlFBO, pressure;

    function initFramebuffers() {
      var simRes = getResolution(config.SIM_RESOLUTION);
      var dyeRes = getResolution(config.DYE_RESOLUTION);
      var texType = ext.halfFloatTexType;
      var rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
      var filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      gl.disable(gl.BLEND);

      dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
      divergenceFBO = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      curlFBO = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    function createFBO(w, h, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0);
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      var texelSizeX = 1.0 / w, texelSizeY = 1.0 / h;
      return {
        texture: texture, fbo: fbo, width: w, height: h,
        texelSizeX: texelSizeX, texelSizeY: texelSizeY,
        attach: function (id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        }
      };
    }

    function createDoubleFBO(w, h, internalFormat, format, type, param) {
      var fbo1 = createFBO(w, h, internalFormat, format, type, param);
      var fbo2 = createFBO(w, h, internalFormat, format, type, param);
      return {
        width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
        get read() { return fbo1; }, set read(v) { fbo1 = v; },
        get write() { return fbo2; }, set write(v) { fbo2 = v; },
        swap: function () { var t = fbo1; fbo1 = fbo2; fbo2 = t; }
      };
    }

    resizeCanvas();
    initFramebuffers();

    // ---------- pointers ----------
    function Pointer() {
      this.id = -1; this.texcoordX = 0; this.texcoordY = 0;
      this.prevTexcoordX = 0; this.prevTexcoordY = 0;
      this.deltaX = 0; this.deltaY = 0; this.down = false; this.moved = false;
      this.color = [0.1, 0.05, 0.2];
    }
    var pointers = [new Pointer()];

    function correctDeltaX(d) { var ar = canvas.width / canvas.height; if (ar < 1) d *= ar; return d; }
    function correctDeltaY(d) { var ar = canvas.width / canvas.height; if (ar > 1) d /= ar; return d; }

    function updatePointerMoveData(pointer, posX, posY) {
      pointer.prevTexcoordX = pointer.texcoordX;
      pointer.prevTexcoordY = pointer.texcoordY;
      pointer.texcoordX = posX / canvas.clientWidth;
      pointer.texcoordY = 1.0 - posY / canvas.clientHeight;
      pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
      pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
      pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    }

    function onMove(e) {
      var rect = canvas.getBoundingClientRect();
      var p = pointers[0];
      if (!p.lastSet) { p.texcoordX = (e.clientX - rect.left) / canvas.clientWidth; p.texcoordY = 1 - (e.clientY - rect.top) / canvas.clientHeight; p.lastSet = true; }
      p.color = generateColor();
      updatePointerMoveData(p, e.clientX - rect.left, e.clientY - rect.top);
    }
    target.addEventListener('mousemove', onMove);
    target.addEventListener('touchmove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var t = e.targetTouches[0];
      if (!t) return;
      var p = pointers[0];
      p.color = generateColor();
      updatePointerMoveData(p, t.clientX - rect.left, t.clientY - rect.top);
    }, { passive: true });

    // ---------- color ----------
    function generateColor() {
      var h = colorCfg.hueBase + (Math.random() - 0.5) * 2 * colorCfg.hueRange;
      var c = HSVtoRGB(((h % 1) + 1) % 1, colorCfg.sat, colorCfg.val);
      c.r *= colorCfg.gain; c.g *= colorCfg.gain; c.b *= colorCfg.gain;
      return [c.r, c.g, c.b];
    }
    function HSVtoRGB(h, s, v) {
      var i = Math.floor(h * 6), f = h * 6 - i;
      var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b;
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return { r: r, g: g, b: b };
    }

    // ---------- splats ----------
    function splat(x, y, dx, dy, color) {
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(splatProgram.uniforms.point, x, y);
      gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
      gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
      blit(velocity.write); velocity.swap();

      gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(splatProgram.uniforms.color, color[0], color[1], color[2]);
      blit(dye.write); dye.swap();
    }
    function correctRadius(radius) { var ar = canvas.width / canvas.height; if (ar > 1) radius *= ar; return radius; }

    function splatPointer(pointer) {
      var dx = pointer.deltaX * config.SPLAT_FORCE;
      var dy = pointer.deltaY * config.SPLAT_FORCE;
      splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
    }

    function multipleSplats(amount) {
      for (var i = 0; i < amount; i++) {
        var color = generateColor();
        color[0] *= 8; color[1] *= 8; color[2] *= 8;
        var x = Math.random(), y = Math.random();
        var dx = 1000 * (Math.random() - 0.5);
        var dy = 1000 * (Math.random() - 0.5);
        splat(x, y, dx, dy, color);
      }
    }

    function applyInputs() {
      var p = pointers[0];
      if (p.moved) { p.moved = false; splatPointer(p); }
    }

    // ---------- step ----------
    var lastUpdateTime = Date.now();
    function calcDeltaTime() {
      var now = Date.now();
      var dt = (now - lastUpdateTime) / 1000;
      dt = Math.min(dt, 0.016666);
      lastUpdateTime = now;
      return dt;
    }

    function step(dt) {
      gl.disable(gl.BLEND);

      curlProgram.bind();
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(curlFBO);

      vorticityProgram.bind();
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curlFBO.attach(1));
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
      gl.uniform1f(vorticityProgram.uniforms.dt, dt);
      blit(velocity.write); velocity.swap();

      divergenceProgram.bind();
      gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergenceFBO);

      clearProgram.bind();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
      gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
      blit(pressure.write); pressure.swap();

      pressureProgram.bind();
      gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergenceFBO.attach(0));
      for (var i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write); pressure.swap();
      }

      gradienSubtractProgram.bind();
      gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
      gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write); velocity.swap();

      advectionProgram.bind();
      gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      var velId = velocity.read.attach(0);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velId);
      gl.uniform1i(advectionProgram.uniforms.uSource, velId);
      gl.uniform1f(advectionProgram.uniforms.dt, dt);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      blit(velocity.write); velocity.swap();

      if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
      blit(dye.write); dye.swap();
    }

    function render() {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      displayProgram.bind();
      gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
      blit(null);
    }

    // ---------- main loop ----------
    var raf;
    var ambientT = Math.random() * 1000;
    function frame() {
      var dt = calcDeltaTime();
      if (resizeCanvas()) initFramebuffers();
      // gentle ambient currents so the ink is always alive
      ambientT += dt;
      ambientSplat(ambientT);
      applyInputs();
      step(dt);
      render();
      raf = requestAnimationFrame(frame);
    }

    var ambientAcc = 0;
    function ambientSplat(t) {
      ambientAcc += 1;
      if (ambientAcc < 9) return;
      ambientAcc = 0;
      var n = 2;
      for (var i = 0; i < n; i++) {
        var phase = t * 0.18 + i * 3.1;
        var x = 0.5 + Math.cos(phase * (0.7 + i * 0.3)) * 0.34;
        var y = 0.5 + Math.sin(phase * (0.9 + i * 0.2)) * 0.3;
        var dx = Math.cos(phase * 1.6) * config.SPLAT_FORCE * 0.07;
        var dy = Math.sin(phase * 1.9) * config.SPLAT_FORCE * 0.07;
        var color = generateColor();
        color[0] *= 1.4; color[1] *= 1.4; color[2] *= 1.4;
        splat(x, y, dx, dy, color);
      }
    }

    function resizeCanvas() {
      var w = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
      var h = Math.round(canvas.clientHeight * (window.devicePixelRatio || 1));
      window.__jfluidAspect = w / h;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        return true;
      }
      return false;
    }

    resizeCanvas();
    multipleSplats(parseInt(Math.random() * 8) + 8);
    frame();

    // ---------- gl helpers ----------
    function compileShader(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    function createProgram(vertexShader, fragmentShader) {
      var program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.bindAttribLocation(program, 0, 'aPosition');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn(gl.getProgramInfoLog(program));
      }
      return program;
    }
    function getUniforms(program) {
      var uniforms = {};
      var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < count; i++) {
        var name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return uniforms;
    }
    function Program(fragmentShader) {
      this.program = createProgram(baseVertexShader, fragmentShader);
      this.uniforms = getUniforms(this.program);
      this.bind = function () { gl.useProgram(this.program); };
    }

    return {
      setColors: function (c) {
        if (c.hueBase != null) colorCfg.hueBase = c.hueBase;
        if (c.hueRange != null) colorCfg.hueRange = c.hueRange;
      },
      splat: function (texX, texY, dx, dy) {
        var col = generateColor(); col[0] *= 6; col[1] *= 6; col[2] *= 6;
        splat(texX, texY, dx, dy, col);
      },
      resize: resizeCanvas,
      destroy: function () {
        cancelAnimationFrame(raf);
        target.removeEventListener('mousemove', onMove);
      }
    };
  }

  // ---------- context / format helpers ----------
  function getWebGLContext(canvas) {
    var params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    var gl = canvas.getContext('webgl2', params);
    var isWebGL2 = !!gl;
    if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    var halfFloat, supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    var halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
    var formatRGBA, formatRG, formatR;
    if (isWebGL2) {
      formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
      formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
      formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    } else {
      formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }
    return {
      gl: gl,
      ext: {
        formatRGBA: formatRGBA, formatRG: formatRG, formatR: formatR,
        halfFloatTexType: halfFloatTexType,
        supportLinearFiltering: !!supportLinearFiltering
      }
    };
  }
  function getSupportedFormat(gl, internalFormat, format, type) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
      switch (internalFormat) {
        case gl.R16F: return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
        case gl.RG16F: return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
        default: return null;
      }
    }
    return { internalFormat: internalFormat, format: format };
  }
  function supportRenderTextureFormat(gl, internalFormat, format, type) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status === gl.FRAMEBUFFER_COMPLETE;
  }
  function getResolution(resolution) {
    var aspectRatio = window.__jfluidAspect || (16 / 9);
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    var min = Math.round(resolution);
    var max = Math.round(resolution * aspectRatio);
    return { width: max, height: min };
  }

  window.JFluid = { start: start };
})();
