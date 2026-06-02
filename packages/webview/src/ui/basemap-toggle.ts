import type { Basemap } from '@maps-viewer/shared';

export interface BasemapToggle {
  /** Programmatically update the pressed state (no callback fired). */
  set(b: Basemap): void;
  /** Remove the toggle from the DOM. */
  destroy(): void;
}

/**
 * Mounts a small "Standard / Satellite" segmented control in the top-right
 * of the map container. Returns an object you can use to update the pressed
 * state externally (e.g. when the host posts a setBasemap message) and to
 * dispose the DOM on teardown.
 */
export function mountBasemapToggle(
  container: HTMLElement,
  initial: Basemap,
  onChange: (next: Basemap) => void,
): BasemapToggle {
  const root = document.createElement('div');
  root.className = 'mv-basemap-toggle';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Basemap');

  let current: Basemap = initial;

  function reflect(): void {
    for (const child of Array.from(root.children) as HTMLButtonElement[]) {
      child.setAttribute('aria-pressed', String(child.dataset.basemap === current));
    }
  }

  const make = (value: Basemap, label: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.basemap = value;
    btn.setAttribute('aria-pressed', String(value === current));
    btn.addEventListener('click', () => {
      if (current === value) return;
      current = value;
      reflect();
      onChange(value);
    });
    return btn;
  };

  root.append(make('standard', 'Standard'));
  root.append(make('satellite', 'Satellite'));
  container.append(root);

  return {
    set(b) {
      if (current === b) return;
      current = b;
      reflect();
    },
    destroy() {
      root.remove();
    },
  };
}
