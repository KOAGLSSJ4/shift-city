// Three camera views driven by the same vehicle state: cockpit, chase and top-down.
import * as THREE from 'three';
import type { CameraView } from '../core/Save';

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.08, 3000);
  view: CameraView = 'chase';
  private pos = new THREE.Vector3(0, 5, -10);
  private look = new THREE.Vector3();
  private offset = new THREE.Vector3(0, 2.2, -6.2);
  private shake = 0;
  private snap = true;

  setView(v: CameraView) { this.view = v; this.snap = true; }
  cycle(): CameraView { const order: CameraView[] = ['cockpit', 'chase', 'top']; this.setView(order[(order.indexOf(this.view) + 1) % 3]); return this.view; }
  bump(amount: number) { this.shake = Math.min(1, this.shake + amount); }
  cut() { this.snap = true; }

  /**
   * @param car    root object of the vehicle (position + heading)
   * @param eye    cockpit eye point in car space
   * @param speed  m/s, used for FOV and follow distance
   */
  update(dt: number, car: THREE.Object3D, heading: number, eye: THREE.Vector3, speed: number, steer: number) {
    const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const cam = this.camera;
    const cpos = car.getWorldPosition(new THREE.Vector3());
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 7);
    if (this.view === 'chase') {
      // Smooth the camera's offset from the car (not its absolute position) so it never lags at speed.
      const dist = 6.2 + speed * 0.03, height = 2.2 + speed * 0.01;
      const wantOff = fwd.clone().multiplyScalar(-dist).add(new THREE.Vector3(0, height, 0));
      if (this.snap) this.offset.copy(wantOff); else this.offset.lerp(wantOff, 1 - Math.exp(-dt * 4));
      this.pos.copy(cpos).add(this.offset);
      const lookWant = cpos.clone().addScaledVector(fwd, 4).add(new THREE.Vector3(0, 1.1, 0));
      this.look.lerp(lookWant, this.snap ? 1 : 1 - Math.exp(-dt * 12));
      cam.position.copy(this.pos);
      cam.fov = THREE.MathUtils.lerp(cam.fov, 58 + Math.min(22, speed * 0.32), 1 - Math.exp(-dt * 3));
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
    } else if (this.view === 'cockpit') {
      const world = eye.clone().applyMatrix4(car.matrixWorld);
      cam.position.copy(world);
      const ahead = world.clone().addScaledVector(fwd, 10);
      ahead.y -= 0.6;
      // glance slightly into turns
      ahead.addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), steer * 1.2);
      cam.up.set(0, 1, 0);
      cam.lookAt(ahead);
      cam.fov = THREE.MathUtils.lerp(cam.fov, 72 + Math.min(10, speed * 0.12), 1 - Math.exp(-dt * 3));
    } else {
      const h = 42 + Math.min(30, speed * 0.6);
      const want = cpos.clone().addScaledVector(fwd, speed * 0.35).add(new THREE.Vector3(0, h, -0.01));
      this.pos.lerp(want, this.snap ? 1 : 1 - Math.exp(-dt * 4));
      cam.position.copy(this.pos);
      cam.up.set(0, 0, 1); // north-up (+Z at top of screen)
      cam.lookAt(this.pos.x, 0, this.pos.z);
      cam.fov = THREE.MathUtils.lerp(cam.fov, 50, 1 - Math.exp(-dt * 3));
    }
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.snap = false;
  }
}
