import type {
  LayerState,
  LayerAction,
  Layer,
  Group,
} from '@maps-viewer/shared';
import { STROKE_WIDTH_MIN, STROKE_WIDTH_MAX } from '@maps-viewer/shared';

/**
 * Pure reducer for `LayerState`.
 *
 * Invariants:
 *   - Never mutates the input state — every successful action returns a
 *     new `LayerState` with fresh `layers` / `groups` arrays.
 *   - `addLayer` with a duplicate id is a no-op (returns the original
 *     state). Caller is expected to generate unique ids; the reducer
 *     refuses to corrupt state if it doesn't.
 *   - `setGroupColor` cascades to all member layers' `color`.
 *   - `setLayerColor` on a grouped layer does NOT update the group's
 *     color — the layer "breaks" from the cascade until manually
 *     regrouped.
 *   - `deleteGroup` un-parents members (sets their `groupId` to null).
 *   - Unknown action types throw at compile time via the exhaustive
 *     switch + `never` check; at runtime an unknown action returns the
 *     original state.
 *   - `setLayerStrokeWidth` clamps to [0, 30].
 */
export function reduce(state: LayerState, action: LayerAction): LayerState {
  switch (action.type) {
    case 'addLayer': {
      if (state.layers.some((l) => l.id === action.layer.id)) return state;
      return { ...state, layers: [...state.layers, action.layer] };
    }

    case 'removeLayer': {
      const next = state.layers.filter((l) => l.id !== action.layerId);
      if (next.length === state.layers.length) return state;
      return { ...state, layers: next };
    }

    case 'renameLayer': {
      const name = normaliseName(action.name);
      let changed = false;
      const next = state.layers.map((l) => {
        if (l.id !== action.layerId) return l;
        const displayName = name === '' ? l.fileName : name;
        if (displayName === l.displayName) return l;
        changed = true;
        return { ...l, displayName };
      });
      return changed ? { ...state, layers: next } : state;
    }

    case 'setLayerColor': {
      let changed = false;
      const next = state.layers.map((l) => {
        if (l.id !== action.layerId || l.color === action.color) return l;
        changed = true;
        return { ...l, color: action.color };
      });
      return changed ? { ...state, layers: next } : state;
    }

    case 'setLayerStrokeWidth': {
      const width = clamp(action.width, STROKE_WIDTH_MIN, STROKE_WIDTH_MAX);
      let changed = false;
      const next = state.layers.map((l) => {
        if (l.id !== action.layerId || l.strokeWidth === width) return l;
        changed = true;
        return { ...l, strokeWidth: width };
      });
      return changed ? { ...state, layers: next } : state;
    }

    case 'setLayerVisible': {
      let changed = false;
      const next = state.layers.map((l) => {
        if (l.id !== action.layerId || l.visible === action.visible) return l;
        changed = true;
        return { ...l, visible: action.visible };
      });
      return changed ? { ...state, layers: next } : state;
    }

    case 'createGroup': {
      if (state.groups.some((g) => g.id === action.group.id)) return state;
      const memberIds = new Set(action.layerIds);
      const groupColor = action.group.color;
      let layersChanged = false;
      const nextLayers = state.layers.map((l) => {
        if (!memberIds.has(l.id)) return l;
        if (l.groupId === action.group.id && l.color === groupColor) return l;
        layersChanged = true;
        return { ...l, groupId: action.group.id, color: groupColor };
      });
      return {
        layers: layersChanged ? nextLayers : state.layers,
        groups: [...state.groups, action.group],
      };
    }

    case 'renameGroup': {
      const name = normaliseName(action.name) || 'Untitled';
      let changed = false;
      const next = state.groups.map((g) => {
        if (g.id !== action.groupId || g.name === name) return g;
        changed = true;
        return { ...g, name };
      });
      return changed ? { ...state, groups: next } : state;
    }

    case 'setGroupColor': {
      let groupsChanged = false;
      const nextGroups = state.groups.map((g) => {
        if (g.id !== action.groupId || g.color === action.color) return g;
        groupsChanged = true;
        return { ...g, color: action.color };
      });
      if (!groupsChanged) return state;
      const nextLayers = state.layers.map((l) =>
        l.groupId === action.groupId && l.color !== action.color
          ? { ...l, color: action.color }
          : l,
      );
      return { layers: nextLayers, groups: nextGroups };
    }

    case 'setGroupVisible': {
      let groupsChanged = false;
      const nextGroups = state.groups.map((g) => {
        if (g.id !== action.groupId || g.visible === action.visible) return g;
        groupsChanged = true;
        return { ...g, visible: action.visible };
      });
      if (!groupsChanged) return state;
      const nextLayers = state.layers.map((l) =>
        l.groupId === action.groupId && l.visible !== action.visible
          ? { ...l, visible: action.visible }
          : l,
      );
      return { layers: nextLayers, groups: nextGroups };
    }

    case 'deleteGroup': {
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      if (groups.length === state.groups.length) return state;
      const layers = state.layers.map((l) =>
        l.groupId === action.groupId
          ? { ...l, groupId: null, color: action.restoredColors?.[l.id] ?? l.color }
          : l,
      );
      return { layers, groups };
    }

    case 'addToGroup': {
      const group = state.groups.find((g) => g.id === action.groupId);
      if (!group) return state;
      let changed = false;
      const nextLayers = state.layers.map((l) => {
        if (l.id !== action.layerId) return l;
        if (l.groupId === group.id && l.color === group.color) return l;
        changed = true;
        return { ...l, groupId: group.id, color: group.color };
      });
      return changed ? { ...state, layers: nextLayers } : state;
    }

    case 'removeFromGroup': {
      let changed = false;
      const nextLayers = state.layers.map((l) => {
        if (l.id !== action.layerId || l.groupId === null) return l;
        changed = true;
        return { ...l, groupId: null, color: action.color ?? l.color };
      });
      return changed ? { ...state, layers: nextLayers } : state;
    }

    case 'moveLayer': {
      const currentIndex = state.layers.findIndex((l) => l.id === action.layerId);
      if (currentIndex < 0) return state;
      const targetGroup = action.targetGroupId
        ? state.groups.find((g) => g.id === action.targetGroupId)
        : undefined;
      if (action.targetGroupId && !targetGroup) return state;

      const remaining = state.layers.filter((l) => l.id !== action.layerId);
      const nextLayer = {
        ...state.layers[currentIndex]!,
        groupId: action.targetGroupId,
        color: targetGroup?.color ?? action.color ?? state.layers[currentIndex]!.color,
      };
      const targetIndex = clamp(action.targetIndex, 0, remaining.length);
      const layers = [
        ...remaining.slice(0, targetIndex),
        nextLayer,
        ...remaining.slice(targetIndex),
      ];
      return { ...state, layers };
    }

    default: {
      // Exhaustiveness check — TypeScript will complain if a new action
      // variant is added and not handled above.
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}

/** Apply a sequence of actions to a starting state (left fold). */
export function applyActions(state: LayerState, actions: ReadonlyArray<LayerAction>): LayerState {
  return actions.reduce(reduce, state);
}

/** Look up a layer by id. */
export function findLayer(state: LayerState, layerId: string): Layer | undefined {
  return state.layers.find((l) => l.id === layerId);
}

/** Look up a group by id. */
export function findGroup(state: LayerState, groupId: string): Group | undefined {
  return state.groups.find((g) => g.id === groupId);
}

/** All layers belonging to a given group (in current order). */
export function layersInGroup(state: LayerState, groupId: string): ReadonlyArray<Layer> {
  return state.layers.filter((l) => l.groupId === groupId);
}

function normaliseName(input: string): string {
  return input.trim();
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
