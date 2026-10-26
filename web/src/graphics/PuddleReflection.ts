// Real puddle reflections: the scene is rendered from a camera mirrored in the road plane (y = 0) into a
// texture, which the asphalt shader samples in screen-projected space. Standing water (from the
// puddle roughness map) mirrors the city with Fresnel falloff; damp asphalt gets faint, distorted
// reflections; rain adds expanding ripple rings that disturb the image like real water.
import * as THREE from 'three';

export const puddleUniforms = {
  tRefl: { value: null as THREE.Texture | null },
  uReflMatrix: { value: new THREE.Matrix4() },
  uWet: { value: 0 },
  uRain: { value: 0 },
  uTime: { value: 0 },
  uReflOn: { value: 0 },
};

/** Injects the puddle reflection into a MeshStandardMaterial (the road). */
export function installPuddleShader(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, puddleUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflCoord;\nvarying vec2 vWorldXZ;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 pwWorld = modelMatrix * vec4(transformed, 1.0);
        vReflCoord = uReflMatrix * pwWorld;
        vWorldXZ = pwWorld.xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tRefl; uniform float uWet, uRain, uTime, uReflOn;
        varying vec4 vReflCoord; varying vec2 vWorldXZ;
        float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // rain ripples: each cell spawns a ring that expands and fades, at a random phase
        vec2 ripples(vec2 p, float t) {
          vec2 acc = vec2(0.0);
          for (int k = 0; k < 3; k++) {
            vec2 q = p * 1.7 + float(k) * 5.13;
            vec2 cell = floor(q), f = fract(q) - 0.5;
            float h = pHash(cell + float(k) * 7.0);
            vec2 c = vec2(pHash(cell + 1.7), pHash(cell + 3.1)) - 0.5;
            float ph = fract(t * (0.8 + h * 0.6) + h);
            vec2 d = f - c * 0.5;
            float r = length(d);
            float ring = exp(-pow((r - ph * 0.42) * 28.0, 2.0)) * (1.0 - ph);
            acc += d / max(r, 1e-3) * ring;
          }
          return acc;
        }`)
      .replace('#include <opaque_fragment>', `
        if (uWet > 0.0) {
          // standing water where the puddle map is smooth; a thin damp film everywhere else
          float puddle = smoothstep(0.30, 0.08, roughnessFactor);
          float film = 0.18;
          float water = max(puddle, film) * uWet;
          vec3 V = normalize(vViewPosition);
          float cosT = clamp(abs(dot(V, normal)), 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec2 rip = ripples(vWorldXZ, uTime) * uRain * (0.3 + puddle * 0.7);
          vec4 rc = vReflCoord;
          // still water is a near-perfect mirror; damp asphalt scatters the image
          rc.xy += (normal.xy * mix(0.06, 0.008, puddle) + rip * 0.05) * rc.w;
          vec3 refl = texture2DProj(tRefl, rc).rgb * uReflOn;
          float k = water * uReflOn * mix(0.25 + 0.75 * fres, 0.55 + 0.45 * fres, puddle);
          outgoingLight = mix(outgoingLight * (1.0 - puddle * uWet * 0.55), refl, clamp(k, 0.0, 0.92));
          // ripple crests catch a little light
          outgoingLight += vec3(length(rip)) * 0.15 * uRain * puddle;
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'puddles-v1';
  mat.needsUpdate = true;
}

/** Mirrored camera + render target (same maths as three's Reflector, for a y = 0 ground plane). */
export class PlanarReflection {
  readonly target = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 0 });
  private cam = new THREE.PerspectiveCamera();
  private normal = new THREE.Vector3(0, 1, 0);
  private hidden: THREE.Object3D[] = [];
  scale = 0.5;

  constructor() {
    puddleUniforms.tRefl.value = this.target.texture;
  }

  /** Objects that must not appear in their own reflection (the road surface and its markings). */
  hide(...objs: THREE.Object3D[]) { this.hidden.push(...objs); }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(size.x * this.scale)), h = Math.max(64, Math.round(size.y * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.01) return;
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const view = camPos.clone().negate().reflect(this.normal).negate(); // mirror of camera position
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = look.clone().negate().reflect(this.normal).negate();
    const vc = this.cam;
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(this.normal);
    vc.lookAt(target);
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    puddleUniforms.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // oblique near plane: clip everything below the road so it doesn't leak into the reflection
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, new THREE.Vector3(0, 0.01, 0)).applyMatrix4(vc.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vc.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + pm[8]) / pm[0], (Math.sign(clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1; pm[14] = clip.w;

    const vis = this.hidden.map((o) => o.visible);
    this.hidden.forEach((o) => (o.visible = false));
    const prevTarget = renderer.getRenderTarget();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // reuse this frame's shadow map
    const prevNeeds = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    puddleUniforms.uReflOn.value = 0; // no recursive puddles inside the reflection
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    puddleUniforms.uReflOn.value = 1;
    renderer.shadowMap.autoUpdate = shadowAuto;
    renderer.shadowMap.needsUpdate = prevNeeds;
    this.hidden.forEach((o, i) => (o.visible = vis[i]));
  }
}
