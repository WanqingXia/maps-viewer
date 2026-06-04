import type { PropertiesPopup } from '../ui/properties-popup.js';
import { sublayerIds } from './render-layer.js';

/**
 * Wire hover highlight + properties popup for a layer's 3 sublayers.
 *
 * `getLayerName` is called every mouseenter so renaming via Layer state
 * is reflected immediately — no need to re-wire on every rename.
 *
 * Returns a disposer that removes all listeners + clears active hover.
 */
export function wireHover(
  map: MapboxMapInstance,
  layerId: string,
  popup: PropertiesPopup,
  getLayerName: () => string,
): () => void {
  const sublayers = sublayerIds(layerId);
  let lastFeatureId: number | string | null = null;
  let lastSource = layerId;

  const setHover = (source: string, featureId: number | string, on: boolean): void => {
    map.setFeatureState({ source, id: featureId }, { hover: on });
  };

  const clearHover = (): void => {
    if (lastFeatureId !== null) {
      setHover(lastSource, lastFeatureId, false);
      lastFeatureId = null;
      lastSource = layerId;
    }
    popup.hide();
  };

  const handleMove = (e: unknown): void => {
    const event = e as {
      features?: ReadonlyArray<{ id?: number | string; source?: string; properties?: Record<string, unknown> | null }>;
      point?: { x: number; y: number };
    };
    const feature = event.features?.[0];
    if (!feature || feature.id == null) return;
    const source = feature.source ?? layerId;
    if (lastFeatureId !== null && (lastFeatureId !== feature.id || lastSource !== source)) {
      setHover(lastSource, lastFeatureId, false);
    }
    lastFeatureId = feature.id;
    lastSource = source;
    setHover(source, feature.id, true);
    if (event.point) popup.show(event.point.x, event.point.y, getLayerName(), feature.properties ?? null);
  };

  const handleLeave = (): void => clearHover();

  for (const sub of sublayers) {
    map.on('mousemove', sub, handleMove);
    map.on('mouseleave', sub, handleLeave);
  }

  return () => {
    for (const sub of sublayers) {
      map.off('mousemove', sub, handleMove);
      map.off('mouseleave', sub, handleLeave);
    }
    clearHover();
  };
}
