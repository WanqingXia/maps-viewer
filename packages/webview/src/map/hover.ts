import { sublayerIds } from './render-layer.js';

interface PopupHandle {
  show(x: number, y: number, props: Record<string, unknown>): void;
  hide(): void;
}

/**
 * Attach hover-to-highlight + properties-popup behavior to a layer.
 *
 * On `mousemove` over any of the layer's three sub-layers:
 *   - set canvas cursor to pointer
 *   - clear previous hover feature-state, set hover=true on the new one
 *   - show the popup with the feature's properties
 *
 * On `mouseleave` (when the mouse exits all three sub-layers):
 *   - clear the cursor, hover state, and popup
 */
export function wireHover(
  map: unknown,
  layerId: string,
  popup: PopupHandle,
): void {
  const mapAny = map as {
    getCanvas(): HTMLCanvasElement;
    on(event: string, layer: string, handler: (e: HoverEvent) => void): void;
    off(event: string, handler: (e: unknown) => void): void;
    setFeatureState(t: { source: string; id: number | string }, s: Record<string, unknown>): void;
    removeFeatureState(t: { source: string; id?: number | string }): void;
  };

  let lastHoverId: number | string | null = null;
  const sublayers = sublayerIds(layerId);

  const onMove = (e: HoverEvent) => {
    const f = e.features?.[0];
    if (!f || f.id == null) return;
    mapAny.getCanvas().style.cursor = 'pointer';
    if (lastHoverId !== null && lastHoverId !== f.id) {
      mapAny.setFeatureState({ source: layerId, id: lastHoverId }, { hover: false });
    }
    lastHoverId = f.id;
    mapAny.setFeatureState({ source: layerId, id: f.id }, { hover: true });
    const [x, y] = [e.point.x, e.point.y];
    popup.show(x, y, f.properties ?? {});
  };

  const onLeave = () => {
    mapAny.getCanvas().style.cursor = '';
    if (lastHoverId !== null) {
      mapAny.setFeatureState({ source: layerId, id: lastHoverId }, { hover: false });
      lastHoverId = null;
    }
    popup.hide();
  };

  for (const subId of sublayers) {
    mapAny.on('mousemove', subId, onMove);
    mapAny.on('mouseleave', subId, onLeave);
  }
}

interface HoverEvent {
  point: { x: number; y: number };
  features?: Array<{
    id: number | string | undefined;
    properties: Record<string, unknown> | null;
  }>;
}
