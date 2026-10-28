import { Game } from './ui/game.ts';
import { startupEntry } from './ui/lab.ts';

const root = document.getElementById('app') ?? document.body;
const game = new Game(root);
void game.boot();
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;

if (startupEntry === 'native' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy());
