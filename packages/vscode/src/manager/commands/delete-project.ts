import * as vscode from 'vscode';
import type { MapsStore } from '../maps-store.js';
import type { Logger } from '../../util/logger.js';

export async function deleteProject(
  store: MapsStore,
  logger: Logger,
  projectId: string,
): Promise<void> {
  const project = store.get(projectId);
  if (!project) {
    void vscode.window.showErrorMessage('Maps Viewer: project not found.');
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    `Delete the saved map project "${project.name}"? This does not delete any GeoJSON files.`,
    { modal: true },
    'Delete',
  );
  if (choice !== 'Delete') return;
  await store.delete(projectId);
  logger.info(`deleted project "${project.name}" (${projectId})`);
}
