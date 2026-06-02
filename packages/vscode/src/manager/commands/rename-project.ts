import * as vscode from 'vscode';
import type { MapsStore } from '../maps-store.js';
import type { Logger } from '../../util/logger.js';

export async function renameProject(
  store: MapsStore,
  logger: Logger,
  projectId: string,
): Promise<void> {
  const project = store.get(projectId);
  if (!project) {
    void vscode.window.showErrorMessage('Maps Viewer: project not found.');
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: 'New project name',
    value: project.name,
    validateInput: (v) => (v.trim().length === 0 ? 'Name cannot be empty' : undefined),
  });
  if (!name || name.trim() === project.name) return;

  await store.upsert({
    ...project,
    name: name.trim(),
    updatedAt: new Date().toISOString(),
  });
  logger.info(`renamed project ${project.id} to "${name.trim()}"`);
}
