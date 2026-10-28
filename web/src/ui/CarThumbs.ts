// Small rendered pictures of every garage car, made once per session with a throwaway renderer.
import * as THREE from 'three';
import { VEHICLES } from '../data/vehicles';
import { buildProceduralCar } from '../vehicles/CarFactory';

let cache: Promise<Record<string, string>> | null = null;

/** Data-URL thumbnails keyed by vehicle id. `env` is the game's sky lighting so paint looks right. */
export function carThumbs(env: THREE.Texture | null): Promise<Record<string, string>> {
  return (cache ??= render(env));
}

async function render(env: THREE.Texture | null) {
  const out: Record<string, string> = {};
  const W = 192, H = 108;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out; // no WebGL for thumbnails: the garage falls back to colour swatches
  }
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = env;
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(5, 8, 6);
  scene.add(sun, new THREE.HemisphereLight(0xdfe8f5, 0x404040, 0.7));
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  for (const v of VEHICLES) {
    const rig = buildProceduralCar(v.body, v.color, { detail: false, photoreal: true });
    scene.add(rig.root);
    const k = v.dims.length / 4.6;
    cam.position.set(5.2 * k, 1.9 * k, 6.4 * k);
    cam.lookAt(0, 0.55, 0);
    renderer.render(scene, cam);
    out[v.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(rig.root);
    rig.dispose();
    await new Promise((r) => requestAnimationFrame(r)); // keep the UI responsive between cars
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
