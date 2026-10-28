import { type PhoneStage, phoneStage, type SheetHeight } from '@adam0white/lab-kit';

/** Shared measurement only. Rope owns layout, navigation, focus and sheet content. */
export class RopeStage {
  private controller: PhoneStage;
  private headerObserver: ResizeObserver;

  // Overlay pages share the actual top boundary; typography never gets hidden to fit it.
  private measureHeader = () => {
    const top = this.root.querySelector<HTMLElement>('.top');
    const height = top?.getBoundingClientRect().height ?? 0;
    if (height > 0) this.root.style.setProperty('--rope-top-height', `${height}px`);
    this.controller.refresh();
  };

  constructor(root: HTMLElement, resize: (width: number, height: number) => void) {
    this.root = root;
    root.querySelector('.scene')?.classList.add('lk-scene');
    root.querySelector('.sheet')?.classList.add('lk-sheet');
    root.querySelector('.leader-bar')?.classList.add('lk-strip');
    this.controller = phoneStage(root, {
      observeOnly: true,
      history: false,
      onSceneRect: ({ width, height }) => {
        if (width > 0 && height > 0) resize(width, height);
      },
    });
    this.headerObserver = new ResizeObserver(this.measureHeader);
    const top = root.querySelector('.top');
    if (top) this.headerObserver.observe(top);
    window.addEventListener('resize', this.measureHeader);
  }

  private root: HTMLElement;

  show(id: string, height: SheetHeight = 'fit'): void {
    this.root.dataset.sheetId = id;
    this.root.dataset.sheet = height;
    this.root.dataset.sheetBack = String(id !== 'main');
    this.measureHeader();
  }

  destroy(): void {
    this.headerObserver.disconnect();
    window.removeEventListener('resize', this.measureHeader);
    this.root.style.removeProperty('--rope-top-height');
    this.controller.destroy();
    delete this.root.dataset.sheetId;
    delete this.root.dataset.sheet;
    delete this.root.dataset.sheetBack;
  }
}
