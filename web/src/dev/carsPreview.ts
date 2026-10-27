// Dev-only studio for the procedural car designs: /dev/cars.html?car=hyper&view=front34
// view: grid | front34 | rear34 | side | front | rear | top | cockpit; &traffic=1 shows the cheap LOD.
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { buildProceduralCar, buildTrafficCar } from '../vehicles/CarFactory';
import { VEHICLES } from '../data/vehicles';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'grid';
const traffic = q.get('traffic') === '1';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a9099);
const cam = new THREE.PerspectiveCamera(view === 'cockpit' ? 70 : 30, innerWidth / innerHeight, 0.05, 200);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 10, 8); sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -14; sun.shadow.camera.right = sun.shadow.camera.top = 14;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, new THREE.HemisphereLight(0xdfe8f5, 0x404040, 0.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.8 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const make = (i: number) => {
  const v = VEHICLES[i];
  if (traffic) return buildTrafficCar(v.body === 'classic' ? 'hatch' : v.body, v.color);
  const r = buildProceduralCar(v.body, v.color, { detail: true, photoreal: true });
  return Object.assign(r.root, { userData: { rig: r } });
};

if (view === 'grid') {
  VEHICLES.forEach((_, i) => {
    const m = make(i);
    m.position.set((i % 5) * 5.4 - 10.8, 0, Math.floor(i / 5) * -7 + 3);
    m.rotation.y = 0.6;
    scene.add(m);
  });
  cam.position.set(4, 13, 22); cam.lookAt(0, 0, -1);
} else {
  const idx = Math.max(0, VEHICLES.findIndex((v) => v.body === q.get('car') || v.id === q.get('car')));
  const m = make(idx);
  scene.add(m);
  const L = VEHICLES[idx].dims.length;
  const at = new THREE.Vector3(0, 0.6, 0);
  const poses: Record<string, [number, number, number]> = {
    front34: [4.5, 1.6, 5.5], rear34: [-4.5, 1.8, -5.5], side: [9, 1.0, 0], front: [0, 1.0, 9], rear: [0, 1.2, -9], top: [0.01, 12, 0],
  };
  if (view === 'cockpit') {
    const rig = (m.userData as { rig: { eye: THREE.Vector3 } }).rig;
    cam.position.copy(rig.eye); cam.lookAt(rig.eye.clone().add(new THREE.Vector3(0, -0.12, 5)));
  } else {
    const p = poses[view] ?? poses.front34;
    cam.position.set(p[0] * L / 4.6, p[1], p[2] * L / 4.6); cam.lookAt(at);
  }
}

new RGBELoader().load('../assets/hdri/sky_1k.hdr', (t) => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = t;
  renderer.render(scene, cam);
  (window as unknown as { ready: boolean }).ready = true;
});
renderer.render(scene, cam);
