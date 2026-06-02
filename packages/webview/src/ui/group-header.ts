import type { Group, UserAction } from '@maps-viewer/shared';
import { mountColorPicker } from './color-picker.js';

export interface GroupHeader {
  element: HTMLElement;
  update(group: Group): void;
  destroy(): void;
}

/** Collapsible header for a group of layers. */
export function mountGroupHeader(
  group: Group,
  onAction: (a: UserAction) => void,
): GroupHeader {
  let current: Group = group;

  const root = document.createElement('div');
  root.className = 'mv-group-header';
  root.setAttribute('role', 'group');
  root.dataset.groupId = group.id;

  const visBtn = document.createElement('button');
  visBtn.type = 'button';
  visBtn.className = 'mv-group-header__vis';
  visBtn.title = 'Toggle group visibility';
  visBtn.setAttribute('aria-label', `Toggle visibility of group ${group.name}`);

  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'mv-group-header__color';
  swatch.title = 'Change group color';
  swatch.setAttribute('aria-label', `Change color of group ${group.name}`);
  swatch.setAttribute('aria-haspopup', 'listbox');

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'mv-group-header__name';
  name.spellcheck = false;
  name.title = 'Rename group';
  name.setAttribute('aria-label', 'Group name');

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mv-group-header__delete';
  delBtn.title = 'Delete group (members become ungrouped)';
  delBtn.textContent = '✕';
  delBtn.setAttribute('aria-label', `Delete group ${group.name}`);

  root.appendChild(visBtn);
  root.appendChild(swatch);
  root.appendChild(name);
  root.appendChild(delBtn);

  const picker = mountColorPicker((color) =>
    onAction({ type: 'setGroupColor', groupId: current.id, color }),
  );

  visBtn.addEventListener('click', () => {
    onAction({ type: 'setGroupVisible', groupId: current.id, visible: !current.visible });
  });
  swatch.addEventListener('click', (e) => { e.stopPropagation(); picker.open(swatch); });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    else if (e.key === 'Escape') { name.value = current.name; (e.target as HTMLInputElement).blur(); }
  });
  name.addEventListener('blur', () => {
    if (name.value.trim() === current.name) return;
    onAction({ type: 'renameGroup', groupId: current.id, name: name.value });
  });
  delBtn.addEventListener('click', () => {
    onAction({ type: 'deleteGroup', groupId: current.id });
  });

  function update(next: Group): void {
    current = next;
    visBtn.setAttribute('aria-pressed', String(next.visible));
    visBtn.setAttribute('aria-label', `Toggle visibility of group ${next.name}`);
    visBtn.innerHTML = eyeIcon(next.visible);
    swatch.style.background = next.color;
    swatch.setAttribute('aria-label', `Change color of group ${next.name}`);
    delBtn.setAttribute('aria-label', `Delete group ${next.name}`);
    if (document.activeElement !== name) name.value = next.name;
  }
  update(group);

  return {
    element: root,
    update,
    destroy() { picker.destroy(); root.remove(); },
  };
}

function eyeIcon(visible: boolean): string {
  if (visible) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2"/><path d="M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8"/></svg>';
}
