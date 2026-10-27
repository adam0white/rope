import './ui/style.css';
import { Game } from './ui/game.ts';
import { startupEntry } from './ui/lab.ts';

const root = document.getElementById('app') ?? document.body;
if (startupEntry === 'invalid') {
  root.innerHTML =
    '<h1>File mode could not start</h1><p>The file selector is invalid or repeated. No season was opened.</p><a href="/file/">Open a run file</a>';
} else {
  const game = new Game(root);
  void game.boot();
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;

  if (startupEntry === 'native' && 'serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  if (import.meta.hot) import.meta.hot.dispose(() => game.destroy());
}
