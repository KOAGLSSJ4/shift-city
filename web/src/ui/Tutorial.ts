// Contextual first-shift tutorial with a bouncing pointer. Steps only advance on real player actions.
import * as THREE from 'three';

export type TutorialEvent = 'accepted' | 'pickedUp' | 'delivered' | 'garageOpened' | 'menuOpened' | 'timer';
interface Step {
  title: string;
  text: string;
  /** CSS selector for a UI target, or 'world' for the current objective marker. */
  target: string;
  label: string;
  advanceOn: TutorialEvent;
  /** Short version for phones (no keyboard keys, fits one line). */
  touch: string;
  delay?: number; // for 'timer' steps
}

export const STEPS: Step[] = [
  { title: 'Your first fare', text: 'A ride request just came in. Check the pickup, destination and fare, then accept it.', target: '#accept', label: 'ACCEPT THE JOB', touch: 'Tap Accept to take the ride.', advanceOn: 'accepted' },
  { title: 'Drive to the pickup', text: 'Follow the glowing arrows on the road and the GPS at the top. W/↑ to drive, A/D to steer, S to brake. Stop inside the ring.', target: 'world', label: 'PICKUP', touch: 'Follow the arrows on the road and stop in the green ring.', advanceOn: 'pickedUp' },
  { title: 'Take them to the destination', text: 'Passenger on board! Drive smoothly — bumps cost you stars and tips. Stop inside the orange ring.', target: 'world', label: 'DROP-OFF', touch: 'Drive smoothly (bumps cost tips) and stop in the orange ring.', advanceOn: 'delivered' },
  { title: 'You got paid!', text: 'Fares go into your wallet. Earn XP to level up and unlock better cars.', target: '#wallet', label: 'YOUR EARNINGS', touch: 'Fares go into your wallet. Level up to unlock cars.', advanceOn: 'timer', delay: 4.5 },
  { title: 'Visit the garage', text: 'Spend your earnings on new vehicles and upgrades. Better cars unlock premium passengers.', target: '#btn-garage', label: 'OPEN GARAGE', touch: 'Tap Garage to see the cars you can unlock.', advanceOn: 'garageOpened' },
  { title: 'Three ways to play', text: 'Story, Free Ride and Arcade Rush all share one wallet and garage. Open the menu to switch any time.', target: '#btn-menu', label: 'OPEN MENU', touch: 'Tap Menu to switch between Story, Free Ride and Arcade.', advanceOn: 'menuOpened' },
];

export class Tutorial {
  active = false;
  step = 0;
  private timer = 0;
  private pointer = document.getElementById('pointer')!;
  private label = document.getElementById('p-label')!;
  private card = document.getElementById('tutorial')!;
  private highlighted: HTMLElement | null = null;

  constructor(private onFinish: () => void) {
    document.getElementById('t-skip')!.addEventListener('click', (e) => { e.stopPropagation(); this.finish(); });
    this.card.addEventListener('click', () => this.tuck()); // tap the big card to move it aside
  }

  start() {
    this.active = true; this.step = 0; this.timer = 0; this.render();
    // phones: the first step opens big in the middle so it can be read, then tucks away to the side
    if (matchMedia('(pointer: coarse)').matches) {
      this.card.classList.add('intro');
      clearTimeout(this.introTimer);
      this.introTimer = window.setTimeout(() => this.tuck(), 5000);
    }
  }

  private introTimer = 0;
  private tuck() { if (this.card.classList.contains('intro')) { this.card.classList.remove('intro'); this.card.classList.add('tucked'); } }

  show() { if (this.active) this.render(); }

  finish() {
    this.active = false;
    this.card.hidden = true; this.pointer.hidden = true;
    this.highlight(null);
    this.onFinish();
  }

  event(e: TutorialEvent) {
    if (!this.active) return;
    const s = STEPS[this.step];
    if (s.advanceOn !== e) return;
    this.tuck();
    this.step++;
    this.timer = 0;
    if (this.step >= STEPS.length) this.finish();
    else this.render();
  }

  private render() {
    const s = STEPS[this.step];
    this.card.hidden = false;
    document.getElementById('t-count')!.textContent = `FIRST SHIFT · ${this.step + 1}/${STEPS.length}`;
    document.getElementById('t-title')!.textContent = s.title;
    document.getElementById('t-text')!.textContent = matchMedia('(pointer: coarse)').matches ? s.touch : s.text;
    this.label.textContent = s.label;
    this.highlight(s.target === 'world' ? null : document.querySelector<HTMLElement>(s.target));
  }

  private highlight(el: HTMLElement | null) {
    this.highlighted?.classList.remove('coach');
    this.highlighted = el;
    el?.classList.add('coach');
  }

  /** Per-frame pointer placement. `world` is the objective position if any. */
  update(dt: number, camera: THREE.Camera, world: THREE.Vector3 | null, paused: boolean) {
    if (!this.active) return;
    const s = STEPS[this.step];
    if (s.advanceOn === 'timer' && !paused && (this.timer += dt) >= (s.delay ?? 4)) { this.event('timer'); return; }
    const p = this.pointer;
    if (s.target === 'world') {
      if (!world) { p.hidden = true; return; }
      const v = world.clone().setY(3).project(camera);
      const behind = v.z > 1;
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      if (!behind && sx > 40 && sx < innerWidth - 40 && sy > 60 && sy < innerHeight - 60) {
        this.place('down', sx, sy - 10);
      } else {
        p.hidden = true; // the edge arrow handles off-screen objectives
      }
      return;
    }
    // re-query each frame: the element may re-render or move
    const el = document.querySelector<HTMLElement>(s.target);
    if (!el || el.offsetParent === null) { p.hidden = true; return; }
    if (el !== this.highlighted) this.highlight(el);
    const r = el.getBoundingClientRect();
    if (r.left > innerWidth * 0.55) this.place('right', r.left - 8, r.top + r.height / 2);
    else if (r.right < innerWidth * 0.45) this.place('left', r.right + 8, r.top + r.height / 2);
    else if (r.top > innerHeight * 0.5) this.place('down', r.left + r.width / 2, r.top - 6);
    else this.place('up', r.left + r.width / 2, r.bottom + 6);
  }

  /** Positions the pointer so the arrow tip touches (x, y). */
  private place(dir: 'left' | 'right' | 'up' | 'down', x: number, y: number) {
    const p = this.pointer;
    p.hidden = false;
    p.className = `dir-${dir}`;
    const w = p.offsetWidth, h = p.offsetHeight;
    let left = x, top = y;
    if (dir === 'right') { left = x - w; top = y - h / 2; }
    if (dir === 'left') { left = x; top = y - h / 2; }
    if (dir === 'down') { left = x - w / 2; top = y - h; }
    if (dir === 'up') { left = x - w / 2; top = y; }
    p.style.left = `${Math.max(4, Math.min(innerWidth - w - 4, left))}px`;
    p.style.top = `${Math.max(4, Math.min(innerHeight - h - 4, top))}px`;
  }
}
