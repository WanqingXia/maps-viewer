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

  const setHover = (featureId: number | string, on: boolean): void => {
    map.setFeatureState({ source: layerId, id: featureId }, { hover: on });
  };

  const clearHover = (): void => {
    if (lastFeatureId !== null) {
      setHover(lastFeatureId, false);
      lastFeatureId = null;
    }
    popup.hide();
  };

  const handleMove = (e: unknown): void => {
    const event = e as {
      features?: ReadonlyArray<{ id?: number | string; properties?: Record<string, unknown> | null }>;
      point?: { x: number; y: number };
    };
    const feature = event.features?.[0];
    if (!feature || feature.id == null) return;
    if (lastFeatureId !== null && lastFeatureId !== feature.id) setHover(lastFeatureId, false);
    lastFeatureId = feature.id;
    setHover(feature.id, true);
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
