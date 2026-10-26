// Rain streaks animated entirely on the GPU in a box that follows the camera.
import * as THREE from 'three';

export class Rain {
  readonly mesh: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;

  constructor(count = 6000) {
    const pos = new Float32Array(count * 6), seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
      pos.set([x, y, z, x, y, z], i * 6);
      const s = Math.random();
      seed.set([s, s], i * 2);
    }
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { end[i * 2] = 0; end[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('tail', new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0xaabbcc) }, uOpacity: { value: 0.35 } },
      vertexShader: /* glsl */`
        attribute float seed; attribute float tail;
        uniform float uTime; uniform vec3 uCenter;
        varying float vA;
        void main(){
          vec3 p = position;
          float fall = mod(p.y - uTime * (22.0 + seed * 8.0), 30.0);
          // wrap the box around the camera so rain is always present
          p.x = mod(p.x - uCenter.x + 30.0, 60.0) - 30.0 + uCenter.x;
          p.z = mod(p.z - uCenter.z + 30.0, 60.0) - 30.0 + uCenter.z;
          p.y = uCenter.y - 10.0 + fall + tail * 0.9;
          p.x += tail * 0.12;
          vA = tail;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main(){ gl_FragColor = vec4(uColor, uOpacity * (0.3 + vA * 0.7)); }`,
    });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  set night(v: boolean) { this.mat.uniforms.uColor.value.setHex(v ? 0x8899aa : 0xc8d4e0); this.mat.uniforms.uOpacity.value = v ? 0.28 : 0.35; }

  update(dt: number, camera: THREE.Camera) {
    if (!this.mesh.visible) return;
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uCenter.value.copy(camera.position);
  }
}
