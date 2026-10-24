import { createLab } from '@adam0white/lab-client';
import { telemetryNotice } from '@adam0white/lab-kit';

export const lab = createLab({ game: 'rope' });

const notice = telemetryNotice();
if (notice) {
  notice.style.top = 'calc(env(safe-area-inset-top, 0px) + 56px)';
  document.body.append(notice);
}
