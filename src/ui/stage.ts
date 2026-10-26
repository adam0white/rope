import { type PhoneStage, phoneStage, type SheetHeight } from '@adam0white/lab-kit';

/** Shared measurement only. Rope owns layout, navigation, focus and sheet content. */
export class RopeStage {
  private controller: PhoneStage;

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
  }

  private root: HTMLElement;

  show(id: string, height: SheetHeight = 'fit'): void {
    this.root.dataset.sheetId = id;
    this.root.dataset.sheet = height;
    this.root.dataset.sheetBack = String(id !== 'main');
    this.controller.refresh();
  }

  destroy(): void {
    this.controller.destroy();
    delete this.root.dataset.sheetId;
    delete this.root.dataset.sheet;
    delete this.root.dataset.sheetBack;
  }
}
