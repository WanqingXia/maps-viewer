import type { Basemap } from '@maps-viewer/shared';

/**
 * Mounts a small "Standard / Satellite" segmented control in the top-right
 * of the map container. Calls `onChange` immediately when the user picks the
 * other option.
 *
 * Returns the root element for cleanup (callers do not currently dispose).
 */
export function mountBasemapToggle(
  container: HTMLElement,
  initial: Basemap,
  onChange: (next: Basemap) => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mv-basemap-toggle';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Basemap');

  let current: Basemap = initial;

  const make = (value: Basemap, label: string) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.basemap = value;
    btn.setAttribute('aria-pressed', String(value === current));
    btn.addEventListener('click', () => {
      if (current === value) return;
      current = value;
      for (const child of Array.from(root.children) as HTMLButtonElement[]) {
        child.setAttribute('aria-pressed', String(child.dataset.basemap === value));
      }
      onChange(value);
    });
    return btn;
  };

  root.append(make('standard', 'Standard'));
  root.append(make('satellite', 'Satellite'));
  container.append(root);
  return root;
}
