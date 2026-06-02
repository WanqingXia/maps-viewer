import * as vscode from 'vscode';
import type { Project, ProjectFileRef } from '@maps-viewer/shared';
import type { WorkspaceFolderInfo } from '@maps-viewer/core';
import { resolveProjectFileRef } from '@maps-viewer/core';
import { readGeoJsonFile } from '../../util/parse-geojson.js';
import { MapPanel } from '../../map-panel.js';
import { ensureToken } from '../../token/prompt-for-token.js';
import { repathMissingFiles, type MissingFile } from '../repath-missing.js';
import type { MapsStore } from '../maps-store.js';
import type { TokenManager } from '../../token/token-manager.js';
import type { Logger } from '../../util/logger.js';
import type { FeatureCollection } from 'geojson';

export interface OpenProjectCtx {
  store: MapsStore;
  tokenManager: TokenManager;
  logger: Logger;
  extUri: vscode.Uri;
  webviewAssetsUri: vscode.Uri;
}

export async function openProject(ctx: OpenProjectCtx, projectId: string): Promise<void> {
  const project = ctx.store.get(projectId);
  if (!project) {
    void vscode.window.showErrorMessage('Maps Viewer: project not found.');
    return;
  }

  try {
    const token = await ensureToken(ctx.tokenManager);

    // 1. Try to resolve every file ref. Missing ones get queued for repath.
    const workspaces = collectWorkspaces();
    const resolved: Array<{ ref: ProjectFileRef; uri: vscode.Uri; missing: boolean }> = [];
    for (const ref of project.files) {
      const r = resolveProjectFileRef(ref, workspaces);
      const uri = vscode.Uri.file(r.absolute);
      let missing = false;
      try { await vscode.workspace.fs.stat(uri); }
      catch { missing = true; }
      resolved.push({ ref, uri, missing });
    }

    // 2. Repath any missing files.
    let projectToOpen = project;
    const missing: MissingFile[] = resolved
      .filter((r) => r.missing)
      .map((r) => ({ ref: r.ref, attemptedAbsolute: r.uri.fsPath }));

    if (missing.length > 0) {
      const result = await repathMissingFiles(project.files, missing);
      if (result.anyChanged) {
        projectToOpen = {
          ...project,
          files: [...result.updated],
          updatedAt: new Date().toISOString(),
        };
        await ctx.store.upsert(projectToOpen);
        // Reset resolved with the new refs
        resolved.length = 0;
        for (const ref of projectToOpen.files) {
          const r = resolveProjectFileRef(ref, workspaces);
          const uri = vscode.Uri.file(r.absolute);
          let stillMissing = false;
          try { await vscode.workspace.fs.stat(uri); }
          catch { stillMissing = true; }
          resolved.push({ ref, uri, missing: stillMissing });
        }
      }
    }

    // 3. Read every still-present file in parallel.
    const layerData = new Map<string, FeatureCollection>();
    await Promise.all(
      resolved.map(async (r) => {
        if (r.missing) return;
        try {
          const fc = await readGeoJsonFile(r.uri);
          layerData.set(r.ref.layerId, fc);
        } catch (err) {
          ctx.logger.error(`openProject: failed to read ${r.uri.fsPath}`, err);
        }
      }),
    );

    // 4. Open the panel from project (separate key namespace so two projects don't collide).
    await MapPanel.openFromProject({
      key: `project:${projectToOpen.id}`,
      title: `Maps Viewer: ${projectToOpen.name}`,
      extUri: ctx.extUri,
      webviewAssetsUri: ctx.webviewAssetsUri,
      logger: ctx.logger,
      mapboxToken: token,
      project: projectToOpen,
      layerData,
    });
    ctx.logger.info(`opened project "${projectToOpen.name}" (${projectToOpen.id})`);
  } catch (err) {
    ctx.logger.error('openProject failed', err);
    void vscode.window.showErrorMessage(
      `Maps Viewer: ${err instanceof Error ? err.message : String(err)}`,
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
