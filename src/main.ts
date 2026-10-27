import './ui/style.css';
import { Game } from './ui/game.ts';
import { fileEntry } from './ui/lab.ts';

const root = document.getElementById('app') ?? document.body;
const game = new Game(root);
void game.boot();
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;

if (fileEntry(location.search) === 'native' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy());
