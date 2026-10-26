// Fixed-step arcade-sim car model (kinematic bicycle + lateral grip). Shared by every camera view.
import * as THREE from 'three';
import type { VehicleStats } from '../data/vehicles';

export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }

export class VehiclePhysics {
  pos = new THREE.Vector3();
  heading = 0;              // radians; forward = (sin h, 0, cos h)
  vel = new THREE.Vector3();
  steerAngle = 0;
  vLong = 0;
  vLat = 0;
  accelLong = 0;
  accelLat = 0;
  wheelSpin = 0;
  odometer = 0;             // metres driven
  braking = false;
  private acc = 0;
  static readonly STEP = 1 / 120;

  constructor(public stats: VehicleStats, public wheelbase = 2.7) {}

  get forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get speed() { return Math.abs(this.vLong); }

  reset(x: number, z: number, heading: number) {
    this.pos.set(x, 0, z); this.heading = heading; this.vel.set(0, 0, 0); this.vLong = this.vLat = 0; this.steerAngle = 0;
  }

  update(dt: number, inp: DriveInput) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= VehiclePhysics.STEP) { this.step(VehiclePhysics.STEP, inp); this.acc -= VehiclePhysics.STEP; }
  }

  private step(h: number, inp: DriveInput) {
    const s = this.stats;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // right vector
    let vLong = this.vel.x * fx + this.vel.z * fz;
    let vLat = this.vel.x * rx + this.vel.z * rz;
    const prevLong = vLong, prevLat = vLat;

    // longitudinal
    this.braking = false;
    if (inp.throttle) {
      if (vLong < -0.5) { vLong += s.brake * h; this.braking = true; }
      else vLong += s.accel * Math.max(0, 1 - Math.pow(Math.max(0, vLong) / s.top, 2)) * h;
    }
    if (inp.brake) {
      if (vLong > 0.5) { vLong -= s.brake * h; this.braking = true; }
      else vLong = Math.max(-11, vLong - s.accel * 0.6 * h);
    }
    const drag = 0.35 + 0.0009 * vLong * vLong + (inp.throttle || inp.brake ? 0 : 0.9);
    vLong -= Math.sign(vLong) * Math.min(Math.abs(vLong), drag * h);
    if (inp.handbrake) { vLong -= Math.sign(vLong) * Math.min(Math.abs(vLong), 6 * h); this.braking = true; }

    // steering: limited at speed for stability
    const speedLimit = 1 / (1 + Math.max(0, Math.abs(vLong) - 6) / 22);
    const target = inp.steer * s.steer * speedLimit;
    const rate = 3.2;
    this.steerAngle += Math.max(-rate * h, Math.min(rate * h, target - this.steerAngle));
    const yawRate = (vLong * Math.tan(this.steerAngle)) / this.wheelbase;
    this.heading += yawRate * h * (inp.handbrake ? 1.35 : 1);

    // lateral grip: kills sideways velocity; handbrake lets the rear slide
    const grip = inp.handbrake ? 1.2 : 9 * s.grip;
    vLat *= Math.exp(-grip * h);

    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -nfz, nrz = nfx;
    this.vel.set(nfx * vLong + nrx * vLat, 0, nfz * vLong + nrz * vLat);
    this.pos.addScaledVector(this.vel, h);
    this.odometer += Math.abs(vLong) * h;
    this.accelLong = (vLong - prevLong) / h;
    this.accelLat = vLong * yawRate;
    this.vLong = vLong; this.vLat = vLat;
    this.wheelSpin += vLong * h;
    void prevLat;
  }

  /** Applies a positional correction from a collision and bleeds velocity into the contact. */
  collide(nx: number, nz: number, push: number, restitution = 0.25) {
    this.pos.x += nx * push; this.pos.z += nz * push;
    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn < 0) { this.vel.x -= (1 + restitution) * vn * nx; this.vel.z -= (1 + restitution) * vn * nz; }
    this.vel.multiplyScalar(0.92);
    return Math.abs(vn);
  }
}
