import { RAIN_FARE_BONUS } from './DayCycle';
import type { StationId } from '../data/radio';
// Story / Free Ride: the player drives the city, takes jobs, follows GPS and earns money.
import * as THREE from 'three';
import { BALANCE } from '../data/balancing';
import { DESTINATIONS, type Destination } from '../data/world';
import { STORY } from '../data/story';
import { currentJob, fatigue, finishJob } from './Week';
import { effectiveStats, vehicleById } from '../data/vehicles';
import type { City } from '../world/City';
import type { Traffic } from '../world/Traffic';
import { destinationSegment, nearestSegment, route, type Route } from '../world/RoadNetwork';
import { VehiclePhysics, type DriveInput } from '../vehicles/VehiclePhysics';
import type { CarRig } from '../vehicles/CarFactory';
import type { SaveData } from '../core/Save';
import { payJob, upgradesOf, type JobPayment } from './Economy';
import { CANCEL_FEE, WAIT_GRACE, waitingFee, applySurgeZone, headsTowards, isScripted, randomJob, weekJob, riderPatience, rollSurgeZone, starsFor, storyJob, type Job, type SurgeZone } from './Jobs';
import { DECLINE_LIMIT, OFFER_SECONDS, driverTier, offlineLeft, recordAccept, recordDecline } from './Driver';
import { line, logBump, logHarsh, missionResult, personaHappy, musicTaste, complimentFor, COMPLIMENTS, type Moment } from './Missions';

export interface CityEvents {
  /** A new request (null = the offer was withdrawn, e.g. it expired). */
  offer(job: Job | null): void;
  stage(job: Job): void;
  complete(job: Job, pay: JobPayment, stars: number): void;
  storyDone(): void;
  bump(strength: number): void;
  toast(msg: string): void;
  /** A passenger speaks (shown as a speech bubble). */
  say(who: string, text: string): void;
  /** The Week: today's jobs are done (show the evening choice). */
  weekEvening?(): void;
  /** The Week: a story job was delivered. */
  weekProgress?(): void;
  /** The car radio station right now. */
  station(): StationId;
}

const SPAWN = { x: DESTINATIONS[0].x - 30, z: DESTINATIONS[0].z, heading: Math.PI / 2 };

export class CityMode {
  readonly physics: VehiclePhysics;
  readonly markers = new THREE.Group();
  job: Job | null = null;
  route: Route | null = null;
  mode: 'story' | 'free' | 'week' = 'free';
  holdTime = 0;
  /** Seconds to stay stopped at the target: boarding, plus any wait for a late rider at pickup. */
  get holdNeeded() { return BALANCE.boardTime + (this.job?.stage === 'pickup' ? this.job.lateBy ?? 0 : 0); }
  /** Current surge zone (free ride only), shown on the minimap. */
  surgeZone: SurgeZone | null = null;
  private lastStation: StationId | null = null;
  private marker: THREE.Group;
  private beamMat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private person: THREE.Group;
  private bag: THREE.Mesh;
  private chevrons: THREE.InstancedMesh;
  private routeTimer = 0;
  private bumpCooldown = 0;
  private offerTimer = 0;
  private harshCooldown = 0;
  private talkCooldown = 0;
  time = 0;

  constructor(private city: City, private traffic: Traffic, public rig: CarRig, private save: SaveData, private ev: CityEvents) {
    const def = vehicleById(save.selected);
    this.physics = new VehiclePhysics(effectiveStats(def, upgradesOf(save, def.id)), def.dims.wheelbase);
    this.physics.reset(SPAWN.x, SPAWN.z, SPAWN.heading);

    // objective marker: ground ring + light beam + waiting passenger / food bag
    this.marker = new THREE.Group();
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x54ffd0, transparent: true, opacity: 0.85, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(BALANCE.pickupRadius - 0.6, BALANCE.pickupRadius, 64), this.ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x54ffd0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 60, 24, 1, true), this.beamMat);
    beam.position.y = 30;
    this.person = makePerson();
    this.bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.35), new THREE.MeshStandardMaterial({ color: 0xc8402a, roughness: 0.7 }));
    this.bag.position.y = 1.0;
    this.marker.add(ring, beam, this.person, this.bag);
    this.marker.visible = false;
    this.markers.add(this.marker);

    // GPS chevrons painted on the road
    const chev = new THREE.Shape();
    chev.moveTo(-0.8, -0.4); chev.lineTo(0, 0.4); chev.lineTo(0.8, -0.4); chev.lineTo(0.8, 0); chev.lineTo(0, 0.8); chev.lineTo(-0.8, 0);
    const cg = new THREE.ShapeGeometry(chev); cg.rotateX(Math.PI / 2); // shape +y → world +z (forward)
    this.chevrons = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: 0x4cf0ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }), 400);
    this.chevrons.count = 0;
    this.chevrons.frustumCulled = false;
    this.markers.add(this.chevrons);
  }

  setRig(rig: CarRig) {
    this.rig = rig;
    const def = vehicleById(this.save.selected);
    this.physics.stats = effectiveStats(def, upgradesOf(this.save, def.id));
    this.physics.wheelbase = def.dims.wheelbase;
  }

  refreshStats() { this.setRig(this.rig); }

  /** The Week: start the next day's requests after the evening/morning screens. */
  resumeWeek() { this.offerTimer = 1.2; }

  start(mode: 'story' | 'free' | 'week') {
    this.mode = mode;
    this.job = null;
    this.marker.visible = false;
    this.chevrons.count = 0;
    this.offerTimer = 0.6;
  }

  resetCar() {
    // recover onto the nearest road, facing along it
    const { proj, seg } = nearestSegment(this.physics.pos);
    const h = this.physics.heading;
    const along = seg.axis === 'x' ? (Math.sin(h) >= 0 ? Math.PI / 2 : -Math.PI / 2) : (Math.cos(h) >= 0 ? 0 : Math.PI);
    // drop into the right-hand lane for that direction
    const fx = Math.sin(along), fz = Math.cos(along);
    this.physics.reset(proj.x - fz * 5.25, proj.z + fx * 5.25, along);
    this.ev.toast('Vehicle recovered');
  }

  accept() {
    if (!this.job || this.job.stage !== 'offer') return;
    if (!isScripted(this.job)) recordAccept(this.save.driver);
    this.job.stage = 'pickup';
    this.job.startedAt = this.time;
    this.showMarker(this.job.a, true);
    this.ev.stage(this.job);
    this.computeRoute();
    if (!isScripted(this.job) && !this.job.food && this.save.tutorialDone) this.job.patience = riderPatience(this.route?.length ?? 400);
  }

  decline() {
    if (!this.job || this.job.stage !== 'offer' || isScripted(this.job)) return;
    this.job = null;
    this.offerTimer = 1.5;
    this.ev.offer(null); // clear the card right away
    this.afterDecline('Request declined');
  }

  /** Seconds left in an offline cool-down after too many declines (0 = online). */
  get offlineLeft() { return offlineLeft(this.save.driver, Date.now()); }

  /** Shared by declines and missed (expired) offers: lowers acceptance, may take you offline. */
  private afterDecline(what: string) {
    const d = this.save.driver;
    if (recordDecline(d, Date.now())) {
      this.ev.toast(`You declined ${DECLINE_LIMIT} requests in a row: you're offline for a minute`);
    } else {
      const left = DECLINE_LIMIT - d.declineStreak;
      this.ev.toast(d.declineStreak > 0 ? `${what}: ${left} more in a row and you go offline` : `${what}: finding another…`);
    }
  }

  private nextOffer() {
    const def = vehicleById(this.save.selected);
    if (this.mode === 'week') {
      // The Week: today's next scripted job; in the evening the game shows the choice screen instead
      const wj = currentJob(this.save.week);
      if (!wj) { this.offerTimer = 1e9; this.ev.weekEvening?.(); return; }
      this.job = weekJob(wj);
    } else if (this.mode === 'story') {
      const j = storyJob(this.save.story.chapter);
      if (!j) { this.mode = 'free'; this.ev.storyDone(); this.job = randomJob(def, this.physics.pos); }
      else this.job = j;
    } else {
      // some requests come from the surge zone, so it's worth driving there
      const z = this.surgeZone, fromZone = z && Math.random() < 0.3;
      this.job = randomJob(def, fromZone ? z : this.physics.pos, driverTier(this.save).premiumBoost);
      // destination filter: re-roll a few times for a trip that heads where you want to go
      const want = this.save.driver.filter ? DESTINATIONS.find((d) => d.name === this.save.driver.filter) : undefined;
      for (let i = 0; want && i < 6 && !headsTowards(this.job, want); i++) this.job = randomJob(def, this.physics.pos, driverTier(this.save).premiumBoost);
      if (z) applySurgeZone(this.job, z);
      // rides pay more in the rain
      if (this.save.settings.weather === 'rain') this.job.fare = Math.round(this.job.fare * RAIN_FARE_BONUS * 100) / 100;
      // like the real app: accept within 15 s or it goes to someone else (not while learning in the tutorial)
      if (this.save.tutorialDone) this.job.expires = OFFER_SECONDS;
    }
    this.ev.offer(this.job);
  }

  private showMarker(d: Destination, pickup: boolean) {
    this.marker.visible = true;
    this.marker.position.set(d.x, 0.15, d.z);
    const col = pickup ? 0x54ffd0 : 0xffb347;
    this.ringMat.color.setHex(col); this.beamMat.color.setHex(col);
    this.person.visible = pickup && !this.job?.food;
    this.bag.visible = pickup && !!this.job?.food;
    // stand the passenger on the kerb
    const off = d.side * 3.6;
    const sx = d.axis === 'z' ? off : 0, sz = d.axis === 'x' ? off : 0;
    this.person.position.set(sx, 0, sz); this.bag.position.set(sx, 1.0, sz);
  }

  get target(): Destination | null {
    if (!this.job) return null;
    return this.job.stage === 'pickup' ? this.job.a : this.job.stage === 'dropoff' ? this.job.b : null;
  }

  private computeRoute() {
    const t = this.target;
    if (!t) { this.route = null; this.chevrons.count = 0; return; }
    this.route = route(this.physics.pos, this.physics.forward, t, destinationSegment(t));
    // lay chevrons every 5 m along the route, skipping the first few metres
    const pts = this.route.points;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let n = 0, acc = 0;
    for (let i = 1; i < pts.length && n < 400; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.01) continue;
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      q.setFromAxisAngle(up, Math.atan2(dx, dz));
      for (let s = (5 - (acc % 5)) % 5; s < len && n < 400; s += 5) {
        if (acc + s < 7) continue;
        p.set(a.x + dx * s, 0.05, a.z + dz * s);
        m.compose(p, q, one);
        this.chevrons.setMatrixAt(n++, m);
      }
      acc += len;
    }
    this.chevrons.count = n;
    this.chevrons.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, input: DriveInput) {
    this.time += dt;
    if (this.mode === 'free' && (!this.surgeZone || this.time > this.surgeZone.until)) {
      this.surgeZone = rollSurgeZone(this.time);
      if (this.save.tutorialDone) this.ev.toast(`Surge ×${this.surgeZone.mult} near ${this.surgeZone.name}: rides from there pay more`);
    } else if (this.mode !== 'free') this.surgeZone = null;
    const ph = this.physics;
    const before = ph.odometer;
    // The Week: a tired driver gets a slower, softer car
    const tired = this.mode === 'week' ? fatigue(this.save.week) : 0;
    if (tired > 0) input = { ...input, throttle: input.throttle * (1 - 0.35 * tired), steer: input.steer * (1 - 0.25 * tired) };
    ph.update(dt, input);
    this.save.stats.km += (ph.odometer - before) / 1000;

    // collisions with city blocks: test front and rear of the car
    const f = ph.forward;
    const half = this.rig.length * 0.32, r = this.rig.width * 0.55;
    for (const k of [half, -half, 0]) {
      const px = ph.pos.x + f.x * k, pz = ph.pos.z + f.z * k;
      const c = this.city.collide(px, pz, r);
      if (c) {
        const d = Math.hypot(c.x, c.z);
        const impact = ph.collide(c.x / d, c.z / d, d, 0.15);
        this.hit(impact);
      }
    }
    // collisions with traffic (circle pairs)
    for (const car of this.traffic.cars) {
      const dx = ph.pos.x - car.pos.x, dz = ph.pos.z - car.pos.z;
      if (dx * dx + dz * dz > 49) continue;
      const cf = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      for (const a of [half, -half]) for (const b of [car.length * 0.3, -car.length * 0.3]) {
        const ax = ph.pos.x + f.x * a, az = ph.pos.z + f.z * a, bx = car.pos.x + cf.x * b, bz = car.pos.z + cf.z * b;
        const ddx = ax - bx, ddz = az - bz, d = Math.hypot(ddx, ddz), min = r + car.width * 0.5;
        if (d < min && d > 1e-3) {
          const impact = ph.collide(ddx / d, ddz / d, min - d, 0.35);
          this.hit(impact);
        }
      }
    }
    // keep inside the world
    ph.pos.x = THREE.MathUtils.clamp(ph.pos.x, -400, 400);
    ph.pos.z = THREE.MathUtils.clamp(ph.pos.z, -400, 400);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);

    this.applyRig(dt, input);

    // jobs
    if (this.job?.stage === 'dropoff') this.trackRide(dt);
    if (this.job?.stage === 'offer' && this.job.expires !== undefined && (this.job.expires -= dt) <= 0) {
      this.job = null;
      this.offerTimer = 1.5;
      this.afterDecline('Request missed');
      this.ev.offer(null);
    }
    // riders cancel if you take far too long to reach them (you still get a small cancellation fee)
    const pj = this.job;
    if (pj?.stage === 'pickup' && pj.patience !== undefined) {
      const left = pj.patience - (this.time - pj.startedAt);
      if (left < 20 && !pj.warned) { pj.warned = true; this.ev.toast(`${pj.customer} is getting impatient: 20 s to pick them up`); }
      if (left <= 0) {
        this.save.wallet += CANCEL_FEE;
        this.save.driver.log.push([Date.now(), CANCEL_FEE]);
        this.marker.visible = false;
        this.route = null; this.chevrons.count = 0;
        this.job = null;
        this.offerTimer = 2;
        this.ev.offer(null);
        this.ev.toast(`${pj.customer} cancelled the ride. Cancellation fee +$${CANCEL_FEE}`);
      }
    }
    if (!this.job && this.offlineLeft <= 0 && (this.offerTimer -= dt) <= 0) this.nextOffer();
    const t = this.target;
    if (t && this.job) {
      const d = Math.hypot(ph.pos.x - t.x, ph.pos.z - t.z);
      if (d < BALANCE.pickupRadius && ph.speed < BALANCE.stopSpeed) {
        const was = this.holdTime;
        this.holdTime += dt;
        if (this.job.stage === 'pickup' && this.job.lateBy && was < BALANCE.boardTime && this.holdTime >= BALANCE.boardTime)
          this.ev.toast(this.job.food ? `${this.job.restaurant} is finishing the order (~${this.job.lateBy} s). Waiting fee after ${WAIT_GRACE} s` : `${this.job.customer} is on their way out (~${this.job.lateBy} s). Waiting fee after ${WAIT_GRACE} s`);
        if (this.holdTime >= this.holdNeeded) { this.holdTime = 0; this.arrive(); }
      } else this.holdTime = 0;
      if ((this.routeTimer -= dt) <= 0) { this.routeTimer = 0.35; this.computeRoute(); }
    }
    this.marker.rotation.y += dt * 0.8;
    this.beamMat.opacity = 0.16 + Math.sin(this.time * 4) * 0.06;
  }

  private hit(impact: number) {
    if (impact < 2 || this.bumpCooldown > 0) return;
    this.bumpCooldown = 0.8;
    if (this.job && this.job.stage === 'dropoff' && impact > 4) {
      this.job.bumps++;
      logBump(this.job.log);
      this.talk('bump', true);
    }
    this.ev.bump(Math.min(1, impact / 15));
  }

  /** Watches how the passenger/order is being treated: harsh moves, speed and fun cornering. */
  private trackRide(dt: number) {
    const job = this.job!, ph = this.physics, log = job.log;
    this.harshCooldown = Math.max(0, this.harshCooldown - dt);
    this.talkCooldown = Math.max(0, this.talkCooldown - dt);
    if (this.harshCooldown <= 0 && (Math.abs(ph.accelLong) > 7.5 || Math.abs(ph.accelLat) > 7.5)) {
      this.harshCooldown = 1.5;
      logHarsh(log);
      this.talk('harsh');
    }
    if (ph.speed > 19.5) {
      const was = log.fast;
      log.fast += dt;
      if (was < 3 && log.fast >= 3) this.talk('fast');
    }
    if (job.persona) {
      const st = this.ev.station(), taste = musicTaste(job.persona, st);
      log.music += dt * taste;
      if (st !== this.lastStation) {
        if (this.lastStation !== null && taste !== 0) this.talk(taste > 0 ? 'musicLove' : 'musicHate', true);
        this.lastStation = st;
      }
    }
    if (Math.abs(ph.accelLat) > 5 && ph.speed > 10) {
      const was = log.fun;
      log.fun += dt;
      if (Math.floor(was / 2) !== Math.floor(log.fun / 2)) this.talk('fun');
    }
  }

  /** Passenger dialogue, rate-limited so they don't talk over themselves. */
  private talk(m: Moment, force = false) {
    const job = this.job;
    if (!job?.persona || (!force && this.talkCooldown > 0)) return;
    const text = line(job.persona, m);
    if (!text) return;
    this.talkCooldown = 6;
    this.ev.say(job.customer, text);
  }

  private arrive() {
    const job = this.job!;
    if (job.stage === 'pickup') {
      job.stage = 'dropoff';
      job.pickedAt = this.time;
      this.talkCooldown = 0;
      this.talk('pickup');
      this.showMarker(job.b, false);
      this.ev.stage(job);
      this.computeRoute();
    } else if (job.stage === 'dropoff' && job.extraDrop) {
      // stacked order: first bag delivered, on to the second drop-off (paid together at the end)
      this.ev.toast(`Order 1 of 2 delivered at ${job.b.name}. Next: ${job.extraDrop.name}`);
      job.b = job.extraDrop;
      job.extraDrop = undefined;
      this.showMarker(job.b, false);
      this.ev.stage(job);
      this.computeRoute();
    } else if (job.stage === 'dropoff') {
      job.stage = 'done';
      this.marker.visible = false;
      this.chevrons.count = 0;
      this.route = null;
      const def = vehicleById(this.save.selected);
      const elapsed = this.time - job.startedAt;
      const onBoard = this.time - (job.pickedAt ?? job.startedAt);
      const mission = missionResult(job.variant, job.persona, job.fare * def.fare, onBoard, job.limit, job.log);
      const stars = Math.max(1, Math.round((starsFor(job, def) - mission.starPenalty) * 10) / 10);
      const waitFee = job.lateBy ? waitingFee(job.lateBy) : 0;
      if (waitFee) mission.note = [mission.note, `waiting fee $${waitFee.toFixed(2)}`].filter(Boolean).join(' · ');
      const bonusTip = (job.bonusTime && elapsed < job.bonusTime ? Math.round(job.fare * 0.25) : 0) + mission.tip + waitFee;
      const pay = payJob(this.save, job.id, job.fare, def, { food: job.food, stars, story: job.chapter !== null, bonusTip, bonusXp: mission.xp });
      if (job.week && pay) { finishJob(this.save.week, pay.total, stars, job.log.bumps); this.ev.weekProgress?.(); }
      if (job.persona) {
        const text = line(job.persona, personaHappy(job.persona, onBoard, job.limit, job.log) >= 0.5 ? 'good' : 'bad');
        if (text) this.ev.say(job.customer, text);
      }
      const badge = pay && job.persona ? complimentFor(job.persona, stars, onBoard, job.limit, job.log) : null;
      if (badge) this.save.driver.badges[badge] = (this.save.driver.badges[badge] ?? 0) + 1;
      if (pay) this.ev.complete(job, { ...pay, note: [mission.note, pay.note, badge ? `compliment: ${COMPLIMENTS[badge]}` : ''].filter(Boolean).join(' · ') }, stars);
      this.job = null;
      this.offerTimer = 2.2;
      if (job.chapter !== null && job.chapter + 1 >= STORY.length) this.ev.storyDone();
    }
  }

  private applyRig(dt: number, input: DriveInput) {
    const ph = this.physics, rig = this.rig;
    rig.root.position.copy(ph.pos);
    rig.root.rotation.y = ph.heading;
    // body pitch/roll for weight transfer
    rig.body.rotation.x = THREE.MathUtils.lerp(rig.body.rotation.x, THREE.MathUtils.clamp(-ph.accelLong * 0.006, -0.05, 0.05), 1 - Math.exp(-dt * 6));
    rig.body.rotation.z = THREE.MathUtils.lerp(rig.body.rotation.z, THREE.MathUtils.clamp(ph.accelLat * 0.006, -0.06, 0.06), 1 - Math.exp(-dt * 6));
    const spin = ph.wheelSpin / rig.wheelRadius;
    rig.wheels.forEach((w) => { w.rotation.x = spin; });
    rig.steerPivots.forEach((p) => { p.rotation.y = ph.steerAngle; });
    const sw = (rig.body.userData.sw ??= rig.body.getObjectByName('steeringWheel') ?? null) as THREE.Object3D | null;
    if (sw) sw.rotation.z = -ph.steerAngle * 4;
    rig.brakeLights.emissiveIntensity = ph.braking || input.brake ? 3 : 0.5;
    rig.root.updateMatrixWorld();
  }
}

function makePerson() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.6 });
  const coat = new THREE.MeshStandardMaterial({ color: [0x2b4a7a, 0x7a2b3a, 0x333333, 0x5a6b2b][Math.floor(Math.random() * 4)], roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0x1d2330 }));
  legs.position.y = 0.43;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 10), coat);
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin);
  head.position.y = 1.68;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 6), coat);
  arm.position.set(0.3, 1.55, 0); arm.rotation.z = -2.6; // waving
  const case_ = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.22), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.4 }));
  case_.position.set(-0.45, 0.35, 0);
  g.add(legs, torso, head, arm, case_);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return g;
}
