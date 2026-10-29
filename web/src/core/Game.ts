// Top-level orchestrator: owns the renderer, world, modes, UI and save. Keeps modes independent of
// graphics quality and camera view (three separate selections).
import * as THREE from 'three';
import { GameRenderer } from '../graphics/Renderer';
import { Materials } from '../graphics/Materials';
import { CameraRig } from '../graphics/CameraRig';
import { City } from '../world/City';
import { Traffic } from '../world/Traffic';
import { CityMode } from '../gameplay/CityMode';
import { ArcadeMode, ARCADE_ORIGIN, POWER_LABEL, type PowerKind } from '../gameplay/ArcadeMode';
import { buildModelCar, buildProceduralCar, loadModel, setCarLights, type CarRig } from '../vehicles/CarFactory';
import { Rain } from '../graphics/Rain';
import { Input } from './Input';
import { Audio } from './Audio';
import { hasSave, loadSave, writeSave, type CameraView, type GraphicsMode, type SaveData, type TimeOfDay, type Weather } from './Save';
import { BALANCE } from '../data/balancing';
import { STORY } from '../data/story';
import { GOALS } from '../data/goals';
import { MAX_UPGRADE, UPGRADE_TRACKS, VEHICLES, effectiveStats, vehicleById, type VehicleDef } from '../data/vehicles';
import { nextStation, stationName } from '../data/radio';
import { CHALLENGE_REWARD, claimChallenge, claimDailyReward, dailyChallenge } from '../gameplay/Daily';
import { buyPowerUpgrade, MAX_POWER_LEVEL, powerUpgradeCost, buyUpgrade, buyVehicle, claimGoal, claimableGoals, convertArcadePoints, goalProgress, recordArcadeRun, arcadeXp, selectVehicle, upgradeCost, upgradesOf, xpToNext, type JobPayment } from '../gameplay/Economy';
import { COMPLIMENTS, PERSONAS, VARIANTS } from '../gameplay/Missions';
import { fetchWorldTop, leaderboardEnabled, submitWorldScore } from './Leaderboard';
import { platform } from './Platform';
import { OFFER_SECONDS, acceptanceRate, driverTier, earnings, nextTier } from '../gameplay/Driver';
import type { Job } from '../gameplay/Jobs';
import { Tutorial } from '../ui/Tutorial';
import { Minimap } from '../ui/Minimap';
import { carThumbs } from '../ui/CarThumbs';

type State = 'loading' | 'menu' | 'city' | 'arcade' | 'over';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const POWER_ICON: Record<PowerKind, string> = { magnet: '🧲', x2: '2×', nitro: '⚡', shield: '🛡️', jet: '🚀' };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const POWER_SHOP: [string, string][] = [['magnet', 'Magnet'], ['x2', 'Double score'], ['nitro', 'Nitro'], ['shield', 'Shield'], ['jet', 'Sky Boost']];
const money = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const GFX_LABEL: Record<GraphicsMode, string> = { rendered: 'Rendered', photoreal: 'Photoreal', hyper: 'Hyper-real' };
const VIEW_LABEL: Record<CameraView, string> = { cockpit: 'Cockpit cam', chase: 'Chase cam', top: 'Top-down' };

export class Game {
  /** True when no save existed yet (first launch on this device). */
  private readonly firstRun = !hasSave();
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
  private rain = new Rain();
  private hudTimer = 0;
  private screenTimer = 0;
  private navMap: Minimap | null = null;
  private slowWarned = false;

  constructor() {
    this.gfx = new GameRenderer($<HTMLCanvasElement>('c'));
    this.garageSel = this.save.selected;
    this.audio.setEnabled(this.save.settings.audio);
    this.audio.setVolume(this.save.settings.volume);
    this.audio.setStation(this.save.settings.station);
    // first launch on a phone, tablet or low-memory device starts on the light graphics tier
    if (this.firstRun && lowEndDevice()) this.save.settings.graphics = 'rendered';
    // browsers only allow sound after a gesture: the first tap or key press starts the menu music
    const firstGesture = () => { this.audio.unlock(); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
    addEventListener('pointerdown', firstGesture);
    addEventListener('keydown', firstGesture);
    document.addEventListener('visibilitychange', () => {
      this.audio.setSuspended(document.hidden);
      if (document.hidden) this.toggleArcadePause(true); // switching tab/app mid-run pauses it
    });
    addEventListener('blur', () => this.toggleArcadePause(true));
    this.tutorial = new Tutorial(() => { this.save.tutorialDone = true; this.persist(); });
    (window as any).__game = this;
  }

  async init() {
    const bar = $('load-bar'), txt = $('load-text');
    const progress = (f: number, t: string) => { bar.style.width = `${Math.round(f * 100)}%`; txt.textContent = t; };
    const sdk = platform.init();
    // ads pause the game and silence it
    platform.onAd = (on) => { this.audio.setSuspended(on || document.hidden); if (on) this.paused = this.state === 'city' || this.state === 'arcade' ? true : this.paused; };
    progress(0.05, 'Building city…');
    await nextFrame();
    this.city = new City(this.mats);
    this.traffic = new Traffic(46);
    this.gfx.scene.add(this.city.group, this.traffic.group);
    progress(0.25, 'Loading sky and lighting…');
    await this.gfx.loadEnvironment((f) => progress(0.25 + f * 0.3, 'Loading sky and lighting…'));
    // ?gfx=rendered|photoreal|hyper overrides the saved choice (handy for testing / weak devices)
    const q = new URLSearchParams(location.search).get('gfx');
    const startMode: GraphicsMode = q === 'rendered' || q === 'photoreal' || q === 'hyper' ? q : this.save.settings.graphics;
    // scanned textures (~8 MB) are only fetched when a photoreal tier is actually used
    if (startMode !== 'rendered') {
      progress(0.6, 'Loading photoreal materials…');
      await this.ensurePhotoreal();
    }
    progress(0.8, 'Preparing vehicles…');
    this.rig = await this.buildRig(vehicleById(this.save.selected));
    this.gfx.scene.add(this.rig.root);
    this.cityMode = new CityMode(this.city, this.traffic, this.rig, this.save, this.cityEvents());
    this.gfx.scene.add(this.cityMode.markers);
    this.arcade = new ArcadeMode(this.mats, this.rig);
    this.arcade.events = this.arcadeEvents();
    this.gfx.scene.add(this.arcade.group);
    // the road surface, its paint and the lamp pools must not reflect themselves
    const flat = new Set<THREE.Material>([this.mats.asphalt, this.mats.paintWhite, this.mats.paintYellow, this.mats.lampPool]);
    for (const g of [this.city.group, this.arcade.group]) g.traverse((o) => { const m = (o as THREE.Mesh).material; if (m && !Array.isArray(m) && flat.has(m)) this.gfx.reflection.hide(o); });
    this.gfx.reflection.hide(this.rain.mesh);
    this.gfx.scene.add(this.rain.mesh);
    this.gfx.onSlow = () => {
      if (this.slowWarned || this.save.settings.graphics === 'rendered') return;
      this.slowWarned = true;
      this.toast(`Your device is struggling with ${this.save.settings.graphics === 'hyper' ? 'Hyper-real' : 'Photoreal'} — try a lower graphics setting (⚙)`, 'bad');
    };
    await this.applyGraphics(startMode);
    this.cam.setView(this.save.settings.camera);
    this.bindUI();
    progress(1, 'Ready');
    await sdk;
    $('loading').hidden = true;
    this.showMenu();
    platform.loadingFinished();
    this.clock.start();
    this.gfx.renderer.setAnimationLoop(() => this.frame());
    // street detail (Poly Haven props + photographic trees) streams in after the menu is up
    this.city.loadDetail().then(() => this.applyLampGlass()).catch((e) => console.warn('street detail failed', e));
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
    this.applyRigLook();
    this.cam.cut();
  }

  // ---------------------------------------------------------------- modes
  private showMenu() {
    if (this.state === 'arcade') this.arcade.stop();
    this.arcadePaused = false; $('arcade-paused').hidden = true;
    this.state = 'menu';
    this.paused = false;
    document.body.classList.remove('playing');
    $('menu').hidden = false;
    $('hud').hidden = true; $('arcade-hud').hidden = true; $('arcade-over').hidden = true; $('touch').hidden = true;
    $('tutorial').hidden = true; $('pointer').hidden = true; $('edge-arrow').hidden = true;
    this.closeModals();
    this.ensureCityRig();
    this.refreshMenu();
    const daily = claimDailyReward(this.save);
    if (daily) {
      this.persist(); this.updateCareer(); this.refreshMenu();
      this.toast(`Daily reward: ${money(daily.amount)}${daily.streak > 1 ? ` · ${daily.streak}-day streak` : ''} (come back tomorrow for more)`, 'good');
    }
    this.tutorial.event('menuOpened');
    this.maybeShowFullscreenTip();
    this.audio.music('menu');
  }

  private ensureCityRig() {
    if (this.rig.root.parent !== this.gfx.scene) { this.rig.root.parent?.remove(this.rig.root); this.gfx.scene.add(this.rig.root); }
    this.rig.root.visible = true;
    this.city.group.visible = this.traffic.group.visible = this.cityMode.markers.visible = true;
  }

  startCity(mode: 'story' | 'free') {
    this.audio.unlock();
    goFullscreen();
    if (mode === 'story' && this.save.story.chapter >= STORY.length) this.toast('Story complete — replaying as Free Ride with bonus jobs', 'good');
    this.ensureCityRig();
    this.arcade.stop();
    $('menu').hidden = true; $('hud').hidden = false; $('arcade-hud').hidden = true; $('arcade-over').hidden = true;
    $('touch').hidden = !isTouch();
    if (this.sessionMode !== mode || !this.cityMode.job) { this.cityMode.start(mode); this.renderJob(null); }
    this.sessionMode = mode;
    this.state = 'city';
    document.body.classList.add('playing');
    this.audio.music('city');
    this.cam.cut();
    this.updateCareer();
    if (!this.save.tutorialDone && !this.tutorial.active) this.tutorial.start();
    else if (this.tutorial.active) this.tutorial.show();
  }

  startArcade() {
    this.audio.unlock();
    goFullscreen();
    this.closeModals();
    this.tutorial.active && this.tutorial.finish();
    $('menu').hidden = true; $('hud').hidden = true; $('arcade-over').hidden = true; $('arcade-hud').hidden = false;
    $('touch').hidden = true;
    $('edge-arrow').hidden = true;
    this.city.group.visible = this.traffic.group.visible = this.cityMode.markers.visible = false;
    this.rig.root.parent?.remove(this.rig.root);
    this.arcadePaused = false; $('arcade-paused').hidden = true; $('a-pause').hidden = false;
    this.arcade.powerLevels = { ...this.save.arcade.powers };
    this.arcade.start(this.rig, vehicleById(this.save.selected));
    this.state = 'arcade';
    document.body.classList.add('playing');
    this.audio.music('arcade');
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
    if (this.state === 'arcade' && this.arcade.running && this.arcade.time > 60) this.audio.music('arcade-climax');
    if (this.state === 'arcade' && !this.paused) {
      const tap = inp.hit('KeyA', 'ArrowLeft', 'TouchLeft') ? 1 : inp.hit('KeyD', 'ArrowRight', 'TouchRight') ? -1 : 0;
      this.arcade.update(dt, tap, 0);
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
      const panel = $('garage');
      const shift = !panel.hidden && innerWidth > 700 ? panel.offsetWidth / 2 : 0;
      if (shift) this.cam.camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight);
      else if (this.cam.camera.view?.enabled) this.cam.camera.clearViewOffset();
      this.cam.cut();
    } else {
      if (this.cam.camera.view?.enabled) this.cam.camera.clearViewOffset();
      const heading = this.state === 'arcade' || this.state === 'over' ? this.rig.root.rotation.y * 0 : this.cityMode.physics.heading;
      const speed = this.state === 'city' ? this.cityMode.physics.speed : this.arcade.speed;
      this.cam.update(dt, this.rig.root, heading, this.rig.eye, speed, this.state === 'city' ? inp.steer : 0);
      this.rig.root.getWorldPosition(focus);
    }
    this.gfx.followSun(focus, this.cam.camera);
    this.rain.update(dt, this.cam.camera);
    this.gfx.updateReflections(this.rig.root, this.rig.paint);
    const st = this.save.settings;
    const cockpit = this.cam.view === 'cockpit' && (this.state === 'city' || this.state === 'arcade') && !(this.paused && this.previewId !== null);
    const glassRain = cockpit && st.weather === 'rain' && st.graphics !== 'rendered';
    this.gfx.cockpitRain.amount = glassRain ? 0.85 : 0;
    if (glassRain) {
      const gb = this.rig.glassBase.clone().applyMatrix4(this.rig.root.matrixWorld).project(this.cam.camera);
      this.gfx.cockpitRain.dashY = THREE.MathUtils.clamp(gb.y * 0.5 + 0.5, 0, 0.9);
    }
    // no duplicate map: in the cockpit the nav map lives on the dashboard screen
    $('minimap').hidden = cockpit && !!this.rig.screens;

    // HUD + audio (DOM work throttled to ~20 Hz; the 3D view still runs every frame)
    if ((this.hudTimer -= dt) <= 0) {
      this.hudTimer = 0.05;
      if (this.state === 'city') this.updateCityHud();
      if (this.state === 'arcade') this.updateArcadeHud();
      if (this.save.settings.showFps) $('fps').textContent = `${this.gfx.stats.fps} fps · ${Math.round(this.gfx.stats.scale * 100)}% res · ${this.gfx.stats.calls} draws`;
    }
    if (this.state === 'city' && this.cam.view === 'cockpit' && (this.screenTimer -= dt) <= 0) { this.screenTimer = 0.1; this.drawCarScreens(); }
    const sp = this.state === 'city' ? this.cityMode.physics.speed : this.state === 'arcade' ? this.arcade.speed : 0;
    this.gfx.speed01 = this.state === 'arcade' ? Math.min(1, sp / 70) : this.state === 'city' ? Math.min(1, Math.max(0, sp - 15) / 40) : 0;
    const top = effectiveStats(vehicleById(this.save.selected), upgradesOf(this.save, this.save.selected)).top;
    this.audio.engine(Math.min(1, sp / top), this.state === 'arcade' ? 0.7 : inp.throttle, (this.state === 'city' || this.state === 'arcade') && !this.paused);
    const driving = (this.state === 'city' || this.state === 'arcade') && !this.paused;
    const rain = this.save.settings.weather === 'rain' ? 1 : 0;
    this.audio.ambience(this.state === 'city' && !this.paused ? 1 : this.state === 'menu' ? 0.4 : 0, driving || this.state === 'menu' ? rain : 0);
    if (this.state === 'city' && driving) {
      const ph = this.cityMode.physics;
      const wet = rain ? 0.4 : 1; // wet tyres hiss rather than squeal
      this.audio.skid(wet * (Math.max(0, Math.abs(ph.vLat) - 1.5) / 4 + (ph.braking && ph.vLong > 12 ? 0.5 : 0) + Math.max(0, Math.abs(ph.accelLat) - 8) / 6));
    } else this.audio.skid(0);
    this.tutorial.update(dt, this.cam.camera, this.state === 'city' && this.cityMode.target ? new THREE.Vector3(this.cityMode.target.x, 0, this.cityMode.target.z) : null, this.paused);

    platform.gameplay((this.state === 'city' || this.state === 'arcade') && !this.paused && !document.hidden);
    if ((this.saveTimer += dt) > 5) { this.saveTimer = 0; if (this.state === 'city') this.persist(); }
    this.gfx.render(this.cam.camera, dt);
    inp.consume();
  }

  private handleKeys() {
    const i = this.input;
    if (this.state === 'loading') return;
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text') return; // typing a name
    if (this.state === 'arcade' && i.hit('Escape', 'KeyP')) { this.toggleArcadePause(); return; }
    if (i.hit('Escape')) {
      if (!$('garage').hidden || !$('goals').hidden || !$('settings').hidden || !$('credits').hidden) this.closeModals();
      else if (this.state === 'menu') { if (this.sessionMode) this.startCity(this.sessionMode); }
      else this.showMenu();
    }
    if (this.state === 'menu') return;
    if (i.hit('Digit1')) this.setView('cockpit');
    if (i.hit('Digit2')) this.setView('chase');
    if (i.hit('Digit3')) this.setView('top');
    if (i.hit('KeyV')) this.setView(this.cam.cycle());
    if (i.hit('KeyB')) this.nextRadio();
    if (this.state === 'city') {
      if (i.hit('KeyG')) this.toggleGarage();
      if (i.hit('Enter', 'NumpadEnter')) this.acceptJob();
      if (i.hit('KeyN')) this.declineJob();
      if (i.hit('KeyR')) this.cityMode.resetCar();
    }
    if (this.state === 'over' && i.hit('Enter', 'NumpadEnter', 'Space') && !(document.activeElement instanceof HTMLInputElement)) this.arcadeAgain();
  }

  private setView(v: CameraView) {
    this.cam.setView(v);
    this.showViewHint(v);
    this.save.settings.camera = v;
    $('view-label').textContent = VIEW_LABEL[v];
    this.refreshMenu();
    this.persist();
  }

  private showViewHint(v: CameraView) {
    if (this.state !== 'city' && this.state !== 'arcade') return;
    const touch = isTouch();
    const steer = this.state === 'arcade' ? (touch ? 'swipe ◀ ▶ to change lane' : '<b>A / D</b> change lane') : touch ? '◀ ▶ steer · ▲ gas · ▼ brake' : '<b>W</b> gas · <b>A / D</b> steer · <b>S</b> brake/reverse · <b>Space</b> handbrake';
    const extra = {
      cockpit: this.rig.screens ? 'Map and speed are on your dashboard screens' : 'Map bottom-left',
      chase: 'Map bottom-left · <b>V</b> next view',
      top: 'The map turns with your car, so left and right on screen always match your steering',
    }[v];
    const el = $('view-hint');
    el.hidden = true; void el.offsetWidth;
    el.innerHTML = `<b>${VIEW_LABEL[v]}</b> · ${steer}<br>${extra}`;
    el.hidden = false;
    clearTimeout((el as any)._t);
    (el as any)._t = setTimeout(() => (el.hidden = true), 3600);
  }

  private photoreal: Promise<void> | null = null;
  private ensurePhotoreal() { return (this.photoreal ??= this.mats.loadPhotoreal()); }

  /** Graphics tier, time of day and weather are independent of gameplay and never touch the save's progress. */
  async applyGraphics(mode: GraphicsMode = this.save.settings.graphics, time: TimeOfDay = this.save.settings.time, weather: Weather = this.save.settings.weather) {
    if (mode !== 'rendered' && !this.photoreal) {
      this.toast('Loading photoreal textures…');
      await this.ensurePhotoreal();
    }
    Object.assign(this.save.settings, { graphics: mode, time, weather });
    this.persist();
    this.refreshMenu();
    this.refreshSettings();
    $('btn-gfx').textContent = `Gfx: ${GFX_LABEL[mode]}`;
    const night = time === 'night';
    this.mats.setMode(mode);
    this.mats.setWeather(weather);
    this.mats.setTime(time);
    this.city.setMode(mode);
    this.applyLampGlass();
    setCarLights(night);
    this.rain.mesh.visible = weather === 'rain' && mode !== 'rendered';
    this.rain.night = night;
    this.applyRigLook();
    await this.gfx.configure(mode, time, weather);
  }

  private applyLampGlass() {
    const t = this.save.settings.time;
    for (const m of this.city.lampGlass) { m.emissiveIntensity = t === 'night' ? 5 : t === 'sunset' ? 1.5 : 0; m.needsUpdate = true; }
  }

  private applyRigLook() {
    const s = this.save.settings;
    this.rig.paint.clearcoat = s.graphics === 'rendered' ? 0.4 : 1;
    this.rig.paint.clearcoatRoughness = s.weather === 'dry' ? 0.04 : 0.02;
    this.rig.headlights.visible = s.time === 'night' || s.weather === 'rain';
  }

  /** Cockpit displays: live nav map on the centre screen and speed on the cluster. */
  private drawCarScreens() {
    const sc = this.rig.screens;
    if (!sc) return;
    const ph = this.cityMode.physics, r = this.cityMode.route, t = this.cityMode.target;
    if (!this.navMap || (this.navMap as any).canvas !== sc.nav.canvas) this.navMap = new Minimap(sc.nav.canvas, false);
    const tc = this.traffic.cars.filter((c) => Math.abs(c.pos.x - ph.pos.x) < 150 && Math.abs(c.pos.z - ph.pos.z) < 150).map((c) => ({ x: c.pos.x, z: c.pos.z }));
    this.navMap.draw(ph.pos, ph.heading, r?.points ?? null, t, tc, this.cityMode.job?.stage === 'dropoff' ? '#ffb347' : '#54ffd0');
    const g = sc.nav.canvas.getContext('2d')!;
    if (r) { g.fillStyle = 'rgba(8,14,22,0.85)'; g.fillRect(0, 0, 256, 30); g.fillStyle = '#fff'; g.font = 'bold 17px sans-serif'; g.fillText($('nav-text').textContent ?? '', 10, 21); }
    sc.nav.tex.needsUpdate = true;
    const c = sc.cluster.canvas.getContext('2d')!;
    c.fillStyle = '#05080c'; c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#e8f4ff'; c.font = 'bold 56px sans-serif'; c.textAlign = 'center';
    c.fillText(String(Math.round(ph.speed * 3.6)), 128, 62);
    c.font = '600 13px sans-serif'; c.fillStyle = '#7fd8ff'; c.fillText(ph.vLong < -0.3 ? 'R · km/h' : 'D · km/h', 128, 84);
    const w = Math.min(1, ph.speed / ph.stats.top);
    c.fillStyle = '#1b2a36'; c.fillRect(20, 8, 216, 5); c.fillStyle = '#4cf0af'; c.fillRect(20, 8, 216 * w, 5);
    c.textAlign = 'left';
    sc.cluster.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- city events
  private cityEvents() {
    return {
      offer: (job: Job | null) => {
        this.renderJob(job);
        if (!job) return;
        this.audio.click();
        if (job.chapter !== null) this.showStoryCard(job.chapter, 'intro');
      },
      stage: (job: Job) => {
        this.renderJob(job);
        if (job.stage === 'pickup') this.tutorial.event('accepted');
        if (job.stage === 'dropoff') {
          this.tutorial.event('pickedUp');
          this.audio.chime();
          this.toast(job.food ? `Order collected from ${job.restaurant}` : `${job.customer} is on board`, 'good');
        }
      },
      complete: (job: Job, pay: JobPayment, stars: number) => {
        const lvl = this.save.level;
        this.earnPop(`+${money(pay.total)}`, `★ ${stars.toFixed(1)}${pay.tip ? ` · tip ${money(pay.tip)}` : ''} · +${pay.xp} XP${pay.note ? ` · ${pay.note}` : ''}`);
        this.audio.cash(); this.audio.success();
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
      say: (who: string, text: string) => this.say(who, text),
      station: () => this.audio.currentStation,
    };
  }

  /** Car radio: next station, remembered in the save. */
  private nextRadio() {
    const s = nextStation(this.audio.currentStation);
    this.save.settings.station = s;
    this.audio.setStation(s);
    this.persist();
    const now = this.audio.nowPlaying;
    this.toast(`📻 ${stationName(s)}${now ? ` · ${now.title} – ${now.artist}` : ''}`);
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
    if (this.save) this.updateCareer(); // acceptance rate / tier can change with every offer
    const tag = $('job-tag'), title = $('job-title'), det = $('job-detail'), fare = $('job-fare'), btns = $('offer-buttons');
    if (!job) {
      tag.textContent = this.cityMode?.mode === 'story' ? 'STORY MODE' : 'ONLINE · FREE RIDE';
      tag.className = 'tag';
      title.textContent = 'Waiting for the next request…'; det.textContent = ''; fare.textContent = ''; btns.hidden = true;
      $('nav').hidden = true;
      return;
    }
    const v = VARIANTS[job.variant];
    const kind = (v.label ? v.label + (job.surge ? ` ×${job.surge}` : '') + ' · ' : '') + (job.food ? 'FOOD DELIVERY' : job.premium ? 'PREMIUM RIDE' : 'RIDE REQUEST');
    tag.className = job.premium || job.variant === 'vip' ? 'tag premium' : job.variant !== 'standard' ? 'tag special' : 'tag';
    const def = vehicleById(this.save.selected);
    if (job.stage === 'offer') {
      tag.textContent = (job.chapter !== null ? STORY[job.chapter].title + ' · ' : 'NEW ') + kind;
      title.textContent = job.food ? `${job.restaurant} → ${job.b.name}` : `${job.customer}`;
      const who = job.persona ? ` · ${PERSONAS[job.persona].label}` : '';
      det.innerHTML = `Pickup: <b>${job.food ? job.restaurant + ' @ ' : ''}${job.a.name}</b><br>Drop-off: <b>${job.b.name}</b><br>~${(this.estimateDistance(job) / 1000).toFixed(1)} km${who}${v.blurb ? `<br><span class="hint">${v.blurb}${job.limit ? ` (${job.limit}s)` : ''}</span>` : ''}`;
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

  private chatTimer = 0;
  /** Passenger speech bubble under the job card. */
  private say(who: string, text: string) {
    $('chat-who').textContent = who;
    $('chat-line').textContent = text;
    const el = $('chat');
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.chatTimer);
    this.chatTimer = window.setTimeout(() => { el.hidden = true; }, 4500);
  }

  /** Live mission line on the job card: countdown for timed jobs, comfort for VIP / fragile. */
  private updateMissionLive(job: Job | null) {
    const el = $('job-live');
    if (!job || job.stage !== 'dropoff' || job.chapter !== null) { el.hidden = true; return; }
    el.hidden = false;
    if (job.limit !== undefined) {
      const left = Math.ceil(job.limit - (this.cityMode.time - (job.pickedAt ?? 0)));
      el.textContent = left > 0 ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} for the ${job.variant === 'hot' ? 'hot-food tip' : 'express bonus'}` : '⏱ Bonus missed, still get there!';
      el.className = `live ${left > 10 ? '' : 'warn'}`;
    } else if (job.variant === 'vip' || job.variant === 'fragile') {
      const c = Math.round(job.log.comfort * 100);
      el.textContent = `${job.variant === 'vip' ? 'Ride comfort' : 'Order intact'}: ${c}%`;
      el.className = `live ${c >= 70 ? '' : 'warn'}`;
    } else if (job.persona) {
      el.textContent = `${job.customer.split(' ')[0]} is ${PERSONAS[job.persona].label}`;
      el.className = 'live';
    } else el.hidden = true;
  }

  /** Decline the current offer and clear the card straight away (the next request follows shortly). */
  private declineJob() {
    this.cityMode.decline();
    if (!this.cityMode.job) this.renderJob(null);
  }

  private estimateDistance(job: Job) { return Math.abs(job.a.x - job.b.x) + Math.abs(job.a.z - job.b.z); }

  private updateCityHud() {
    const ph = this.cityMode.physics;
    $('speed').textContent = String(Math.round(ph.speed * 3.6));
    const r = this.cityMode.route, t = this.cityMode.target, job = this.cityMode.job;
    this.updateMissionLive(job);
    // offer countdown bar, and the offline cool-down after too many declines
    const exp = $('job-expiry');
    exp.hidden = !(job?.stage === 'offer' && job.expires !== undefined);
    if (!exp.hidden) (exp.firstElementChild as HTMLElement).style.width = `${Math.max(0, job!.expires! / OFFER_SECONDS) * 100}%`;
    const off = this.cityMode.offlineLeft;
    if (!job && off > 0) {
      $('job-tag').textContent = 'OFFLINE'; $('job-tag').className = 'tag offline';
      $('job-title').textContent = 'Taken offline';
      $('job-detail').textContent = `Too many declined requests. Back online in ${Math.floor(off / 60)}:${String(off % 60).padStart(2, '0')}.`;
    } else if (!job && $('job-tag').textContent === 'OFFLINE') this.renderJob(null);
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
    this.minimap.draw(ph.pos, ph.heading, r?.points ?? null, t, tc, job?.stage === 'dropoff' ? '#ffb347' : '#54ffd0', this.cityMode.surgeZone);
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
    $('rating').textContent = `★ ${s.stats.rating.toFixed(2)} · ${Math.round(acceptanceRate(s.driver) * 100)}% accept`;
    const tier = driverTier(s), tierEl = $('tier');
    tierEl.textContent = tier.label.toUpperCase();
    tierEl.style.color = tier.colour;
    tierEl.title = tier.fareBonus ? `${tier.label} driver: +${Math.round(tier.fareBonus * 100)}% fares` : 'Blue driver';
    $('trips').textContent = `${s.stats.trips} trips`;
    $('km').textContent = `${s.stats.km.toFixed(1)} km`;
    const n = claimableGoals(s) + (dailyChallenge(s).ready ? 1 : 0);
    for (const id of ['goals-badge', 'hud-goals-badge']) { const b = $(id); b.hidden = !n; b.textContent = String(n); }
  }

  // ---------------------------------------------------------------- arcade
  private arcadeEvents() {
    let bestBefore = 0;
    return {
      coin: (k: string) => {
        if (k === 'coin') this.audio.coin(1 + Math.min(0.5, this.arcade.multiplier * 0.04));
        else { this.audio.power(); this.popup(POWER_LABEL[k as PowerKind], 'cyan'); }
      },
      mystery: (result: string) => { this.audio.levelUp(); this.popup(`MYSTERY BOX: ${result}`, 'gold'); },
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
        const lvl = this.save.level;
        const pts = recordArcadeRun(this.save, this.arcade.runId, score, near);
        if (this.save.level > lvl) setTimeout(() => { this.toast(`LEVEL UP! Level ${this.save.level}`, 'good'); this.audio.levelUp(); }, 1200);
        this.persist();
        this.lastRun = { score: Math.floor(score), near, time: this.arcade.time, runId: this.arcade.runId, date: Math.max(0, ...this.save.arcade.top.filter((e) => e.score === Math.floor(score)).map((e) => e.date)), posted: false };
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
    // power-up timers (bars rebuilt only when the set of active power-ups changes)
    const list = $('a-power'), active = a.powers;
    const key = active.map((p) => p.kind).join();
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = active.map((p) => `<div class="pw ${p.kind}"><span>${POWER_ICON[p.kind]}</span><i><b></b></i></div>`).join('');
    }
    active.forEach((p, i) => { (list.children[i]?.querySelector('b') as HTMLElement | null)?.style.setProperty('width', `${(p.left / p.total) * 100}%`); });
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
    const xp = pts > 0 ? arcadeXp(score) : 0;
    $('o-points').textContent = `+${pts.toLocaleString()} arcade points${xp ? ` · +${xp} XP` : ''} · ${this.save.arcade.points.toLocaleString()} banked`;
    if (best) { this.confetti(); this.audio.levelUp(); }
    $('tab-world').hidden = !leaderboardEnabled();
    $('o-double').hidden = !platform.hasAds || pts <= 0;
    if (best) platform.happy();
    this.showBoard('local');
    // returning players post automatically; first-timers are asked for a name
    if (leaderboardEnabled() && this.lastRun && this.lastRun.score > 0) {
      if (this.save.playerName) this.postScore();
      else { $('name-row').hidden = false; }
    } else $('name-row').hidden = true;
  }

  /** iPhone Safari can't go full screen from a web page; suggest Add to Home Screen once. */
  private maybeShowFullscreenTip() {
    let seen = false;
    try { seen = localStorage.getItem('shiftcity.fsTip') === '1'; } catch { /* private mode */ }
    if (seen || !isTouch() || !isIOS() || isStandalone() || window.self !== window.top) return;
    $('fs-tip').hidden = false;
    $('fs-tip-x').onclick = () => { $('fs-tip').hidden = true; try { localStorage.setItem('shiftcity.fsTip', '1'); } catch { /* ignore */ } };
  }

  /** Pause menu for Arcade runs (button, P / Esc, or automatically when the tab is hidden). */
  private arcadePaused = false;
  private toggleArcadePause(on = !this.arcadePaused) {
    if (this.state !== 'arcade' || on === this.arcadePaused) return;
    if (!on && !this.arcade.running && this.arcade.countdown <= 0) return;
    this.arcadePaused = on;
    this.paused = on;
    $('arcade-paused').hidden = !on;
    $('a-pause').hidden = on;
    if (on) {
      $('p-score').textContent = Math.floor(this.arcade.score).toLocaleString();
      $('p-info').textContent = `${this.arcade.coins} coins · ${this.arcade.nearMisses} near misses · ${'♥'.repeat(Math.max(0, this.arcade.hearts))}`;
      this.audio.click();
    } else if (this.arcade.running) {
      this.arcade.countdown = 3; // 3-2-1 before the road moves again
    }
  }

  /** Between runs is the natural ad break on portals (rate-limited inside the platform adapter). */
  private async arcadeAgain() {
    if (this.adBusy) return;
    this.adBusy = true;
    await platform.commercialBreak();
    this.adBusy = false;
    this.startArcade();
  }
  private adBusy = false;

  private async doublePoints() {
    const r = this.lastRun;
    if (!r || this.adBusy || r.doubled) return;
    this.adBusy = true;
    const ok = await platform.rewarded();
    this.adBusy = false;
    this.paused = false;
    $('o-double').hidden = true;
    if (!ok) { this.toast('Ad not available right now', 'bad'); return; }
    r.doubled = true;
    this.save.arcade.points += r.score;
    this.persist();
    this.refreshPoints();
    $('o-points').textContent = `+${(r.score * 2).toLocaleString()} arcade points (doubled!) · ${this.save.arcade.points.toLocaleString()} banked`;
    this.audio.coin();
  }

  private lastRun: { score: number; near: number; time: number; runId: string; date: number; posted: boolean; doubled?: boolean } | null = null;

  private async showBoard(which: 'local' | 'world') {
    document.querySelectorAll<HTMLElement>('[data-board]').forEach((b) => b.classList.toggle('on', b.dataset.board === which));
    const list = $('board-list');
    const row = (rank: number, name: string, car: string, score: number, me: boolean) =>
      `<li class="${me ? 'me' : ''}"><i>${rank}</i><span>${esc(name)} <small class="muted">· ${esc(car)}</small></span><b>${score.toLocaleString()}</b></li>`;
    if (which === 'local') {
      const top = this.save.arcade.top;
      list.innerHTML = top.length
        ? top.map((e, i) => row(i + 1, new Date(e.date).toLocaleDateString(), vehicleById(e.car).name, e.score, !!this.lastRun && e.date === this.lastRun.date && e.score === this.lastRun.score)).join('')
        : '<li class="empty">No runs yet</li>';
      return;
    }
    list.innerHTML = '<li class="empty">Loading…</li>';
    const top = await fetchWorldTop();
    if (!$('board-list').isConnected || !document.querySelector('[data-board="world"].on')) return;
    list.innerHTML = top === null ? '<li class="empty">World board unavailable right now</li>'
      : top.length ? top.map((e, i) => row(i + 1, e.name, e.car, e.score, e.name === this.save.playerName && !!this.lastRun && e.score === this.lastRun.score)).join('')
      : '<li class="empty">Be the first on the board!</li>';
  }

  private async postScore() {
    const r = this.lastRun;
    if (!r || r.posted || !this.save.playerName) return;
    r.posted = true;
    $('name-row').hidden = true;
    const rank = await submitWorldScore({ name: this.save.playerName, score: r.score, time: r.time, near: r.near, car: vehicleById(this.save.selected).name, runId: r.runId });
    if (rank === null) return;
    this.toast(rank <= 10 ? `World rank #${rank}! You're on the board` : `World rank #${rank}`, 'good');
    if (document.querySelector('[data-board="world"].on')) this.showBoard('world');
  }

  private refreshPoints() {
    const p = this.save.arcade.points;
    const cash = Math.floor(p / BALANCE.arcadePointsPerUnit) * BALANCE.cashPerUnit;
    $<HTMLButtonElement>('o-convert').disabled = cash <= 0;
    $<HTMLButtonElement>('o-convert').textContent = cash > 0 ? `Convert → ${money(cash)}` : 'Convert points';
    $<HTMLButtonElement>('g-convert').disabled = cash <= 0;
    $('g-points').textContent = `${p.toLocaleString()} arcade points (${BALANCE.arcadePointsPerUnit} = $${BALANCE.cashPerUnit})`;
    this.renderPowerShop();
  }

  private renderPowerShop() {
    const box = $('o-powers'), lv = this.save.arcade.powers;
    box.innerHTML = '<b>Power-up upgrades</b> <span class="muted">(each level: +20% longer)</span><div class="pw-row">' + POWER_SHOP.map(([k, name]) => {
      const l = lv[k] ?? 0, max = l >= MAX_POWER_LEVEL;
      return `<button class="ghost pw" data-pw="${k}" ${max || this.save.arcade.points < powerUpgradeCost(l) ? 'disabled' : ''}>${name} <small>Lv ${l}${max ? ' MAX' : ` · ${powerUpgradeCost(l).toLocaleString()} pts`}</small></button>`;
    }).join('') + '</div>';
    box.querySelectorAll<HTMLElement>('[data-pw]').forEach((b) => b.addEventListener('click', () => {
      const r = buyPowerUpgrade(this.save, b.dataset.pw!);
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) { this.audio.success(); this.persist(); }
      this.refreshPoints();
      $('o-points').textContent = `${this.save.arcade.points.toLocaleString()} points banked · Wallet ${money(this.save.wallet)}`;
    }));
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
    document.body.classList.add('garage-open'); // the 3D car preview gets the whole screen
    this.paused = true;
    this.previewId = this.save.selected;
    this.garageSel = this.save.selected;
    this.renderGarage();
    // car pictures are rendered after the panel is on screen, so opening the garage stays instant
    if (!Object.keys(this.thumbs).length) setTimeout(() => carThumbs(this.gfx.scene.environment).then((t) => { this.thumbs = t; if (!$('garage').hidden) this.renderGarage(); }), 400);
    this.tutorial.event('garageOpened');
    this.audio.click();
  }

  private closeModals() {
    $('garage').hidden = true; $('goals').hidden = true; $('settings').hidden = true; $('credits').hidden = true;
    document.body.classList.remove('garage-open');
    if (this.previewId && this.previewId !== this.save.selected) this.swapRig(vehicleById(this.save.selected));
    this.previewId = null;
    this.paused = false;
    this.cam.cut();
  }

  private thumbs: Record<string, string> = {};

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
        ${this.thumbs[v.id] ? `<img class="thumb" src="${this.thumbs[v.id]}" alt="">` : `<div class="swatch" style="background:#${v.color.toString(16).padStart(6, '0')}"></div>`}
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
    const ch = dailyChallenge(s);
    const dailyHtml = `<div class="goal daily ${ch.done ? 'done' : ''}"><b>Today: ${ch.def.text}</b><div class="gbar"><i style="width:${(ch.progress / ch.def.goal) * 100}%"></i></div>
        <div class="grow"><span>${Math.floor(ch.progress)} / ${ch.def.goal} · ${money(CHALLENGE_REWARD.cash)} + ${CHALLENGE_REWARD.xp} XP · new one every day</span>
        ${ch.done ? '<span>Claimed ✓</span>' : `<button class="action small" id="daily-claim" ${ch.ready ? '' : 'disabled'}>Claim</button>`}</div></div>`;
    const ea = earnings(s.driver);
    const earnHtml = `<div class="goal earn"><b>Earnings</b><div class="earn-row"><span><big>${money(ea.today)}</big>today · ${ea.todayTrips} trips</span><span><big>${money(ea.week)}</big>last 7 days · ${ea.weekTrips} trips</span><span><big>${money(ea.best)}</big>best trip</span></div>
        <div class="grow"><span>Trip streak: ${s.driver.tripStreak} in a row · every 3rd trip without declining pays a bonus</span></div>
        ${Object.keys(s.driver.badges).length ? `<div class="badges">${Object.entries(s.driver.badges).map(([k, n]) => `<span>${COMPLIMENTS[k] ?? k} ×${n}</span>`).join('')}</div>` : ''}</div>`;
    $('goals-list').innerHTML = earnHtml + dailyHtml + GOALS.map((g) => {
      const p = Math.min(g.goal, goalProgress(s, g)), done = s.claimedGoals.includes(g.id), ready = !done && p >= g.goal;
      return `<div class="goal ${done ? 'done' : ''}"><b>${g.name}</b><div class="gbar"><i style="width:${(p / g.goal) * 100}%"></i></div>
        <div class="grow"><span>${g.kind === 'distance' ? p.toFixed(1) : Math.floor(p)} / ${g.goal} · ${money(g.reward)} + ${g.xp} XP</span>
        ${done ? '<span>Claimed ✓</span>' : `<button class="action small" data-goal="${g.id}" ${ready ? '' : 'disabled'}>Claim</button>`}</div></div>`;
    }).join('');
    document.getElementById('daily-claim')?.addEventListener('click', () => {
      const lvl = s.level;
      if (claimChallenge(s)) { this.toast(`Daily challenge done: +${money(CHALLENGE_REWARD.cash)}`, 'good'); this.audio.success(); this.persist(); if (s.level > lvl) this.toast(`LEVEL UP! Level ${s.level}`, 'good'); }
      this.renderGoals(); this.updateCareer(); this.refreshMenu();
    });
    $('goals-list').querySelectorAll<HTMLElement>('[data-goal]').forEach((b) => b.addEventListener('click', () => {
      const lvl = s.level;
      const r = claimGoal(s, b.dataset.goal!);
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) { this.audio.success(); this.persist(); if (s.level > lvl) this.toast(`LEVEL UP! Level ${s.level}`, 'good'); }
      this.renderGoals(); this.updateCareer(); this.refreshMenu();
    }));
  }

  private openSettings() {
    $('garage').hidden = true; $('goals').hidden = true;
    $('settings').hidden = false;
    this.paused = this.state === 'city' || this.state === 'arcade';
    this.refreshSettings();
  }

  private refreshSettings() {
    const st = this.save.settings;
    for (const k of ['master', 'music', 'engine', 'sfx'] as const) {
      $<HTMLInputElement>(`vol-${k}`).value = String(Math.round(st.volume[k] * 100));
      $(`vol-${k}-v`).textContent = st.audio ? `${Math.round(st.volume[k] * 100)}` : 'off';
    }
    $('s-mute').textContent = st.audio ? 'Mute all' : 'Unmute';
    document.querySelectorAll<HTMLElement>('[data-time]').forEach((b) => b.classList.toggle('on', b.dataset.time === st.time));
    document.querySelectorAll<HTMLElement>('[data-weather]').forEach((b) => b.classList.toggle('on', b.dataset.weather === st.weather));
    document.querySelectorAll<HTMLElement>('[data-gfx]').forEach((b) => b.classList.toggle('on', b.dataset.gfx === st.graphics));
    document.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === st.camera));
    $<HTMLInputElement>('s-fps').checked = st.showFps;
    $('s-gfx-note').textContent = {
      rendered: 'Fastest. Clean stylised look for laptops, phones and older GPUs.',
      photoreal: 'Scanned PBR materials, HDRI sky lighting, soft shadows and bloom. Needs a decent GPU.',
      hyper: 'Everything in Photoreal plus ambient occlusion, live car reflections, cinematic grade, speed blur and lens flare. For gaming PCs.',
    }[st.graphics];
  }

  // ---------------------------------------------------------------- menu & UI wiring
  private refreshMenu() {
    const s = this.save;
    $('story-progress').textContent = s.story.chapter >= STORY.length ? 'Complete ✓' : `Chapter ${s.story.chapter + 1} of ${STORY.length}`;
    $('arcade-best').textContent = `Best ${s.arcade.best.toLocaleString()}`;
    document.querySelectorAll<HTMLElement>('[data-gfx]').forEach((b) => b.classList.toggle('on', b.dataset.gfx === s.settings.graphics));
    document.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === s.settings.camera));
    const nt = nextTier(s);
    $('menu-stats').textContent = `${driverTier(s).label} driver${nt ? ` (${nt.tier.label}: ${nt.needs.join(', ') || 'almost there'})` : ''} · Level ${s.level} · ${money(Math.round(s.wallet))} wallet · ${s.stats.trips} trips · ${money(Math.round(s.stats.earned))} lifetime · ${s.arcade.points.toLocaleString()} arcade points · driving the ${vehicleById(s.selected).name}`;
    const n = claimableGoals(s) + (dailyChallenge(s).ready ? 1 : 0);
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
    on('menu-settings', () => this.openSettings());
    on('btn-settings', () => ($('settings').hidden ? this.openSettings() : this.closeModals()));
    on('s-close', () => this.closeModals());
    on('menu-credits', () => { this.closeModals(); $('credits').hidden = false; });
    on('c-close', () => this.closeModals());
    document.querySelectorAll<HTMLElement>('[data-gfx]').forEach((b) => b.addEventListener('click', () => this.applyGraphics(b.dataset.gfx as GraphicsMode)));
    document.querySelectorAll<HTMLElement>('[data-time]').forEach((b) => b.addEventListener('click', () => this.applyGraphics(undefined, b.dataset.time as TimeOfDay)));
    document.querySelectorAll<HTMLElement>('[data-weather]').forEach((b) => b.addEventListener('click', () => this.applyGraphics(undefined, undefined, b.dataset.weather as Weather)));
    for (const k of ['master', 'music', 'engine', 'sfx'] as const) {
      const el = $<HTMLInputElement>(`vol-${k}`);
      el.addEventListener('input', () => {
        this.audio.unlock();
        this.save.settings.volume[k] = Number(el.value) / 100;
        if (k !== 'engine') this.save.settings.audio = true;
        this.audio.setEnabled(this.save.settings.audio);
        this.audio.setVolume(this.save.settings.volume);
        this.refreshSettings();
      });
      el.addEventListener('change', () => { if (k === 'master' || k === 'sfx') this.audio.preview(); this.persist(); });
    }
    on('s-mute', () => { this.save.settings.audio = !this.save.settings.audio; this.audio.setEnabled(this.save.settings.audio); this.persist(); this.refreshSettings(); });
    $<HTMLInputElement>('s-fps').addEventListener('change', (e) => { this.save.settings.showFps = (e.target as HTMLInputElement).checked; $('fps').hidden = !this.save.settings.showFps; this.persist(); });
    $('fps').hidden = !this.save.settings.showFps;
    document.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.cam as CameraView)));
    on('accept', () => this.acceptJob());
    on('decline', () => this.declineJob());
    on('btn-menu', () => this.showMenu());
    on('btn-garage', () => this.toggleGarage());
    on('btn-goals', () => ($('goals').hidden ? this.openGoals() : this.closeModals()));
    on('btn-camera', () => this.setView(this.cam.cycle()));
    on('btn-gfx', () => this.applyGraphics(({ rendered: 'photoreal', photoreal: 'hyper', hyper: 'rendered' } as const)[this.save.settings.graphics]));
    on('btn-reset', () => this.cityMode.resetCar());
    on('btn-radio', () => this.nextRadio());
    on('g-close', () => this.closeModals());
    on('goals-close', () => this.closeModals());
    on('g-convert', () => this.convert());
    on('o-convert', () => this.convert());
    on('a-pause', () => this.toggleArcadePause(true));
    on('p-resume', () => this.toggleArcadePause(false));
    on('p-restart', () => { this.toggleArcadePause(false); this.startArcade(); });
    on('p-quit', () => { this.toggleArcadePause(false); this.showMenu(); });
    on('o-double', () => this.doublePoints());
    document.querySelectorAll<HTMLElement>('[data-board]').forEach((b) => b.addEventListener('click', () => this.showBoard(b.dataset.board as 'local' | 'world')));
    $('name-row').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $<HTMLInputElement>('p-name').value.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 14);
      if (!name) return;
      this.save.playerName = name;
      this.persist();
      (document.activeElement as HTMLElement)?.blur();
      this.postScore().then(() => this.showBoard('world'));
    });
    on('o-again', () => this.arcadeAgain());
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
const isStandalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Phones: go full screen and lock landscape when a mode starts (Android; iPhone Safari can't, see the tip). */
function goFullscreen() {
  if (!isTouch() || isStandalone() || document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape')).catch(() => {});
}
const lowEndDevice = () => isTouch() || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
export { ARCADE_ORIGIN };
