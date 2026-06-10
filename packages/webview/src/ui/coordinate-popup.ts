export interface CoordinatePopup {
  showPointInfo(
    x: number,
    y: number,
    lat: number,
    lng: number,
    actions: {
      readonly onQueryOsm: () => void;
      readonly onGoogleStreetView: () => void;
      readonly onOpenOsm: () => void;
      readonly onOpenGraphHopper: () => void;
    },
  ): void;
  hide(): void;
  destroy(): void;
}

const COORD_DECIMALS = 7;

export function mountCoordinatePopup(container: HTMLElement): CoordinatePopup {
  const root = document.createElement('div');
  root.className = 'mv-coordinate-popup';
  root.dataset.visible = 'false';
  root.setAttribute('aria-hidden', 'true');
  container.append(root);

  function position(x: number, y: number): void {
    const rect = container.getBoundingClientRect();
    const popupW = root.offsetWidth || 220;
    const popupH = root.offsetHeight || 80;
    const xClamped = Math.min(Math.max(x + 12, 8), rect.width - popupW - 8);
    const yClamped = Math.min(Math.max(y + 12, 8), rect.height - popupH - 8);
    root.style.left = `${xClamped}px`;
    root.style.top = `${yClamped}px`;
  }

  function show(): void {
    root.dataset.visible = 'true';
    root.setAttribute('aria-hidden', 'false');
  }

  return {
    showPointInfo(x, y, lat, lng, actions) {
      const osm = `${formatCoord(lng)},${formatCoord(lat)}`;
      const gh = `${formatCoord(lat)},${formatCoord(lng)}`;
      root.innerHTML = '';
      const actionRow = document.createElement('div');
      actionRow.className = 'mv-coordinate-popup__actions';
      const queryButton = document.createElement('button');
      queryButton.type = 'button';
      queryButton.className = 'mv-coordinate-popup__button';
      queryButton.textContent = 'Query OSM';
      queryButton.addEventListener('click', actions.onQueryOsm);
      const streetViewButton = document.createElement('button');
      streetViewButton.type = 'button';
      streetViewButton.className = 'mv-coordinate-popup__button';
      streetViewButton.textContent = 'Google Street View';
      streetViewButton.addEventListener('click', actions.onGoogleStreetView);
      actionRow.append(queryButton, streetViewButton);
      root.append(actionRow);
      root.append(
        formatRow('OSM format:', osm, actions.onOpenOsm),
        formatRow('GH format:', gh, actions.onOpenGraphHopper),
      );
      show();
      position(x, y);
    },
    hide() {
      root.dataset.visible = 'false';
      root.setAttribute('aria-hidden', 'true');
    },
    destroy() {
      root.remove();
    },
  };
}

function formatRow(label: string, value: string, onOpen: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'mv-coordinate-popup__row';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'mv-coordinate-popup__link';
  open.textContent = 'Open';
  open.addEventListener('click', onOpen);
  row.append(labelEl, valueEl, open);
  return row;
}

function formatCoord(value: number): string {
  return value.toFixed(COORD_DECIMALS);
}
