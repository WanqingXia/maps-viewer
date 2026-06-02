import type { LayerState, Layer, Group, UserAction } from '@maps-viewer/shared';
import { mountLayerRow, type LayerRow } from './layer-row.js';
import { mountGroupHeader, type GroupHeader } from './group-header.js';

export interface LayersPanel {
  element: HTMLElement;
  update(state: LayerState): void;
  destroy(): void;
}

/**
 * Sidebar listing all layers + groups with per-row controls. Plain DOM,
 * diff-based update so per-keystroke renames don't blow away controls.
 */
export function mountLayersPanel(
  container: HTMLElement,
  initial: LayerState,
  onAction: (a: UserAction) => void,
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
  header.appendChild(title);
  header.appendChild(count);
  root.appendChild(header);

  const body = document.createElement('div');
  body.className = 'mv-layers-panel__body';
  root.appendChild(body);

  container.appendChild(root);

  const layerRows = new Map<string, LayerRow>();
  const groupHeaders = new Map<string, GroupHeader>();

  function update(state: LayerState): void {
    count.textContent = `(${state.layers.length})`;

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
        row = mountLayerRow(layer, onAction);
        layerRows.set(layer.id, row);
      } else {
        row.update(layer);
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
}
