import type { FeatureOption, Layer, LayerFeatureMeta, UserAction } from '@maps-viewer/shared';
import { mountStrokeSlider, type StrokeSliderEl } from './stroke-slider.js';
import { mountColorPicker } from './color-picker.js';

export interface LayerRow {
  element: HTMLElement;
  update(options: LayerRowOptions): void;
  destroy(): void;
}

export interface LayerRowOptions {
  readonly layer: Layer;
  readonly selected: boolean;
  readonly primaryKey: string | null;
  readonly meta: LayerFeatureMeta | undefined;
  readonly hiddenFeatureIds: ReadonlySet<number | string>;
}

/** Render one layer row inside the layers panel. */
export function mountLayerRow(
  options: LayerRowOptions,
  onAction: (a: UserAction) => void,
  onSelect: (layerId: string, selected: boolean) => void,
  onPrimaryKey: (layerId: string, key: string | null) => void,
  onLocateFeature: (layerId: string, featureId: number) => void,
  onFeatureVisible: (layerId: string, featureId: number, visible: boolean) => void,
): LayerRow {
  let current: Layer = options.layer;
  let currentOptions = options;

  const row = document.createElement('div');
  row.className = 'mv-layer-row';
  row.setAttribute('role', 'listitem');
  row.dataset.layerId = options.layer.id;

  const select = document.createElement('input');
  select.type = 'checkbox';
  select.className = 'mv-layer-row__select';
  select.title = 'Select for grouping';
  select.setAttribute('aria-label', `Select ${options.layer.displayName} for grouping`);

  // 1. Visibility toggle
  const visBtn = document.createElement('button');
  visBtn.type = 'button';
  visBtn.className = 'mv-layer-row__vis';
  visBtn.title = 'Toggle visibility';
  visBtn.setAttribute('aria-label', `Toggle visibility of layer ${options.layer.displayName}`);

  // 2. Color swatch (opens picker)
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'mv-layer-row__color';
  swatch.title = 'Change color';
  swatch.setAttribute('aria-label', `Change color of layer ${options.layer.displayName}`);
  swatch.setAttribute('aria-haspopup', 'listbox');

  // 3. Name (click to rename)
  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'mv-layer-row__name';
  name.spellcheck = false;
  name.title = 'Rename layer';
  name.setAttribute('aria-label', 'Layer name');

  // 4. Stroke slider chip (collapsible)
  const stroke = mountStrokeSlider(options.layer.strokeWidth, (width) =>
    onAction({ type: 'setLayerStrokeWidth', layerId: current.id, width }),
  );
  stroke.element.classList.add('mv-layer-row__stroke');

  const pk = document.createElement('select');
  pk.className = 'mv-layer-row__pk';
  pk.title = 'Primary key';
  pk.setAttribute('aria-label', 'Primary key');

  const feature = document.createElement('select');
  feature.className = 'mv-layer-row__feature';
  feature.title = 'Feature by primary key';
  feature.setAttribute('aria-label', 'Feature by primary key');

  const featureVis = document.createElement('button');
  featureVis.type = 'button';
  featureVis.className = 'mv-layer-row__feature-vis';
  featureVis.title = 'Toggle selected feature visibility';
  featureVis.setAttribute('aria-label', 'Toggle selected feature visibility');

  const zoomBtn = document.createElement('button');
  zoomBtn.type = 'button';
  zoomBtn.className = 'mv-layer-row__feature-zoom';
  zoomBtn.textContent = 'Zoom';
  zoomBtn.setAttribute('aria-label', 'Zoom to selected feature');

  // 5. Delete button
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mv-layer-row__delete';
  delBtn.title = 'Remove layer';
  delBtn.textContent = '✕';
  delBtn.setAttribute('aria-label', `Remove layer ${options.layer.displayName}`);

  row.appendChild(select);
  row.appendChild(visBtn);
  row.appendChild(swatch);
  row.appendChild(name);
  row.appendChild(stroke.element);
  row.appendChild(delBtn);
  row.appendChild(pk);
  row.appendChild(feature);
  row.appendChild(featureVis);
  row.appendChild(zoomBtn);

  // Color picker is a singleton per row (lazy mount)
  const picker = mountColorPicker((color) =>
    onAction({ type: 'setLayerColor', layerId: current.id, color }),
  );

  // === wiring ===
  select.addEventListener('change', () => {
    onSelect(current.id, select.checked);
  });
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
  pk.addEventListener('change', () => {
    const value = pk.value === '' ? null : pk.value;
    onPrimaryKey(current.id, value);
  });
  feature.addEventListener('change', () => {
    const id = selectedFeatureId();
    if (id !== null) onLocateFeature(current.id, id);
  });
  zoomBtn.addEventListener('click', () => {
    const id = selectedFeatureId();
    if (id !== null) onLocateFeature(current.id, id);
  });
  featureVis.addEventListener('click', () => {
    const id = selectedFeatureId();
    if (id === null) return;
    onFeatureVisible(current.id, id, currentOptions.hiddenFeatureIds.has(id));
  });

  function update(nextOptions: LayerRowOptions): void {
    currentOptions = nextOptions;
    const next = nextOptions.layer;
    current = next;
    row.dataset.visible = String(next.visible);
    row.dataset.selected = String(nextOptions.selected);
    select.checked = nextOptions.selected;
    select.setAttribute('aria-label', `Select ${next.displayName} for grouping`);
    visBtn.setAttribute('aria-pressed', String(next.visible));
    visBtn.setAttribute('aria-label', `Toggle visibility of layer ${next.displayName}`);
    visBtn.innerHTML = eyeIcon(next.visible);
    swatch.style.background = next.color;
    swatch.setAttribute('aria-label', `Change color of layer ${next.displayName}`);
    delBtn.setAttribute('aria-label', `Remove layer ${next.displayName}`);
    if (document.activeElement !== name) {
      name.value = next.displayName;
      name.title = next.displayName;
    }
    stroke.setValue(next.strokeWidth);
    renderPkOptions(nextOptions);
    renderFeatureOptions(nextOptions);
  }
  update(options);

  return {
    element: row,
    update,
    destroy() {
      stroke.destroy();
      picker.destroy();
      row.remove();
    },
  };

  function selectedFeatureId(): number | null {
    if (feature.value === '') return null;
    const parsed = Number(feature.value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  function renderPkOptions(next: LayerRowOptions): void {
    const active = next.primaryKey ?? '';
    const keys = next.meta?.propertyKeys ?? [];
    pk.disabled = keys.length === 0;
    pk.innerHTML = [
      '<option value="">PK: none</option>',
      ...keys.map((key) => `<option value="${escapeAttr(key)}">${escapeHtml(key)}</option>`),
    ].join('');
    pk.value = keys.includes(active) ? active : '';
  }

  function renderFeatureOptions(next: LayerRowOptions): void {
    const key = next.primaryKey;
    const items: ReadonlyArray<FeatureOption> = key ? next.meta?.featuresByKey[key] ?? [] : [];
    feature.disabled = items.length === 0;
    featureVis.disabled = items.length === 0;
    zoomBtn.disabled = items.length === 0;
    feature.innerHTML = items.length === 0
      ? '<option value="">No PK features</option>'
      : items.map((item) => `<option value="${item.featureId}">${escapeHtml(item.label)}</option>`).join('');
    const id = selectedFeatureId();
    const hidden = id !== null && next.hiddenFeatureIds.has(id);
    featureVis.innerHTML = eyeIcon(!hidden);
    featureVis.setAttribute('aria-pressed', String(!hidden));
  }
}

function eyeIcon(visible: boolean): string {
  if (visible) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2"/><path d="M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8"/></svg>';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
