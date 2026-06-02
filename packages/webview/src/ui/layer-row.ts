import type { Layer, UserAction } from '@maps-viewer/shared';
import { mountStrokeSlider, type StrokeSliderEl } from './stroke-slider.js';
import { mountColorPicker } from './color-picker.js';

export interface LayerRow {
  element: HTMLElement;
  update(layer: Layer): void;
  destroy(): void;
}

/** Render one layer row inside the layers panel. */
export function mountLayerRow(
  layer: Layer,
  onAction: (a: UserAction) => void,
): LayerRow {
  let current: Layer = layer;

  const row = document.createElement('div');
  row.className = 'mv-layer-row';
  row.dataset.layerId = layer.id;

  // 1. Visibility toggle
  const visBtn = document.createElement('button');
  visBtn.type = 'button';
  visBtn.className = 'mv-layer-row__vis';
  visBtn.title = 'Toggle visibility';

  // 2. Color swatch (opens picker)
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'mv-layer-row__color';
  swatch.title = 'Change color';

  // 3. Name (click to rename)
  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'mv-layer-row__name';
  name.spellcheck = false;
  name.title = 'Rename layer';

  // 4. Stroke slider chip (collapsible)
  const stroke = mountStrokeSlider(layer.strokeWidth, (width) =>
    onAction({ type: 'setLayerStrokeWidth', layerId: current.id, width }),
  );
  stroke.element.classList.add('mv-layer-row__stroke');

  // 5. Delete button
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mv-layer-row__delete';
  delBtn.title = 'Remove layer';
  delBtn.textContent = '✕';

  row.appendChild(visBtn);
  row.appendChild(swatch);
  row.appendChild(name);
  row.appendChild(stroke.element);
  row.appendChild(delBtn);

  // Color picker is a singleton per row (lazy mount)
  const picker = mountColorPicker((color) =>
    onAction({ type: 'setLayerColor', layerId: current.id, color }),
  );

  // === wiring ===
  visBtn.addEventListener('click', () => {
    onAction({ type: 'setLayerVisible', layerId: current.id, visible: !current.visible });
  });
  swatch.addEventListener('click', (e) => {
    e.stopPropagation();
    picker.open(swatch);
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      name.value = current.displayName;
      (e.target as HTMLInputElement).blur();
    }
  });
  name.addEventListener('blur', () => {
    if (name.value.trim() === current.displayName) return;
    onAction({ type: 'renameLayer', layerId: current.id, name: name.value });
  });
  delBtn.addEventListener('click', () => {
    onAction({ type: 'removeLayer', layerId: current.id });
  });

  function update(next: Layer): void {
    current = next;
    row.dataset.visible = String(next.visible);
    visBtn.setAttribute('aria-pressed', String(next.visible));
    visBtn.textContent = next.visible ? '●' : '○';
    swatch.style.background = next.color;
    if (document.activeElement !== name) name.value = next.displayName;
    stroke.setValue(next.strokeWidth);
  }
  update(layer);

  return {
    element: row,
    update,
    destroy() {
      stroke.destroy();
      picker.destroy();
      row.remove();
    },
  };
}
