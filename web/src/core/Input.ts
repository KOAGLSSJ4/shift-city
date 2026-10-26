// Keyboard + touch input. Steering convention: A/Left = +1 (left), D/Right = -1 (right).
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  touch = { throttle: false, brake: false, left: false, right: false, handbrake: false };

  constructor() {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  down(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  /** True once per physical key press. Call consume() at end of frame. */
  hit(...codes: string[]) { return codes.some((c) => this.pressed.has(c)); }
  consume() { this.pressed.clear(); }
  press(code: string) { this.pressed.add(code); }

  get throttle() { return this.down('KeyW', 'ArrowUp') || this.touch.throttle ? 1 : 0; }
  get brake() { return this.down('KeyS', 'ArrowDown') || this.touch.brake ? 1 : 0; }
  get steer() {
    return (this.down('KeyA', 'ArrowLeft') || this.touch.left ? 1 : 0) - (this.down('KeyD', 'ArrowRight') || this.touch.right ? 1 : 0);
  }
  get handbrake() { return this.down('Space') || this.touch.handbrake; }

  /** Wires on-screen buttons (data-touch="throttle|brake|left|right|handbrake"). */
  bindTouch(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-touch]').forEach((el) => {
      const k = el.dataset.touch as keyof Input['touch'];
      const on = (e: Event) => { e.preventDefault(); this.touch[k] = true; el.classList.add('on'); if (k === 'left') this.press('TouchLeft'); if (k === 'right') this.press('TouchRight'); };
      const off = (e: Event) => { e.preventDefault(); this.touch[k] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    });
  }
}
