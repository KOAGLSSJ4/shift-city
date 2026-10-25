import './styles/main.css';
import { Game } from './core/Game';

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  const t = document.getElementById('load-text');
  if (t) t.textContent = 'Failed to start: ' + (e?.message ?? e) + ' — your browser may not support WebGL2.';
});
