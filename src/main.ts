import './ui/style.css';
import { startAtAddress } from './ui/file-route.ts';

startAtAddress(
  location.href,
  (destination) => location.replace(destination),
  () => void import('./boot.ts'),
);
