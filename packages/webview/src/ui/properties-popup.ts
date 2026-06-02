/**
 * Floating panel that shows the layer name + properties of the currently
 * hovered feature. Position-anchored to the map container; lives in its
 * own DOM node so it can sit above the Mapbox canvas.
 */
export interface PropertiesPopup {
  /**
   * @param title  Layer display name shown as the popup heading (e.g. fileName)
   * @param props  Feature properties (may be null for featureless geometries)
   */
  show(x: number, y: number, title: string, props: Record<string, unknown> | null): void;
  hide(): void;
  destroy(): void;
}

const MAX_PROPS_SHOWN = 12;
const TRUNCATE_VALUE_AT = 80;

export function mountPropertiesPopup(container: HTMLElement): PropertiesPopup {
  const root = document.createElement('div');
  root.className = 'mv-props-popup mv-popup';
  root.setAttribute('aria-hidden', 'true');
  root.style.display = 'none';
  container.append(root);

  return {
    show(x, y, title, props) {
      const safeProps = props ?? {};
      const keys = Object.keys(safeProps);
      const titleHtml = `<div class="mv-popup__title">${escapeHtml(title)}</div>`;
      if (keys.length === 0) {
        root.innerHTML = `${titleHtml}<div class="mv-popup__empty">(no properties)</div>`;
      } else {
        const shown = keys.slice(0, MAX_PROPS_SHOWN);
        const rows = shown
          .map(
            (k) =>
              `<div class="mv-popup__row"><span class="mv-popup__key">${escapeHtml(k)}</span><strong class="mv-popup__value">${escapeHtml(formatValue(safeProps[k]))}</strong></div>`,
          )
          .join('');
        const more = keys.length > MAX_PROPS_SHOWN
          ? `<div class="mv-popup__more">+${keys.length - MAX_PROPS_SHOWN} more</div>`
          : '';
        root.innerHTML = `${titleHtml}${rows}${more}`;
      }
      const rect = container.getBoundingClientRect();
      const popupW = root.offsetWidth || 240;
      const popupH = root.offsetHeight || 80;
      const xClamped = Math.min(Math.max(x + 12, 8), rect.width - popupW - 8);
      const yClamped = Math.min(Math.max(y + 12, 8), rect.height - popupH - 8);
      root.style.left = `${xClamped}px`;
      root.style.top = `${yClamped}px`;
      root.style.display = 'block';
      root.dataset.visible = 'true';
      root.setAttribute('aria-hidden', 'false');
    },
    hide() {
      root.style.display = 'none';
      root.dataset.visible = 'false';
      root.setAttribute('aria-hidden', 'true');
    },
    destroy() {
      root.remove();
    },
  };
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > TRUNCATE_VALUE_AT ? `${v.slice(0, TRUNCATE_VALUE_AT)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > TRUNCATE_VALUE_AT ? `${s.slice(0, TRUNCATE_VALUE_AT)}…` : s;
  } catch {
    return String(v);
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
