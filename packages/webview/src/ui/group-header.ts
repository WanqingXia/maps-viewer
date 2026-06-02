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
  root.dataset.groupId = group.id;

  const visBtn = document.createElement('button');
  visBtn.type = 'button';
  visBtn.className = 'mv-group-header__vis';
  visBtn.title = 'Toggle group visibility';

  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'mv-group-header__color';
  swatch.title = 'Change group color';

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'mv-group-header__name';
  name.spellcheck = false;
  name.title = 'Rename group';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mv-group-header__delete';
  delBtn.title = 'Delete group (members become ungrouped)';
  delBtn.textContent = '✕';

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
    visBtn.textContent = next.visible ? '●' : '○';
    swatch.style.background = next.color;
    if (document.activeElement !== name) name.value = next.name;
  }
  update(group);

  return {
    element: root,
    update,
    destroy() { picker.destroy(); root.remove(); },
  };
}
