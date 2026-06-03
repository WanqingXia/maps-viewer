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
  readonly primaryKey: string | null;
  readonly meta: LayerFeatureMeta | undefined;
  readonly hiddenFeatureIds: ReadonlySet<number | string>;
}

export function mountLayerRow(
  options: LayerRowOptions,
  onAction: (a: UserAction) => void,
  onPrimaryKey: (layerId: string, key: string | null) => void,
  onLocateFeature: (layerId: string, featureId: number) => void,
  onFeatureVisible: (layerId: string, featureId: number, visible: boolean) => void,
  onFeaturesVisible: (layerId: string, featureIds: ReadonlyArray<number>, visible: boolean) => void,
): LayerRow {
  let current = options.layer;
  let currentOptions = options;
  let expanded = false;
  let query = '';
  let sortAsc = true;
  let recordsScrollTop = 0;

  const row = document.createElement('div');
  row.className = 'mv-layer-row';
  row.setAttribute('role', 'listitem');
  row.dataset.layerId = current.id;

  const move = iconButton('mv-layer-row__move', 'Drag layer', '↕');
  move.draggable = true;
  move.title = 'Drag layer';

  const visBtn = iconButton('mv-layer-row__vis', `Toggle visibility of layer ${current.displayName}`, '');

  const swatch = iconButton('mv-layer-row__color', `Change color of layer ${current.displayName}`, '');
  swatch.title = 'Change color';
  swatch.setAttribute('aria-haspopup', 'listbox');

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'mv-layer-row__name';
  name.spellcheck = false;
  name.title = current.displayName;
  name.setAttribute('aria-label', 'Layer name');

  const delBtn = iconButton('mv-layer-row__delete', `Remove layer ${current.displayName}`, 'Remove');

  const stroke = mountStrokeSlider(current.strokeWidth, (width) =>
    onAction({ type: 'setLayerStrokeWidth', layerId: current.id, width }),
  );
  stroke.element.classList.add('mv-layer-row__stroke');

  const pk = document.createElement('select');
  pk.className = 'mv-layer-row__pk';
  pk.title = 'Primary key';
  pk.setAttribute('aria-label', 'Primary key');

  const expandBtn = iconButton('mv-layer-row__expand', 'Show feature records', 'Records ▾');

  const records = document.createElement('div');
  records.className = 'mv-layer-row__records';
  records.dataset.visible = 'false';

  const recordsToolbar = document.createElement('div');
  recordsToolbar.className = 'mv-layer-row__records-toolbar';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'mv-layer-row__records-search';
  search.placeholder = 'Search records';
  search.setAttribute('aria-label', 'Search records');
  const bulkVisibleBtn = iconButton('mv-layer-row__records-bulk-vis', 'Hide all matching records', eyeIcon(true));
  const sortBtn = iconButton('mv-layer-row__records-sort', 'Sort records', 'A→Z');
  recordsToolbar.append(bulkVisibleBtn, search, sortBtn);

  const recordsList = document.createElement('div');
  recordsList.className = 'mv-layer-row__records-list';
  records.append(recordsToolbar, recordsList);

  row.append(move, visBtn, swatch, name, delBtn, stroke.element, pk, expandBtn, records);

  const picker = mountColorPicker((color) =>
    onAction({ type: 'setLayerColor', layerId: current.id, color }),
  );

  move.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/plain', current.id);
    e.dataTransfer?.setData('application/x-maps-viewer-layer', current.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    row.dataset.dragging = 'true';
  });
  move.addEventListener('dragend', () => {
    row.dataset.dragging = 'false';
  });
  visBtn.addEventListener('click', () => {
    onAction({ type: 'setLayerVisible', layerId: current.id, visible: !current.visible });
  });
  swatch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (current.groupId !== null) return;
    picker.open(swatch);
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    else if (e.key === 'Escape') {
      name.value = current.displayName;
      (e.target as HTMLInputElement).blur();
    }
  });
  name.addEventListener('blur', () => {
    if (name.value.trim() === current.displayName) return;
    onAction({ type: 'renameLayer', layerId: current.id, name: name.value });
  });
  delBtn.addEventListener('click', () => onAction({ type: 'removeLayer', layerId: current.id }));
  pk.addEventListener('change', () => {
    const value = pk.value === '' ? null : pk.value;
    onPrimaryKey(current.id, value);
  });
  expandBtn.addEventListener('click', () => {
    expanded = !expanded;
    renderRecords();
  });
  search.addEventListener('input', () => {
    query = search.value;
    renderRecords();
  });
  recordsList.addEventListener('scroll', () => {
    recordsScrollTop = recordsList.scrollTop;
  });
  bulkVisibleBtn.addEventListener('click', () => {
    const items = visibleRecordItems();
    if (items.length === 0) return;
    const allHidden = items.every((item) => currentOptions.hiddenFeatureIds.has(item.featureId));
    onFeaturesVisible(current.id, items.map((item) => item.featureId), allHidden);
  });
  sortBtn.addEventListener('click', () => {
    sortAsc = !sortAsc;
    renderRecords();
  });

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

  function update(nextOptions: LayerRowOptions): void {
    currentOptions = nextOptions;
    current = nextOptions.layer;
    row.dataset.layerId = current.id;
    row.dataset.visible = String(current.visible);
    row.dataset.grouped = String(current.groupId !== null);
    visBtn.setAttribute('aria-pressed', String(current.visible));
    visBtn.setAttribute('aria-label', `Toggle visibility of layer ${current.displayName}`);
    visBtn.innerHTML = eyeIcon(current.visible);
    swatch.style.background = current.color;
    swatch.disabled = current.groupId !== null;
    swatch.setAttribute('aria-label', current.groupId ? 'Grouped layers use group color' : `Change color of layer ${current.displayName}`);
    delBtn.setAttribute('aria-label', `Remove layer ${current.displayName}`);
    if (document.activeElement !== name) {
      name.value = current.displayName;
      name.title = current.displayName;
    }
    stroke.setValue(current.strokeWidth);
    renderPkOptions();
    renderRecords();
  }

  function renderPkOptions(): void {
    const active = currentOptions.primaryKey ?? '';
    const keys = currentOptions.meta?.propertyKeys ?? [];
    pk.disabled = keys.length === 0;
    pk.innerHTML = [
      '<option value="">Primary key: none</option>',
      ...keys.map((key) => `<option value="${escapeAttr(key)}">${escapeHtml(key)}</option>`),
    ].join('');
    pk.value = keys.includes(active) ? active : '';
  }

  function renderRecords(): void {
    const key = currentOptions.primaryKey;
    const allItems = allRecordItems();
    const items = visibleRecordItems();
    const nextScrollTop = recordsScrollTop;
    const allHidden = items.length > 0 && items.every((item) => currentOptions.hiddenFeatureIds.has(item.featureId));

    records.dataset.visible = String(expanded);
    expandBtn.textContent = expanded ? 'Records ▴' : 'Records ▾';
    expandBtn.disabled = allItems.length === 0;
    sortBtn.textContent = sortAsc ? 'A→Z' : 'Z→A';
    bulkVisibleBtn.innerHTML = eyeIcon(allHidden);
    bulkVisibleBtn.setAttribute('aria-label', allHidden ? 'Show all matching records' : 'Hide all matching records');

    if (!expanded) return;
    if (!key) {
      recordsList.innerHTML = '<div class="mv-layer-row__records-empty">Pick a primary key first.</div>';
      recordsScrollTop = 0;
      return;
    }
    if (items.length === 0) {
      recordsList.innerHTML = '<div class="mv-layer-row__records-empty">No matching records.</div>';
      recordsScrollTop = 0;
      return;
    }
    recordsList.innerHTML = '';
    for (const item of items) {
      recordsList.appendChild(recordRow(item));
    }
    recordsList.scrollTop = nextScrollTop;
    requestAnimationFrame(() => {
      recordsList.scrollTop = nextScrollTop;
    });
  }

  function allRecordItems(): ReadonlyArray<FeatureOption> {
    const key = currentOptions.primaryKey;
    return key ? currentOptions.meta?.featuresByKey[key] ?? [] : [];
  }

  function visibleRecordItems(): FeatureOption[] {
    const normalizedQuery = query.trim().toLowerCase();
    return [...allRecordItems()]
      .filter((item) => normalizedQuery === '' || item.label.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => sortAsc ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label));
  }

  function recordRow(item: FeatureOption): HTMLElement {
    const hidden = currentOptions.hiddenFeatureIds.has(item.featureId);
    const root = document.createElement('div');
    root.className = 'mv-feature-record';
    root.dataset.hidden = String(hidden);

    const visible = iconButton('mv-feature-record__vis', hidden ? 'Show record' : 'Hide record', eyeIcon(!hidden));
    visible.addEventListener('click', () => onFeatureVisible(current.id, item.featureId, hidden));

    const label = document.createElement('span');
    label.className = 'mv-feature-record__value';
    label.textContent = item.label;
    label.title = item.label;

    const zoom = iconButton('mv-feature-record__zoom', 'Zoom to record', 'Zoom');
    zoom.addEventListener('click', () => onLocateFeature(current.id, item.featureId));

    root.append(visible, label, zoom);
    return root;
  }
}

function iconButton(className: string, label: string, content: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.innerHTML = content;
  return button;
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
