import './ui/style.css';
import { Game } from './ui/game.ts';

const root = document.getElementById('app') ?? document.body;
const game = new Game(root);
void game.boot();
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
