// Screen-space windscreen rain for the cockpit view: droplets refract (and flip) the scene behind
// them, build up between wiper sweeps, run down the glass when slow and streak upward at speed.
import * as THREE from 'three';

export const WindscreenRainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAmount: { value: 0 },      // 0 = off
    uDashY: { value: 0.3 },     // screen-space y (0 bottom → 1 top) of the dashboard line
    uAspect: { value: 16 / 9 },
    uSpeed: { value: 0 },       // 0..1
    uWiper: { value: 1 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAmount, uDashY, uAspect, uSpeed, uWiper;
    varying vec2 vUv;
    #define PI 3.14159265
    float h1(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    const float P = 3.2;   // wiper cycle (s)
    const float SW = 0.65; // one sweep (s)
    // seconds since a wiper blade last passed over point p (in aspect-corrected space)
    float sinceWipe(vec2 p, vec2 pivot, float reach) {
      vec2 d = p - pivot; float r = length(d);
      if (r > reach || d.y < 0.0) return 99.0;
      float th = acos(clamp(d.x / r, -1.0, 1.0)) / PI;   // 0 (right) → 1 (left)
      float tp = mod(uTime, P);
      float tf = SW * (1.0 - th);                         // blade rises from the right
      float tb = SW + SW * th;                            // and returns
      if (tp >= tb) return tp - tb;
      if (tp >= tf) return tp - tf;
      return tp + (P - tb);
    }
    float bladeAngle() {
      float tp = mod(uTime, P);
      if (tp < SW) return PI * (tp / SW);
      if (tp < 2.0 * SW) return PI * (1.0 - (tp - SW) / SW);
      return 0.0;
    }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uAmount <= 0.0 || vUv.y < uDashY - 0.02) { gl_FragColor = base; return; }
      vec2 p = vec2(vUv.x * uAspect, vUv.y);
      vec2 pivA = vec2(uAspect * 0.28, uDashY - 0.04), pivB = vec2(uAspect * 0.62, uDashY - 0.04);
      float reach = 0.62;
      float wiped = min(sinceWipe(p, pivA, reach), sinceWipe(p, pivB, reach));
      vec2 offs = vec2(0.0); float cover = 0.0;
      // three layers of droplets of different sizes
      for (int L = 0; L < 3; L++) {
        float fl = float(L);
        float sc = 9.0 + fl * 7.0;
        vec2 q = p * sc;
        // drops slide down when slow, get blown up/back at speed
        float drift = (fl * 0.35 + 0.2) * (uSpeed * 1.6 - 0.25);
        q.y -= uTime * drift;
        vec2 cell = floor(q), f = fract(q) - 0.5;
        float rnd = h1(cell + fl * 13.0);
        if (rnd > 0.55 * uAmount + 0.1) continue;
        // each drop "lands" at a random moment after the last wipe
        float born = h1(cell + 4.2 + fl) * P * 0.85;
        if (wiped < born) continue;
        vec2 c = (vec2(h1(cell + 1.1), h1(cell + 2.3)) - 0.5) * 0.6;
        float rad = 0.12 + h1(cell + 9.7) * 0.18;
        vec2 d = f - c; d.y *= 1.0 + uSpeed * 1.5;          // elongate into streaks at speed
        float r = length(d);
        float m = smoothstep(rad, rad * 0.75, r);
        // refraction: a lens flips and magnifies what's behind it
        offs += -d / sc * 3.2 * m;
        cover = max(cover, m);
      }
      cover *= smoothstep(uDashY - 0.02, uDashY + 0.02, vUv.y);
      vec3 col = texture2D(tDiffuse, vUv + offs * vec2(1.0 / uAspect, 1.0)).rgb;
      // drops are slightly brighter at the rim and darker at the core
      col = mix(base.rgb, col * 1.06, cover);
      // fine mist and blur on the glass between wipes
      float mist = clamp(min(wiped, P) / P, 0.0, 1.0) * 0.18 * uAmount;
      col = mix(col, (col + texture2D(tDiffuse, vUv + vec2(0.003, 0.002)).rgb + texture2D(tDiffuse, vUv - vec2(0.002, 0.003)).rgb) / 3.0 + 0.02, mist);
      // wiper blades
      if (uWiper > 0.0) {
        float a = bladeAngle();
        for (int k = 0; k < 2; k++) {
          vec2 piv = k == 0 ? pivA : pivB;
          vec2 dir = vec2(cos(PI - a), sin(PI - a));
          if (k == 1) dir = vec2(cos(PI - a), sin(PI - a));
          vec2 d = p - piv; float t = clamp(dot(d, dir), 0.0, reach);
          float dist = length(d - dir * t);
          col = mix(col, vec3(0.015), smoothstep(0.009, 0.005, dist) * step(0.04, t));
        }
      }
      gl_FragColor = vec4(col, base.a);
    }`,
};
