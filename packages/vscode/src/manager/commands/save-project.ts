import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { Project } from '@maps-viewer/shared';
import type { WorkspaceFolderInfo } from '@maps-viewer/core';
import { MapPanel } from '../../map-panel.js';
import type { MapsStore } from '../maps-store.js';
import type { Logger } from '../../util/logger.js';

export interface SaveProjectCtx {
  store: MapsStore;
  logger: Logger;
}

export async function saveProject(ctx: SaveProjectCtx): Promise<void> {
  const panel = MapPanel.activeForWindow();
  if (!panel) {
    void vscode.window.showWarningMessage(
      'Open a map first (right-click a .geojson → "View in Maps") and then save it as a project.',
    );
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: 'Project name',
    placeHolder: 'NZ regions audit',
    validateInput: (v) => (v.trim().length === 0 ? 'Name cannot be empty' : undefined),
  });
  if (!name) return;

  const workspaces = collectWorkspaces();
  const snapshot = await panel.getProjectSnapshot(workspaces);
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    ...snapshot,
  };
  try {
    await ctx.store.upsert(project);
    ctx.logger.info(`saved project "${project.name}" (${project.id})`);
    void vscode.window.showInformationMessage(`Maps Viewer: saved "${project.name}".`);
  } catch (err) {
    ctx.logger.error('saveProject failed', err);
    void vscode.window.showErrorMessage(
      `Maps Viewer: failed to save project: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function collectWorkspaces(): ReadonlyArray<WorkspaceFolderInfo> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return [];
  return folders.map((f) => {
    const path = f.uri.fsPath;
    const idx = path.lastIndexOf('/');
    const name = idx >= 0 ? path.slice(idx + 1) : path;
    return { name, path };
  });
}
