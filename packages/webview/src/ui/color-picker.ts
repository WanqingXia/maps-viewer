import type { ColorHex } from '@maps-viewer/shared';
import { PALETTE } from '@maps-viewer/shared';

export interface ColorPicker {
  open(anchor: HTMLElement): void;
  destroy(): void;
}

/**
 * Floating dropdown showing all 22 PALETTE swatches in a 2-row grid.
 * Click-outside dismisses; pressing a swatch fires onPick and closes.
 */
export function mountColorPicker(
  onPick: (color: ColorHex) => void,
): ColorPicker {
  const root = document.createElement('div');
  root.className = 'mv-color-picker';
  root.setAttribute('role', 'listbox');
  root.setAttribute('aria-label', 'Layer color');
  root.dataset.visible = 'false';

  for (const color of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mv-color-picker__swatch';
    btn.style.background = color;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-label', `Color ${color}`);
    btn.title = color;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(color);
      hide();
    });
    root.appendChild(btn);
  }

  document.body.appendChild(root);

  const onDocClick = (e: MouseEvent): void => {
    if (!root.contains(e.target as Node)) hide();
  };

  function show(anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    root.style.top = `${rect.bottom + 4}px`;
    root.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
    root.dataset.visible = 'true';
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
  }
  function hide(): void {
    root.dataset.visible = 'false';
    document.removeEventListener('click', onDocClick);
  }

  return {
    open: show,
    destroy() {
      document.removeEventListener('click', onDocClick);
      root.remove();
    },
  };
}
