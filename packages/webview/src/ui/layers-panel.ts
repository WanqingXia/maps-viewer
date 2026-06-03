import { AUTO_PALETTE, type ColorHex, type CountryBbox, type CountryCode, type LayerFeatureMetaMap, type LayerState, type Layer, type PrimaryKeyMap, type UserAction } from '@maps-viewer/shared';
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
  onFeaturesVisible: (layerId: string, featureIds: ReadonlyArray<number>, visible: boolean) => void,
  onAddLayer: () => void,
  onSaveProject: () => void,
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
  groupBtn.textContent = 'New Group';
  groupBtn.title = 'Create a new group';
  const country = document.createElement('select');
  country.className = 'mv-layers-panel__country';
  country.setAttribute('aria-label', 'Country scope');
  const countryRow = document.createElement('div');
  countryRow.className = 'mv-layers-panel__country-row';
  const countryLabel = document.createElement('span');
  countryLabel.className = 'mv-layers-panel__country-label';
  countryLabel.textContent = 'Country View:';
  countryRow.append(countryLabel, country);
  header.appendChild(title);
  header.appendChild(count);
  header.appendChild(groupBtn);
  root.appendChild(header);
  root.appendChild(countryRow);

  const body = document.createElement('div');
  body.className = 'mv-layers-panel__body';
  root.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'mv-layers-panel__footer';
  const addLayer = document.createElement('button');
  addLayer.type = 'button';
  addLayer.className = 'mv-layers-panel__footer-button';
  addLayer.textContent = 'Add Layer';
  const saveProject = document.createElement('button');
  saveProject.type = 'button';
  saveProject.className = 'mv-layers-panel__footer-button';
  saveProject.textContent = 'Save Project';
  footer.append(addLayer, saveProject);
  root.appendChild(footer);

  container.appendChild(root);

  const layerRows = new Map<string, LayerRow>();
  const groupHeaders = new Map<string, GroupHeader>();
  groupBtn.addEventListener('click', () => {
    const state = lastUpdate.state;
    const group = {
      id: `group-${Date.now()}`,
      name: `Group ${state.groups.length + 1}`,
      color: AUTO_PALETTE[state.groups.length % AUTO_PALETTE.length]!,
      visible: true,
    };
    onAction({ type: 'createGroup', group, layerIds: [] });
  });

  country.addEventListener('change', () => {
    onCountry(country.value === '' ? null : country.value);
  });
  addLayer.addEventListener('click', onAddLayer);
  saveProject.addEventListener('click', onSaveProject);

  let lastUpdate = initial;

  function update(options: LayersPanelUpdate): void {
    lastUpdate = options;
    const { state } = options;
    count.textContent = `(${state.layers.length})`;
    renderCountries(options);

    const layersByGroup = new Map<string | null, Layer[]>();
    layersByGroup.set(null, []);
    for (const layer of state.layers) {
      const key = layer.groupId;
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

    // Groups first, including empty groups that can receive layers.
    for (const group of state.groups) {
      let head = groupHeaders.get(group.id);
      if (!head) {
        head = mountGroupHeader(group, (action) => onAction(withComputedColors(action)));
        groupHeaders.set(group.id, head);
      } else {
        head.update(group);
      }
      body.appendChild(head.element);
      wireDropTarget(head.element, group.id, 0);
      const members = layersByGroup.get(group.id) ?? [];
      for (const layer of members) {
        renderLayerRow(layer);
      }
    }

    // Then ungrouped layers
    const ungrouped = layersByGroup.get(null) ?? [];
    if (ungrouped.length > 0 || state.groups.length > 0) {
      const ungroupedHeader = document.createElement('div');
      ungroupedHeader.className = 'mv-layers-panel__ungrouped-label';
      ungroupedHeader.textContent = '(ungrouped)';
      wireDropTarget(ungroupedHeader, null, ungroupedStartIndex());
      body.appendChild(ungroupedHeader);
      for (const layer of ungrouped) renderLayerRow(layer);
    }

    function renderLayerRow(layer: Layer): void {
      let row = layerRows.get(layer.id);
      if (!row) {
        row = mountLayerRow(
          toRowOptions(layer, options),
          onAction,
          onPrimaryKey,
          onLocateFeature,
          onFeatureVisible,
          onFeaturesVisible,
        );
        layerRows.set(layer.id, row);
      } else {
        row.update(toRowOptions(layer, options));
      }
      const targetIndex = state.layers.filter((l) => l.groupId === layer.groupId).findIndex((l) => l.id === layer.id) + 1;
      wireDropTarget(row.element, layer.groupId, targetIndex);
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

  function wireDropTarget(element: HTMLElement, targetGroupId: string | null, positionInGroup: number): void {
    element.dataset.dropGroupId = targetGroupId ?? '';
    element.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('application/x-maps-viewer-layer')) return;
      event.preventDefault();
      element.dataset.dragOver = 'true';
    });
    element.addEventListener('dragleave', () => {
      element.dataset.dragOver = 'false';
    });
    element.addEventListener('drop', (event) => {
      event.preventDefault();
      element.dataset.dragOver = 'false';
      const layerId = event.dataTransfer?.getData('application/x-maps-viewer-layer')
        || event.dataTransfer?.getData('text/plain');
      if (!layerId) return;
      const action = moveAction(layerId, targetGroupId, positionInGroup);
      if (action) onAction(action);
    });
  }

  function moveAction(layerId: string, targetGroupId: string | null, positionInGroup: number): UserAction | null {
    const layer = lastUpdate.state.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    if (layer.groupId === targetGroupId) {
      const currentGroupIndex = lastUpdate.state.layers
        .filter((l) => l.groupId === targetGroupId)
        .findIndex((l) => l.id === layerId);
      if (positionInGroup === currentGroupIndex || positionInGroup === currentGroupIndex + 1) return null;
    }
    const color = targetGroupId
      ? lastUpdate.state.groups.find((g) => g.id === targetGroupId)?.color ?? layer.color
      : nextUnusedColor(lastUpdate.state, layerId);
    const remaining = lastUpdate.state.layers.filter((l) => l.id !== layerId);
    const targetIndex = targetIndexForGroupPosition(remaining, targetGroupId, positionInGroup);
    return { type: 'moveLayer', layerId, targetGroupId, targetIndex, color };
  }

  function targetIndexForGroupPosition(
    layers: ReadonlyArray<Layer>,
    targetGroupId: string | null,
    positionInGroup: number,
  ): number {
    const groupMembers = layers.filter((l) => l.groupId === targetGroupId);
    if (positionInGroup <= 0) {
      const first = layers.findIndex((l) => l.groupId === targetGroupId);
      return first >= 0 ? first : insertionPointForEmptyGroup(layers, targetGroupId);
    }
    if (positionInGroup >= groupMembers.length) {
      const last = lastIndexOfGroup(layers, targetGroupId);
      return last >= 0 ? last + 1 : insertionPointForEmptyGroup(layers, targetGroupId);
    }
    const target = groupMembers[positionInGroup];
    return target ? layers.findIndex((l) => l.id === target.id) : layers.length;
  }

  function insertionPointForEmptyGroup(layers: ReadonlyArray<Layer>, targetGroupId: string | null): number {
    if (targetGroupId === null) return layers.length;
    const groupIndex = lastUpdate.state.groups.findIndex((g) => g.id === targetGroupId);
    const previousGroupIds = new Set(lastUpdate.state.groups.slice(0, groupIndex).map((g) => g.id));
    const afterPreviousGroups = lastIndexMatching(layers, (l) => l.groupId !== null && previousGroupIds.has(l.groupId));
    return afterPreviousGroups + 1;
  }

  function lastIndexOfGroup(layers: ReadonlyArray<Layer>, groupId: string | null): number {
    return lastIndexMatching(layers, (l) => l.groupId === groupId);
  }

  function lastIndexMatching(layers: ReadonlyArray<Layer>, predicate: (layer: Layer) => boolean): number {
    for (let i = layers.length - 1; i >= 0; i--) {
      if (predicate(layers[i]!)) return i;
    }
    return -1;
  }

  function ungroupedStartIndex(): number {
    return lastUpdate.state.layers.filter((l) => l.groupId === null).length;
  }

  function withComputedColors(action: UserAction): UserAction {
    if (action.type !== 'deleteGroup') return action;
    const restoredColors: Record<string, ColorHex> = {};
    const members = lastUpdate.state.layers.filter((l) => l.groupId === action.groupId);
    let state = lastUpdate.state;
    for (const member of members) {
      const color = nextUnusedColor(state, member.id, restoredColors);
      restoredColors[member.id] = color;
      state = { ...state, layers: state.layers.map((l) => l.id === member.id ? { ...l, color } : l) };
    }
    return { ...action, restoredColors };
  }

  function nextUnusedColor(
    state: LayerState,
    layerId: string,
    reserved: Readonly<Record<string, ColorHex>> = {},
  ): ColorHex {
    const used = new Set<ColorHex>();
    for (const group of state.groups) used.add(group.color);
    for (const layer of state.layers) {
      if (layer.id !== layerId && layer.groupId === null) used.add(layer.color);
    }
    for (const color of Object.values(reserved)) used.add(color);
    return AUTO_PALETTE.find((color) => !used.has(color)) ?? AUTO_PALETTE[0]!;
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
