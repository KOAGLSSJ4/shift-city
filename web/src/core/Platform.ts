// Web-portal SDK adapter. The build target (VITE_TARGET) picks the implementation:
//   web / itch → no SDK (no ads)      poki → Poki SDK v2      crazygames → CrazyGames SDK v3
// Every call is safe to make on any target and never throws; if an SDK fails to load (ad blockers),
// the game carries on as if there were no ads.
type Target = 'web' | 'itch' | 'crazygames' | 'poki';
export const TARGET: Target = (import.meta.env.VITE_TARGET as Target | undefined) ?? 'web';

interface PokiSDK {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(onStart?: () => void): Promise<boolean>;
}
interface CrazySDK {
  init(): Promise<void>;
  game: { loadingStart(): void; loadingStop(): void; gameplayStart(): void; gameplayStop(): void; happytime(): void };
  ad: { requestAd(type: 'midgame' | 'rewarded', cb: { adStarted?(): void; adFinished?(): void; adError?(e: unknown): void }): void };
}

const SDK_URL: Partial<Record<Target, string>> = {
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
};

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

class Platform {
  private poki: PokiSDK | null = null;
  private crazy: CrazySDK | null = null;
  private playing = false;
  private lastBreak = 0;
  /** Called with true when an ad starts and false when it ends (mute + pause the game). */
  onAd: (playing: boolean) => void = () => {};

  get hasAds() { return !!(this.poki || this.crazy); }

  async init() {
    const url = SDK_URL[TARGET];
    if (!url) return;
    try {
      await loadScript(url);
      const w = window as unknown as { PokiSDK?: PokiSDK; CrazyGames?: { SDK: CrazySDK } };
      if (TARGET === 'poki' && w.PokiSDK) { await w.PokiSDK.init(); this.poki = w.PokiSDK; }
      if (TARGET === 'crazygames' && w.CrazyGames) { await w.CrazyGames.SDK.init(); this.crazy = w.CrazyGames.SDK; this.crazy.game.loadingStart(); }
    } catch (e) {
      console.warn('platform SDK unavailable, continuing without it', e);
      this.poki = this.crazy = null;
    }
  }

  loadingFinished() {
    try { this.poki?.gameLoadingFinished(); this.crazy?.game.loadingStop(); } catch { /* ignore */ }
  }

  /** The player is actively driving (city or arcade, not paused). */
  gameplay(on: boolean) {
    if (on === this.playing) return;
    this.playing = on;
    try {
      if (on) { this.poki?.gameplayStart(); this.crazy?.game.gameplayStart(); }
      else { this.poki?.gameplayStop(); this.crazy?.game.gameplayStop(); }
    } catch { /* ignore */ }
  }

  /** Celebrate a big moment (CrazyGames uses it for engagement stats). */
  happy() { try { this.crazy?.game.happytime(); } catch { /* ignore */ } }

  /** Interstitial at a natural break (e.g. between arcade runs). Rate-limited to one per 3 minutes. */
  async commercialBreak(): Promise<void> {
    if (!this.hasAds || performance.now() - this.lastBreak < 180_000) return;
    this.lastBreak = performance.now();
    const was = this.playing;
    this.gameplay(false);
    try {
      if (this.poki) await this.poki.commercialBreak(() => this.onAd(true));
      else if (this.crazy) await this.crazyAd('midgame');
    } catch { /* ignore */ }
    this.onAd(false);
    if (was) this.gameplay(true);
  }

  /** Rewarded ad; resolves true only if the player watched it to the end. */
  async rewarded(): Promise<boolean> {
    if (!this.hasAds) return false;
    this.gameplay(false);
    let ok = false;
    try {
      if (this.poki) ok = await this.poki.rewardedBreak(() => this.onAd(true));
      else if (this.crazy) ok = await this.crazyAd('rewarded');
    } catch { ok = false; }
    this.onAd(false);
    this.lastBreak = performance.now(); // don't follow a rewarded ad with an interstitial
    return ok;
  }

  private crazyAd(type: 'midgame' | 'rewarded') {
    return new Promise<boolean>((res) => {
      this.crazy!.ad.requestAd(type, {
        adStarted: () => this.onAd(true),
        adFinished: () => res(true),
        adError: () => res(false),
      });
    });
  }
}

export const platform = new Platform();
