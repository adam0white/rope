/** Best-effort screen session, entered only from a player's start gesture.
 * Desktop fullscreen remains an explicit menu action. Unsupported/denied APIs
 * leave the ordinary game usable. A hidden document never retains our lock. */
export class DisplaySession {
  private lock: WakeLockSentinel | null = null;
  private active = false;
  private disposed = false;
  private lifetime = new AbortController();
  private requesting = false;
  constructor() {
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          void this.lock?.release();
          this.lock = null;
        } else if (this.active) void this.keepAwake();
      },
      { signal: this.lifetime.signal },
    );
  }
  destroy(): void {
    this.disposed = true;
    this.active = false;
    this.lifetime.abort();
    void this.lock?.release();
    this.lock = null;
  }
  start(): void {
    if (this.disposed) return;
    this.active = true;
    void this.keepAwake();
    if (
      window.matchMedia?.('(max-width: 759px) and (pointer: coarse)').matches &&
      !document.fullscreenElement
    )
      void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  private async keepAwake(): Promise<void> {
    if (this.disposed || !navigator.wakeLock || this.lock || this.requesting || document.hidden) return;
    this.requesting = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (this.disposed || document.hidden) {
        await lock.release();
        return;
      }
      this.lock = lock;
      lock.addEventListener('release', () => {
        if (this.lock === lock) this.lock = null;
      });
    } catch {
      /* The browser can deny a wake lock, including in low-power mode. */
    } finally {
      this.requesting = false;
    }
  }
}
