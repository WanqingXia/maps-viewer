import { AUTO_PALETTE, type CountryBbox, type CountryCode, type LayerFeatureMetaMap, type LayerState, type Layer, type Group, type PrimaryKeyMap, type UserAction } from '@maps-viewer/shared';
import { mountLayerRow, type LayerRow, type LayerRowOptions } from './layer-row.js';
import { mountGroupHeader, type GroupHeader } from './group-header.js';

export interface LayersPanel {
  element: HTMLElement;
  update(options: LayersPanelUpdate): void;
  destroy(): void;
}

export interface LayersPanelUpdate {
  readonly state: LayerState;
  readonly primaryKeyByLayer: PrimaryKeyMap;
  readonly layerFeatureMeta: LayerFeatureMetaMap;
  readonly hiddenFeatureIds: ReadonlyMap<string, ReadonlySet<number | string>>;
  readonly countries: ReadonlyArray<CountryBbox>;
  readonly country: CountryCode | null;
}

/**
 * Sidebar listing all layers + groups with per-row controls. Plain DOM,
 * diff-based update so per-keystroke renames don't blow away controls.
 */
export function mountLayersPanel(
  container: HTMLElement,
  initial: LayersPanelUpdate,
  onAction: (a: UserAction) => void,
  onCountry: (country: CountryCode | null) => void,
  onPrimaryKey: (layerId: string, key: string | null) => void,
  onLocateFeature: (layerId: string, featureId: number) => void,
  onFeatureVisible: (layerId: string, featureId: number, visible: boolean) => void,
): LayersPanel {
  const root = document.createElement('aside');
  root.className = 'mv-layers-panel';
  root.setAttribute('aria-label', 'Layers');

  const header = document.createElement('div');
  header.className = 'mv-layers-panel__header';
  const title = document.createElement('h2');
  title.textContent = 'Layers';
  title.className = 'mv-layers-panel__title';
  const count = document.createElement('span');
  count.className = 'mv-layers-panel__count';
  const groupBtn = document.createElement('button');
  groupBtn.type = 'button';
  groupBtn.className = 'mv-layers-panel__group';
  groupBtn.textContent = 'Group';
  groupBtn.disabled = true;
  groupBtn.title = 'Group selected layers';
  const country = document.createElement('select');
  country.className = 'mv-layers-panel__country';
  country.setAttribute('aria-label', 'Country scope');
  header.appendChild(title);
  header.appendChild(count);
  header.appendChild(groupBtn);
  root.appendChild(header);
  root.appendChild(country);

  const body = document.createElement('div');
  body.className = 'mv-layers-panel__body';
  root.appendChild(body);

  container.appendChild(root);

  const layerRows = new Map<string, LayerRow>();
  const groupHeaders = new Map<string, GroupHeader>();
  const selectedLayerIds = new Set<string>();

  groupBtn.addEventListener('click', () => {
    const layerIds = [...selectedLayerIds];
    if (layerIds.length < 2) return;
    const state = lastUpdate.state;
    const group = {
      id: `group-${Date.now()}`,
      name: `Group ${state.groups.length + 1}`,
      color: AUTO_PALETTE[state.groups.length % AUTO_PALETTE.length]!,
      visible: true,
    };
    onAction({ type: 'createGroup', group, layerIds });
    selectedLayerIds.clear();
  });

  country.addEventListener('change', () => {
    onCountry(country.value === '' ? null : country.value);
  });

  let lastUpdate = initial;

  function update(options: LayersPanelUpdate): void {
    lastUpdate = options;
    const { state } = options;
    count.textContent = `(${state.layers.length})`;
    groupBtn.disabled = selectedLayerIds.size < 2;
    renderCountries(options);

    // Build the new DOM order: groups in order of first appearance, then
    // ungrouped layers (in array order).
    const groupOrder: string[] = [];
    const layersByGroup = new Map<string | null, Layer[]>();
    layersByGroup.set(null, []);
    for (const layer of state.layers) {
      const key = layer.groupId;
      if (key !== null && !groupOrder.includes(key)) groupOrder.push(key);
      const bucket = layersByGroup.get(key) ?? [];
      bucket.push(layer);
      layersByGroup.set(key, bucket);
    }

    const nextLayerIds = new Set(state.layers.map((l) => l.id));
    const nextGroupIds = new Set(state.groups.map((g) => g.id));

    // Drop rows / headers that no longer exist
    for (const [id, row] of layerRows) {
      if (!nextLayerIds.has(id)) { row.destroy(); layerRows.delete(id); }
    }
    for (const [id, head] of groupHeaders) {
      if (!nextGroupIds.has(id)) { head.destroy(); groupHeaders.delete(id); }
    }

    body.innerHTML = '';

    // Groups first
    for (const groupId of groupOrder) {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) continue;
      let head = groupHeaders.get(group.id);
      if (!head) {
        head = mountGroupHeader(group, onAction);
        groupHeaders.set(group.id, head);
      } else {
        head.update(group);
      }
      body.appendChild(head.element);
      const members = layersByGroup.get(group.id) ?? [];
      for (const layer of members) {
        renderLayerRow(layer);
      }
    }

    // Then ungrouped layers
    const ungrouped = layersByGroup.get(null) ?? [];
    if (ungrouped.length > 0) {
      const ungroupedHeader = document.createElement('div');
      ungroupedHeader.className = 'mv-layers-panel__ungrouped-label';
      ungroupedHeader.textContent = '(ungrouped)';
      if (groupOrder.length > 0) body.appendChild(ungroupedHeader);
      for (const layer of ungrouped) renderLayerRow(layer);
    }

    function renderLayerRow(layer: Layer): void {
      let row = layerRows.get(layer.id);
      if (!row) {
        row = mountLayerRow(
          toRowOptions(layer, options),
          onAction,
          (layerId, selected) => {
            if (selected) selectedLayerIds.add(layerId);
            else selectedLayerIds.delete(layerId);
            groupBtn.disabled = selectedLayerIds.size < 2;
            update(lastUpdate);
          },
          onPrimaryKey,
          onLocateFeature,
          onFeatureVisible,
        );
        layerRows.set(layer.id, row);
      } else {
        row.update(toRowOptions(layer, options));
      }
      body.appendChild(row.element);
    }
  }

  update(initial);

  return {
    element: root,
    update,
    destroy() {
      for (const row of layerRows.values()) row.destroy();
      for (const head of groupHeaders.values()) head.destroy();
      layerRows.clear();
      groupHeaders.clear();
      root.remove();
    },
  };

  function toRowOptions(layer: Layer, options: LayersPanelUpdate): LayerRowOptions {
    return {
      layer,
      selected: selectedLayerIds.has(layer.id),
      primaryKey: options.primaryKeyByLayer[layer.id] ?? null,
      meta: options.layerFeatureMeta[layer.id],
      hiddenFeatureIds: options.hiddenFeatureIds.get(layer.id) ?? new Set(),
    };
  }

  function renderCountries(options: LayersPanelUpdate): void {
    const value = options.country ?? '';
    country.innerHTML = [
      '<option value="">World</option>',
      ...options.countries
        .map((item) => `<option value="${escapeAttr(item.code)}">${escapeHtml(item.name)}</option>`),
    ].join('');
    country.value = value;
  }
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
