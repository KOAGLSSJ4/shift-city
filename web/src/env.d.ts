/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Build target: web (own site on Vercel), itch, crazygames or poki. */
  readonly VITE_TARGET?: 'web' | 'itch' | 'crazygames' | 'poki';
  /** Override for the world leaderboard endpoint (absolute URL works with CORS). */
  readonly VITE_LEADERBOARD_URL?: string;
}
