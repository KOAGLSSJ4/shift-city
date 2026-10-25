// Top-level orchestrator: owns the renderer, world, modes, UI and save. Keeps modes independent of
// graphics quality and camera view (three separate selections).
import * as THREE from 'three';
import { GameRenderer } from '../graphics/Renderer';
import { Materials } from '../graphics/Materials';
import { CameraRig } from '../graphics/CameraRig';
import { City } from '../world/City';
import { Traffic } from '../world/Traffic';
import { CityMode } from '../gameplay/CityMode';
import { ArcadeMode, ARCADE_ORIGIN } from '../gameplay/ArcadeMode';
import { buildModelCar, buildProceduralCar, loadModel, type CarRig } from '../vehicles/CarFactory';
import { Input } from './Input';
import { Audio } from './Audio';
import { loadSave, writeSave, type CameraView, type GraphicsMode, type SaveData } from './Save';
import { BALANCE } from '../data/balancing';
import { STORY } from '../data/story';
import { GOALS } from '../data/goals';
import { MAX_UPGRADE, UPGRADE_TRACKS, VEHICLES, effectiveStats, vehicleById, type VehicleDef } from '../data/vehicles';
import { buyUpgrade, buyVehicle, claimGoal, claimableGoals, convertArcadePoints, goalProgress, recordArcadeRun, selectVehicle, upgradeCost, upgradesOf, xpToNext } from '../gameplay/Economy';
import type { Job } from '../gameplay/Jobs';
import { Tutorial } from '../ui/Tutorial';
import { Minimap } from '../ui/Minimap';

type State = 'loading' | 'menu' | 'city' | 'arcade' | 'over';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const money = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const VIEW_LABEL: Record<CameraView, string> = { cockpit: 'Cockpit cam', chase: 'Chase cam', top: 'Top-down' };

export class Game {
  readonly save: SaveData = loadSave();
  readonly input = new Input();
  readonly audio = new Audio();
  readonly gfx: GameRenderer;
  readonly mats = new Materials();
  readonly cam = new CameraRig();
  city!: City;
  traffic!: Traffic;
  cityMode!: CityMode;
  arcade!: ArcadeMode;
  rig!: CarRig;
  state: State = 'loading';
  paused = false;
  private sessionMode: 'story' | 'free' | null = null;
  private tutorial: Tutorial;
  private minimap = new Minimap($<HTMLCanvasElement>('minimap'));
  private clock = new THREE.Clock();
  private time = 0;
  private saveTimer = 0;
  private menuAngle = 0;
  private previewId: string | null = null;
  private garageSel: string;
  private lastWallet = -1;

  constructor() {
    this.gfx = new GameRenderer($<HTMLCanvasElement>('c'));
    this.garageSel = this.save.selected;
    this.audio.setEnabled(this.save.settings.audio);
    this.tutorial = new Tutorial(() => { this.save.tutorialDone = true; this.persist(); });
    (window as any).__game = this;
  }

  async init() {
    const bar = $('load-bar'), txt = $('load-text');
    const progress = (f: number, t: string) => { bar.style.width = `${Math.round(f * 100)}%`; txt.textContent = t; };
    progress(0.05, 'Building city…');
    await nextFrame();
    this.city = new City(this.mats);
    this.traffic = new Traffic(46);
    this.gfx.scene.add(this.city.group, this.traffic.group);
    progress(0.25, 'Loading sky and lighting…');
    await this.gfx.loadEnvironment((f) => progress(0.25 + f * 0.3, 'Loading sky and lighting…'));
    progress(0.6, 'Loading photoreal materials…');
    await this.mats.loadPhotoreal();
    progress(0.8, 'Preparing vehicles…');
    // warm the authored model cache so Photoreal garage cars appear instantly
    await Promise.all(VEHICLES.filter((v) => v.model).map((v) => loadModel(v.model!)));
    this.rig = await this.buildRig(vehicleById(this.save.selected));
    this.gfx.scene.add(this.rig.root);
    this.cityMode = new CityMode(this.city, this.traffic, this.rig, this.save, this.cityEvents());
    this.gfx.scene.add(this.cityMode.markers);
    this.arcade = new ArcadeMode(this.mats, this.rig);
    this.arcade.events = this.arcadeEvents();
    this.gfx.scene.add(this.arcade.group);
    // ?gfx=rendered|photoreal overrides the saved choice (handy for testing / weak devices)
    const q = new URLSearchParams(location.search).get('gfx');
    this.applyGraphics(q === 'rendered' || q === 'photoreal' ? q : this.save.settings.graphics);
    this.cam.setView(this.save.settings.camera);
    this.bindUI();
    progress(1, 'Ready');
    $('loading').hidden = true;
    this.showMenu();
    this.clock.start();
    this.gfx.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- vehicles
  private async buildRig(def: VehicleDef): Promise<CarRig> {
    const photoreal = this.save.settings.graphics === 'photoreal';
    const model = def.model ? await buildModelCar(def, photoreal) : null;
    return model ?? buildProceduralCar(def.body, def.color, { detail: true, photoreal });
  }

  private async swapRig(def: VehicleDef) {
    const old = this.rig;
    const rig = await this.buildRig(def);
    const parent = old.root.parent ?? this.gfx.scene;
    rig.root.position.copy(old.root.position);
    rig.root.rotation.copy(old.root.rotation);
    parent.remove(old.root);
    old.dispose();
    parent.add(rig.root);
    this.rig = rig;
    this.cityMode.setRig(rig);
    this.arcade.rig = rig;
    this.cam.cut();
  }

  // ---------------------------------------------------------------- modes
  private showMenu() {
    if (this.state === 'arcade') this.arcade.stop();
    this.state = 'menu';
    this.paused = false;
    $('menu').hidden = false;
    $('hud').hidden = true; $('arcade-hud').hidden = true; $('arcade-over').hidden = true; $('touch').hidden = true;
    $('tutorial').hidden = true; $('pointer').hidden = true; $('edge-arrow').hidden = true;
    this.closeModals();
    this.ensureCityRig();
    this.refreshMenu();
    this.tutorial.event('menuOpened');
  }

  private ensureCityRig() {
    if (this.rig.root.parent !== this.gfx.scene) { this.rig.root.parent?.remove(this.rig.root); this.gfx.scene.add(this.rig.root); }
    this.rig.root.visible = true;
    this.city.group.visible = this.traffic.group.visible = this.cityMode.markers.visible = true;
  }

  startCity(mode: 'story' | 'free') {
    this.audio.unlock();
    if (mode === 'story' && this.save.story.chapter >= STORY.length) this.toast('Story complete — replaying as Free Ride with bonus jobs', 'good');
    this.ensureCityRig();
    this.arcade.stop();
    $('menu').hidden = true; $('hud').hidden = false; $('arcade-hud').hidden = true; $('arcade-over').hidden = true;
    $('touch').hidden = !isTouch();
    if (this.sessionMode !== mode || !this.cityMode.job) { this.cityMode.start(mode); this.renderJob(null); }
    this.sessionMode = mode;
    this.state = 'city';
    this.cam.cut();
    this.updateCareer();
    if (!this.save.tutorialDone && !this.tutorial.active) this.tutorial.start();
    else if (this.tutorial.active) this.tutorial.show();
  }

  startArcade() {
    this.audio.unlock();
    this.closeModals();
    this.tutorial.active && this.tutorial.finish();
    $('menu').hidden = true; $('hud').hidden = true; $('arcade-over').hidden = true; $('arcade-hud').hidden = false;
    $('touch').hidden = true;
    $('edge-arrow').hidden = true;
    this.city.group.visible = this.traffic.group.visible = this.cityMode.markers.visible = false;
    this.rig.root.parent?.remove(this.rig.root);
    this.arcade.start(this.rig, vehicleById(this.save.selected));
    this.state = 'arcade';
    this.cam.cut();
  }

  // ---------------------------------------------------------------- loop
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    const inp = this.input;
    this.handleKeys();
    if (this.state === 'city' && !this.paused) {
      this.cityMode.update(dt, { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, handbrake: inp.handbrake });
    }
    if (this.state === 'city' || this.state === 'menu') {
      this.traffic.update(this.paused ? 0 : dt, this.time, { pos: this.cityMode.physics.pos, heading: this.cityMode.physics.heading });
      this.city.updateSignals(this.time);
    }
    if (this.state === 'arcade' && !this.paused) {
      const tap = inp.hit('KeyA', 'ArrowLeft', 'TouchLeft') ? 1 : inp.hit('KeyD', 'ArrowRight', 'TouchRight') ? -1 : 0;
      this.arcade.update(dt, tap, 0);
      this.updateArcadeHud();
    }

    // camera
    const focus = new THREE.Vector3();
    if (this.state === 'menu' || (this.paused && this.previewId !== null)) {
      this.menuAngle += dt * 0.15;
      this.rig.root.getWorldPosition(focus);
      const r = this.state === 'menu' ? 9.5 : 7.5;
      this.cam.camera.position.set(focus.x + Math.sin(this.menuAngle) * r, focus.y + 2.3, focus.z + Math.cos(this.menuAngle) * r);
      this.cam.camera.up.set(0, 1, 0);
      this.cam.camera.lookAt(focus.x, focus.y + 0.7, focus.z);
      this.cam.camera.fov = 45;
      this.cam.cut();
    } else {
      const heading = this.state === 'arcade' || this.state === 'over' ? this.rig.root.rotation.y * 0 : this.cityMode.physics.heading;
      const speed = this.state === 'city' ? this.cityMode.physics.speed : this.arcade.speed;
      this.cam.update(dt, this.rig.root, heading, this.rig.eye, speed, this.state === 'city' ? inp.steer : 0);
      this.rig.root.getWorldPosition(focus);
    }
    this.gfx.followSun(focus);

    // HUD + audio
    if (this.state === 'city') this.updateCityHud();
    const sp = this.state === 'city' ? this.cityMode.physics.speed : this.state === 'arcade' ? this.arcade.speed : 0;
    const top = effectiveStats(vehicleById(this.save.selected), upgradesOf(this.save, this.save.selected)).top;
    this.audio.engine(Math.min(1, sp / top), this.state === 'arcade' ? 0.7 : inp.throttle, (this.state === 'city' || this.state === 'arcade') && !this.paused);
    this.tutorial.update(dt, this.cam.camera, this.state === 'city' && this.cityMode.target ? new THREE.Vector3(this.cityMode.target.x, 0, this.cityMode.target.z) : null, this.paused);

    if ((this.saveTimer += dt) > 5) { this.saveTimer = 0; if (this.state === 'city') this.persist(); }
    this.gfx.render(this.cam.camera, dt);
    inp.consume();
  }

  private handleKeys() {
    const i = this.input;
    if (this.state === 'loading') return;
    if (i.hit('Escape')) {
      if (!$('garage').hidden || !$('goals').hidden) this.closeModals();
      else if (this.state === 'menu') { if (this.sessionMode) this.startCity(this.sessionMode); }
      else this.showMenu();
    }
    if (this.state === 'menu') return;
    if (i.hit('Digit1')) this.setView('cockpit');
    if (i.hit('Digit2')) this.setView('chase');
    if (i.hit('Digit3')) this.setView('top');
    if (i.hit('KeyV')) this.setView(this.cam.cycle());
    if (this.state === 'city') {
      if (i.hit('KeyG')) this.toggleGarage();
      if (i.hit('Enter', 'NumpadEnter')) this.acceptJob();
      if (i.hit('KeyN')) this.cityMode.decline();
      if (i.hit('KeyR')) this.cityMode.resetCar();
    }
    if (this.state === 'over' && i.hit('Enter', 'NumpadEnter', 'Space')) this.startArcade();
  }

  private setView(v: CameraView) {
    this.cam.setView(v);
    this.save.settings.camera = v;
    $('view-label').textContent = VIEW_LABEL[v];
    this.refreshMenu();
    this.persist();
  }

  applyGraphics(mode: GraphicsMode) {
    this.save.settings.graphics = mode;
    this.gfx.setMode(mode);
    this.mats.setMode(mode);
    this.rig.paint.clearcoat = mode === 'photoreal' ? 1 : 0.4;
    this.persist();
    this.refreshMenu();
    $('btn-gfx').textContent = mode === 'photoreal' ? 'Gfx: Photoreal' : 'Gfx: Rendered';
  }

  // ---------------------------------------------------------------- city events
  private cityEvents() {
    return {
      offer: (job: Job) => {
        this.renderJob(job);
        this.audio.click();
        if (job.chapter !== null) this.showStoryCard(job.chapter, 'intro');
      },
      stage: (job: Job) => {
        this.renderJob(job);
        if (job.stage === 'pickup') this.tutorial.event('accepted');
        if (job.stage === 'dropoff') {
          this.tutorial.event('pickedUp');
          this.audio.success();
          this.toast(job.food ? `Order collected from ${job.restaurant}` : `${job.customer} is on board`, 'good');
        }
      },
      complete: (job: Job, pay: { fare: number; tip: number; total: number; xp: number }, stars: number) => {
        const lvl = this.save.level;
        this.earnPop(`+${money(pay.total)}`, `★ ${stars.toFixed(1)}${pay.tip ? ` · tip ${money(pay.tip)}` : ''} · +${pay.xp} XP`);
        this.audio.coin(); this.audio.success();
        if (job.chapter !== null) { this.showStoryCard(job.chapter, 'outro'); }
        this.renderJob(null);
        this.updateCareer();
        if (this.save.level > lvl) { this.toast(`LEVEL UP! Level ${this.save.level}`, 'good'); this.audio.levelUp(); }
        this.tutorial.event('delivered');
        this.persist();
      },
      storyDone: () => { this.toast('Story complete! Keep earning in Free Ride.', 'good'); },
      bump: (s: number) => { this.cam.bump(s); s > 0.3 ? this.audio.crash() : this.audio.bump(); },
      toast: (m: string) => this.toast(m),
    };
  }

  private acceptJob() {
    if (this.cityMode.job?.stage === 'offer') { this.cityMode.accept(); this.audio.click(); }
  }

  private showStoryCard(ch: number, kind: 'intro' | 'outro') {
    const c = STORY[ch];
    $('sc-title').textContent = c.title + (kind === 'outro' ? ' · COMPLETE' : '');
    $('sc-name').textContent = kind === 'intro' ? c.passenger : 'Chapter complete';
    $('sc-line').textContent = kind === 'intro' ? c.intro + (c.bonusTime ? `  (Tip bonus if delivered within ${c.bonusTime}s)` : '') : c.outro;
    const card = $('story-card');
    card.hidden = false;
    clearTimeout((card as any)._t);
    (card as any)._t = setTimeout(() => (card.hidden = true), kind === 'intro' ? 7000 : 5000);
  }

  private renderJob(job: Job | null) {
    const tag = $('job-tag'), title = $('job-title'), det = $('job-detail'), fare = $('job-fare'), btns = $('offer-buttons');
    if (!job) {
      tag.textContent = this.cityMode?.mode === 'story' ? 'STORY MODE' : 'ONLINE · FREE RIDE';
      tag.className = 'tag';
      title.textContent = 'Waiting for the next request…'; det.textContent = ''; fare.textContent = ''; btns.hidden = true;
      $('nav').hidden = true;
      return;
    }
    const kind = job.food ? 'FOOD DELIVERY' : job.premium ? 'PREMIUM RIDE' : 'RIDE REQUEST';
    tag.className = job.premium ? 'tag premium' : 'tag';
    const def = vehicleById(this.save.selected);
    if (job.stage === 'offer') {
      tag.textContent = (job.chapter !== null ? STORY[job.chapter].title + ' · ' : 'NEW ') + kind;
      title.textContent = job.food ? `${job.restaurant} → ${job.b.name}` : `${job.customer}`;
      det.innerHTML = `Pickup: <b>${job.food ? job.restaurant + ' @ ' : ''}${job.a.name}</b><br>Drop-off: <b>${job.b.name}</b><br>~${(this.estimateDistance(job) / 1000).toFixed(1)} km`;
      fare.textContent = money(Math.round(job.fare * def.fare * 100) / 100);
      btns.hidden = false;
      $<HTMLButtonElement>('decline').disabled = job.chapter !== null;
    } else {
      tag.textContent = job.stage === 'pickup' ? (job.food ? '● COLLECT ORDER' : '● PICK UP PASSENGER') : (job.food ? '● DELIVER ORDER' : '● DROP OFF PASSENGER');
      title.textContent = job.stage === 'pickup' ? (job.food ? `${job.restaurant} @ ${job.a.name}` : job.a.name) : job.b.name;
      det.textContent = job.stage === 'pickup' ? `${job.food ? 'Order for' : 'Passenger:'} ${job.customer}` : `Then you're paid ${money(Math.round(job.fare * def.fare * 100) / 100)}${job.bonusTime ? ` · tip bonus under ${job.bonusTime}s` : ''}`;
      fare.textContent = '';
      btns.hidden = true;
      $('nav').hidden = false;
    }
  }

  private estimateDistance(job: Job) { return Math.abs(job.a.x - job.b.x) + Math.abs(job.a.z - job.b.z); }

  private updateCityHud() {
    const ph = this.cityMode.physics;
    $('speed').textContent = String(Math.round(ph.speed * 3.6));
    const r = this.cityMode.route, t = this.cityMode.target, job = this.cityMode.job;
    if (r && t && job) {
      const nt = r.nextTurn;
      const rot = { left: 180, right: 0, straight: -90, arrive: -90, uturn: 90 }[nt.dir];
      $('nav-arrow').style.transform = `rotate(${rot}deg)`;
      const dist = (m: number) => (m > 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);
      $('nav-text').textContent = nt.dir === 'arrive' ? `Arrive at ${t.name}` : nt.dir === 'uturn' ? 'Make a U-turn' : `Turn ${nt.dir} in ${dist(nt.dist)}`;
      $('nav-dist').textContent = `${dist(r.length)} to ${job.stage === 'pickup' ? 'pickup' : 'drop-off'}`;
      const d = Math.hypot(ph.pos.x - t.x, ph.pos.z - t.z);
      const hold = $('hold');
      if (d < BALANCE.pickupRadius + 2) {
        hold.hidden = false;
        const slow = ph.speed < BALANCE.stopSpeed;
        $('hold-text').textContent = slow ? (job.stage === 'pickup' ? (job.food ? 'Collecting order…' : 'Passenger boarding…') : 'Arriving…') : 'Stop in the ring';
        $('hold-ring').style.strokeDashoffset = String(106.8 * (1 - this.cityMode.holdTime / BALANCE.boardTime));
      } else hold.hidden = true;
      this.edgeArrow(new THREE.Vector3(t.x, 2, t.z), job.stage === 'pickup' ? '#54ffd0' : '#ffb347');
    } else { $('hold').hidden = true; $('edge-arrow').hidden = true; }
    const tc = this.traffic.cars.filter((c) => Math.abs(c.pos.x - ph.pos.x) < 200 && Math.abs(c.pos.z - ph.pos.z) < 200).map((c) => ({ x: c.pos.x, z: c.pos.z }));
    this.minimap.draw(ph.pos, ph.heading, r?.points ?? null, t, tc, job?.stage === 'dropoff' ? '#ffb347' : '#54ffd0');
    if (this.save.wallet !== this.lastWallet) this.updateCareer();
  }

  /** Arrow on the screen edge pointing at an off-screen objective. */
  private edgeArrow(world: THREE.Vector3, color: string) {
    const a = $('edge-arrow');
    const v = world.clone().project(this.cam.camera);
    const behind = v.z > 1;
    let sx = v.x, sy = v.y;
    if (behind) { sx = -sx; sy = -sy; }
    const onScreen = !behind && Math.abs(sx) < 0.92 && Math.abs(sy) < 0.88;
    if (onScreen || this.cam.view === 'top') { a.hidden = true; return; }
    const ang = Math.atan2(-sy, sx);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const k = Math.min((cx - 40) / Math.abs(Math.cos(ang) || 1e-6), (cy - 50) / Math.abs(Math.sin(ang) || 1e-6));
    a.hidden = false;
    a.style.color = color;
    a.style.left = `${cx + Math.cos(ang) * k - 20}px`;
    a.style.top = `${cy + Math.sin(ang) * k - 24}px`;
    a.style.transform = `rotate(${ang}rad)`;
  }

  private updateCareer() {
    const s = this.save;
    const w = $('wallet');
    if (this.lastWallet >= 0 && s.wallet > this.lastWallet) { w.classList.add('pop'); setTimeout(() => w.classList.remove('pop'), 250); }
    this.lastWallet = s.wallet;
    w.textContent = money(Math.round(s.wallet * 100) / 100);
    $('level').textContent = `LV ${s.level}`;
    $('xp-bar').style.width = `${(s.xp / xpToNext(s.level)) * 100}%`;
    $('rating').textContent = `★ ${s.stats.rating.toFixed(2)}`;
    $('trips').textContent = `${s.stats.trips} trips`;
    $('km').textContent = `${s.stats.km.toFixed(1)} km`;
    const n = claimableGoals(s);
    for (const id of ['goals-badge', 'hud-goals-badge']) { const b = $(id); b.hidden = !n; b.textContent = String(n); }
  }

  // ---------------------------------------------------------------- arcade
  private arcadeEvents() {
    let bestBefore = 0;
    return {
      coin: (k: string) => {
        if (k === 'coin') this.audio.coin(1 + Math.min(0.5, this.arcade.multiplier * 0.04));
        else { this.audio.power(); this.popup(k === 'magnet' ? 'MAGNET!' : k === 'x2' ? 'DOUBLE SCORE!' : 'NITRO!', 'cyan'); }
      },
      nearMiss: (pts: number, streak: number) => {
        this.audio.whoosh();
        this.popup(`NEAR MISS +${pts}${streak % 4 === 0 ? `  ·  x${this.arcade.multiplier}!` : ''}`, 'gold');
        const m = $('a-mult'); m.classList.add('pulse'); setTimeout(() => m.classList.remove('pulse'), 150);
      },
      crash: (left: number) => {
        this.audio.crash(); this.cam.bump(1);
        this.popup(left > 0 ? 'CRASH! Streak lost' : 'WRECKED!', 'bad');
        const f = document.createElement('div'); f.className = 'flash'; document.body.appendChild(f); setTimeout(() => f.remove(), 600);
      },
      over: (score: number, near: number, coins: number) => {
        bestBefore = this.save.arcade.best;
        const pts = recordArcadeRun(this.save, this.arcade.runId, score, near);
        this.persist();
        setTimeout(() => this.showArcadeOver(score, near, coins, pts, score > bestBefore && score > 0), 900);
      },
      popup: (t: string, c?: string) => this.popup(t, c),
    };
  }

  private updateArcadeHud() {
    const a = this.arcade;
    $('a-score').textContent = Math.floor(a.score).toLocaleString();
    $('a-mult').textContent = `x${a.multiplier}`;
    $('a-streak').style.width = `${((a.streak % 4) / 4) * 100}%`;
    $('a-hearts').textContent = '♥'.repeat(Math.max(0, a.hearts)) + '♡'.repeat(Math.max(0, 3 - a.hearts));
    $('a-coins').textContent = `◎ ${a.coins}  ·  ${Math.round(a.speed * 3.6)} km/h`;
    const p: string[] = [];
    if (a.magnet > 0) p.push(`MAGNET ${a.magnet.toFixed(0)}s`);
    if (a.double > 0) p.push(`x2 ${a.double.toFixed(0)}s`);
    if (a.nitro > 0) p.push(`NITRO ${a.nitro.toFixed(1)}s`);
    $('a-power').textContent = p.join(' · ');
    $('a-count').textContent = a.countdown > 0 ? String(Math.ceil(a.countdown)) : a.time < 0.8 && a.running ? 'GO!' : '';
  }

  private showArcadeOver(score: number, near: number, coins: number, pts: number, best: boolean) {
    this.state = 'over';
    $('arcade-hud').hidden = true;
    $('arcade-over').hidden = false;
    $('o-score').textContent = score.toLocaleString();
    $('o-best').textContent = this.save.arcade.best.toLocaleString();
    $('o-near').textContent = String(near);
    $('o-coins').textContent = String(coins);
    $('newbest').hidden = !best;
    this.refreshPoints();
    $('o-points').textContent = `+${pts.toLocaleString()} arcade points · ${this.save.arcade.points.toLocaleString()} banked`;
    if (best) { this.confetti(); this.audio.levelUp(); }
  }

  private refreshPoints() {
    const p = this.save.arcade.points;
    const cash = Math.floor(p / BALANCE.arcadePointsPerUnit) * BALANCE.cashPerUnit;
    $<HTMLButtonElement>('o-convert').disabled = cash <= 0;
    $<HTMLButtonElement>('o-convert').textContent = cash > 0 ? `Convert → ${money(cash)}` : 'Convert points';
    $<HTMLButtonElement>('g-convert').disabled = cash <= 0;
    $('g-points').textContent = `${p.toLocaleString()} arcade points (100 = $5)`;
  }

  private convert() {
    const cash = convertArcadePoints(this.save);
    if (cash) { this.toast(`Converted to ${money(cash)} game cash`, 'good'); this.audio.coin(); this.persist(); }
    else this.toast('Earn at least 100 arcade points to convert', 'bad');
    this.refreshPoints();
    this.updateCareer();
    if (!$('garage').hidden) this.renderGarage();
    $('o-points').textContent = `${this.save.arcade.points.toLocaleString()} points banked · Wallet ${money(this.save.wallet)}`;
  }

  // ---------------------------------------------------------------- garage & goals
  private toggleGarage() { $('garage').hidden ? this.openGarage() : this.closeModals(); }

  private openGarage() {
    $('goals').hidden = true;
    $('garage').hidden = false;
    this.paused = true;
    this.previewId = this.save.selected;
    this.garageSel = this.save.selected;
    this.renderGarage();
    this.tutorial.event('garageOpened');
    this.audio.click();
  }

  private closeModals() {
    $('garage').hidden = true; $('goals').hidden = true;
    if (this.previewId && this.previewId !== this.save.selected) this.swapRig(vehicleById(this.save.selected));
    this.previewId = null;
    this.paused = false;
    this.cam.cut();
  }

  private async preview(id: string) {
    this.garageSel = id;
    this.renderGarage();
    if (id !== this.previewId) { this.previewId = id; await this.swapRig(vehicleById(id)); }
  }

  private renderGarage() {
    const s = this.save;
    $('g-wallet').textContent = money(Math.round(s.wallet * 100) / 100);
    this.refreshPoints();
    $('g-list').innerHTML = VEHICLES.map((v) => {
      const owned = s.owned.includes(v.id), locked = s.level < v.level;
      const status = s.selected === v.id ? '<span style="color:var(--accent)">EQUIPPED</span>' : owned ? 'Owned' : locked ? `🔒 LV ${v.level}` : money(v.cost);
      return `<div class="car-row ${this.garageSel === v.id ? 'sel' : ''} ${locked && !owned ? 'locked' : ''}" data-car="${v.id}">
        <div class="swatch" style="background:#${v.color.toString(16).padStart(6, '0')}"></div>
        <div class="nm"><b>${v.name}</b><small>${v.kind} · ${v.seats} seats${v.model ? ' · authored 3D model' : ''}</small></div>
        <div class="pr">${status}</div></div>`;
    }).join('');
    $('g-list').querySelectorAll<HTMLElement>('[data-car]').forEach((el) => el.addEventListener('click', () => this.preview(el.dataset.car!)));
    const v = vehicleById(this.garageSel);
    const owned = s.owned.includes(v.id);
    const up = upgradesOf(s, v.id), st = effectiveStats(v, up);
    const bar = (label: string, val: number, max: number) => `<span>${label}</span><div><i style="width:${Math.min(100, (val / max) * 100)}%"></i></div>`;
    const premium = ['Standard jobs', 'Premium passengers', 'VIP passengers'][v.premium];
    let action = '';
    if (s.selected === v.id) action = `<button class="action" disabled>Equipped</button>`;
    else if (owned) action = `<button class="action" id="g-equip">Equip</button>`;
    else if (s.level < v.level) action = `<button class="action" disabled>Unlocks at level ${v.level}</button>`;
    else action = `<button class="action" id="g-buy" ${s.wallet < v.cost ? 'disabled' : ''}>Buy for ${money(v.cost)}</button>`;
    $('g-detail').innerHTML = `<h3 style="margin:14px 0 4px">${v.name}</h3><div class="muted">${v.kind} · fare x${v.fare} · arcade x${v.arcade} · ${premium} · comfort ${'★'.repeat(v.comfort)}</div>
      <div class="stat-bars">${bar('Top speed', st.top, 110)}${bar('Acceleration', st.accel, 18)}${bar('Braking', st.brake, 20)}${bar('Grip', st.grip, 1.8)}</div>
      <div class="row">${action}</div>
      ${owned ? `<h4 style="margin:16px 0 4px">Upgrades</h4>` + UPGRADE_TRACKS.map((t) => {
        const lv = up[t.id], cost = upgradeCost(v, lv);
        return `<div class="up-row"><div class="nm">${t.label}<small>${t.blurb}</small></div><div class="pips">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <button class="action secondary small" data-up="${t.id}" ${lv >= MAX_UPGRADE || s.wallet < cost ? 'disabled' : ''}>${lv >= MAX_UPGRADE ? 'MAX' : money(cost)}</button></div>`;
      }).join('') : ''}`;
    $('g-equip')?.addEventListener('click', () => { const r = selectVehicle(s, v.id); this.afterGarage(r.msg, r.ok); });
    $('g-buy')?.addEventListener('click', () => { const r = buyVehicle(s, v.id); this.afterGarage(r.msg, r.ok); });
    $('g-detail').querySelectorAll<HTMLElement>('[data-up]').forEach((b) => b.addEventListener('click', () => {
      const r = buyUpgrade(s, v.id, b.dataset.up as any); this.afterGarage(r.msg, r.ok);
    }));
  }

  private afterGarage(msg: string, ok: boolean) {
    this.toast(msg, ok ? 'good' : 'bad');
    if (ok) { this.audio.success(); this.persist(); this.cityMode.refreshStats(); this.previewId = this.save.selected === this.garageSel ? this.garageSel : this.previewId; }
    this.renderGarage();
    this.updateCareer();
  }

  private openGoals() {
    $('garage').hidden = true;
    if (this.previewId && this.previewId !== this.save.selected) this.swapRig(vehicleById(this.save.selected));
    this.previewId = null;
    $('goals').hidden = false;
    this.paused = this.state !== 'menu';
    this.renderGoals();
  }

  private renderGoals() {
    const s = this.save;
    $('goals-list').innerHTML = GOALS.map((g) => {
      const p = Math.min(g.goal, goalProgress(s, g)), done = s.claimedGoals.includes(g.id), ready = !done && p >= g.goal;
      return `<div class="goal ${done ? 'done' : ''}"><b>${g.name}</b><div class="gbar"><i style="width:${(p / g.goal) * 100}%"></i></div>
        <div class="grow"><span>${g.kind === 'distance' ? p.toFixed(1) : Math.floor(p)} / ${g.goal} · ${money(g.reward)} + ${g.xp} XP</span>
        ${done ? '<span>Claimed ✓</span>' : `<button class="action small" data-goal="${g.id}" ${ready ? '' : 'disabled'}>Claim</button>`}</div></div>`;
    }).join('');
    $('goals-list').querySelectorAll<HTMLElement>('[data-goal]').forEach((b) => b.addEventListener('click', () => {
      const lvl = s.level;
      const r = claimGoal(s, b.dataset.goal!);
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) { this.audio.success(); this.persist(); if (s.level > lvl) this.toast(`LEVEL UP! Level ${s.level}`, 'good'); }
      this.renderGoals(); this.updateCareer(); this.refreshMenu();
    }));
  }

  // ---------------------------------------------------------------- menu & UI wiring
  private refreshMenu() {
    const s = this.save;
    $('story-progress').textContent = s.story.chapter >= STORY.length ? 'Complete ✓' : `Chapter ${s.story.chapter + 1} of ${STORY.length}`;
    $('arcade-best').textContent = `Best ${s.arcade.best.toLocaleString()}`;
    document.querySelectorAll<HTMLElement>('[data-gfx]').forEach((b) => b.classList.toggle('on', b.dataset.gfx === s.settings.graphics));
    document.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === s.settings.camera));
    $('menu-stats').textContent = `Level ${s.level} · ${money(Math.round(s.wallet))} wallet · ${s.stats.trips} trips · ${money(Math.round(s.stats.earned))} lifetime · ${s.arcade.points.toLocaleString()} arcade points · driving the ${vehicleById(s.selected).name}`;
    $('menu-audio').textContent = `Sound: ${s.settings.audio ? 'on' : 'off'}`;
    const n = claimableGoals(s);
    $('goals-badge').hidden = !n; $('goals-badge').textContent = String(n);
  }

  private bindUI() {
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', () => { this.audio.unlock(); fn(); (document.activeElement as HTMLElement)?.blur(); });
    on('mode-story', () => this.startCity('story'));
    on('mode-free', () => this.startCity('free'));
    on('mode-arcade', () => this.startArcade());
    on('menu-garage', () => this.openGarage());
    on('menu-goals', () => this.openGoals());
    on('menu-tutorial', () => { this.save.tutorialDone = false; this.tutorial.active = false; this.persist(); const m = this.sessionMode ?? 'free'; this.sessionMode = null; this.startCity(m); });
    on('menu-audio', () => { this.save.settings.audio = !this.save.settings.audio; this.audio.setEnabled(this.save.settings.audio); this.persist(); this.refreshMenu(); });
    document.querySelectorAll<HTMLElement>('[data-gfx]').forEach((b) => b.addEventListener('click', () => this.applyGraphics(b.dataset.gfx as GraphicsMode)));
    document.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.cam as CameraView)));
    on('accept', () => this.acceptJob());
    on('decline', () => this.cityMode.decline());
    on('btn-menu', () => this.showMenu());
    on('btn-garage', () => this.toggleGarage());
    on('btn-goals', () => ($('goals').hidden ? this.openGoals() : this.closeModals()));
    on('btn-camera', () => this.setView(this.cam.cycle()));
    on('btn-gfx', () => this.applyGraphics(this.save.settings.graphics === 'photoreal' ? 'rendered' : 'photoreal'));
    on('btn-reset', () => this.cityMode.resetCar());
    on('g-close', () => this.closeModals());
    on('goals-close', () => this.closeModals());
    on('g-convert', () => this.convert());
    on('o-convert', () => this.convert());
    on('o-again', () => this.startArcade());
    on('o-garage', () => this.openGarage());
    on('o-menu', () => this.showMenu());
    this.input.bindTouch($('touch'));
    // arcade swipe / tap
    let sx = 0;
    addEventListener('pointerdown', (e) => { sx = e.clientX; });
    addEventListener('pointerup', (e) => {
      if (this.state !== 'arcade' || (e.target as HTMLElement).closest('button')) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 30) this.input.press(dx < 0 ? 'TouchLeft' : 'TouchRight');
      else if (e.pointerType === 'touch') this.input.press(e.clientX < innerWidth / 2 ? 'TouchLeft' : 'TouchRight');
    });
    $('view-label').textContent = VIEW_LABEL[this.save.settings.camera];
  }

  // ---------------------------------------------------------------- feedback
  toast(msg: string, kind: 'good' | 'bad' | '' = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`; t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2900);
  }

  private popup(text: string, cls = '') {
    const p = document.createElement('div');
    p.className = `popup ${cls}`; p.textContent = text;
    p.style.top = `${26 + Math.random() * 8}%`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }

  private earnPop(main: string, sub: string) {
    const e = $('earn-pop');
    e.hidden = true; void e.offsetWidth;
    e.innerHTML = `${main}<small>${sub}</small>`;
    e.hidden = false;
    clearTimeout((e as any)._t);
    (e as any)._t = setTimeout(() => (e.hidden = true), 1900);
  }

  private confetti() {
    const c = $('confetti');
    for (let i = 0; i < 90; i++) {
      const b = document.createElement('i');
      b.style.left = `${Math.random() * 100}%`;
      b.style.background = ['#ffcf49', '#4cf0af', '#4cc3ff', '#ff5a6a', '#fff'][i % 5];
      b.style.animationDuration = `${1.6 + Math.random() * 1.8}s`;
      b.style.animationDelay = `${Math.random() * 0.5}s`;
      c.appendChild(b);
      setTimeout(() => b.remove(), 4200);
    }
  }

  persist() { writeSave(this.save); }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const isTouch = () => matchMedia('(pointer: coarse)').matches;
export { ARCADE_ORIGIN };
