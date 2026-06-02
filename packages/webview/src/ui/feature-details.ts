export interface FeatureDetailsModel {
  readonly layerName: string;
  readonly featureId: number | string;
  readonly properties: Record<string, unknown> | null;
  readonly hidden: boolean;
}

export interface FeatureDetails {
  element: HTMLElement;
  show(model: FeatureDetailsModel): void;
  hide(): void;
  setHidden(hidden: boolean): void;
  destroy(): void;
}

const MAX_ROWS = 32;
const TRUNCATE_VALUE_AT = 160;

export function mountFeatureDetails(
  container: HTMLElement,
  onZoom: () => void,
  onToggleVisible: () => void,
): FeatureDetails {
  const root = document.createElement('section');
  root.className = 'mv-feature-details';
  root.setAttribute('aria-label', 'Selected feature details');
  root.dataset.visible = 'false';

  const header = document.createElement('div');
  header.className = 'mv-feature-details__header';

  const title = document.createElement('div');
  title.className = 'mv-feature-details__title';

  const actions = document.createElement('div');
  actions.className = 'mv-feature-details__actions';

  const zoomBtn = document.createElement('button');
  zoomBtn.type = 'button';
  zoomBtn.className = 'mv-feature-details__button';
  zoomBtn.textContent = 'Zoom';
  zoomBtn.addEventListener('click', onZoom);

  const visibleBtn = document.createElement('button');
  visibleBtn.type = 'button';
  visibleBtn.className = 'mv-feature-details__button';
  visibleBtn.addEventListener('click', onToggleVisible);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mv-feature-details__close';
  closeBtn.textContent = 'x';
  closeBtn.setAttribute('aria-label', 'Close feature details');
  closeBtn.addEventListener('click', () => {
    root.dataset.visible = 'false';
  });

  actions.append(zoomBtn, visibleBtn, closeBtn);
  header.append(title, actions);

  const body = document.createElement('div');
  body.className = 'mv-feature-details__body';
  root.append(header, body);
  container.append(root);

  function setHidden(hidden: boolean): void {
    root.dataset.hiddenFeature = String(hidden);
    visibleBtn.textContent = hidden ? 'Show' : 'Hide';
    visibleBtn.setAttribute('aria-label', hidden ? 'Show selected feature' : 'Hide selected feature');
  }

  return {
    element: root,
    show(model) {
      title.textContent = `${model.layerName} · feature ${String(model.featureId)}`;
      const props = model.properties ?? {};
      const keys = Object.keys(props);
      if (keys.length === 0) {
        body.innerHTML = '<div class="mv-feature-details__empty">(no properties)</div>';
      } else {
        body.innerHTML = keys.slice(0, MAX_ROWS).map((key) => {
          return `<div class="mv-feature-details__row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(formatValue(props[key]))}</strong></div>`;
        }).join('');
      }
      setHidden(model.hidden);
      root.dataset.visible = 'true';
    },
    hide() {
      root.dataset.visible = 'false';
    },
    setHidden,
    destroy() {
      root.remove();
    },
  };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value.length > TRUNCATE_VALUE_AT ? `${value.slice(0, TRUNCATE_VALUE_AT)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const asJson = JSON.stringify(value);
    return asJson.length > TRUNCATE_VALUE_AT ? `${asJson.slice(0, TRUNCATE_VALUE_AT)}...` : asJson;
  } catch {
    return String(value);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
