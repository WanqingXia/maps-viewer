import * as vscode from 'vscode';
import type { ProjectFileRef } from '@maps-viewer/shared';

export interface MissingFile {
  readonly ref: ProjectFileRef;
  readonly attemptedAbsolute: string;
}

export interface RepathResult {
  readonly updated: ReadonlyArray<ProjectFileRef>;
  readonly anyChanged: boolean;
}

/**
 * For each missing file the user is asked to locate it (skipping is OK).
 * Returns a new array of refs (those the user located replaced, others
 * left as-is).
 */
export async function repathMissingFiles(
  originalRefs: ReadonlyArray<ProjectFileRef>,
  missing: ReadonlyArray<MissingFile>,
): Promise<RepathResult> {
  if (missing.length === 0) return { updated: originalRefs, anyChanged: false };

  const byLayerId = new Map<string, ProjectFileRef>(
    originalRefs.map((r) => [r.layerId, r] as const),
  );

  let anyChanged = false;

  for (const m of missing) {
    const file = basename(m.attemptedAbsolute);
    const choice = await vscode.window.showWarningMessage(
      `Maps Viewer: file "${file}" could not be located. Find it?`,
      { modal: true },
      'Locate…',
      'Skip',
    );
    if (choice !== 'Locate…') continue;
    const pick = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: `Locate ${file}`,
      filters: { GeoJSON: ['geojson', 'json'] },
    });
    if (!pick || pick.length === 0) continue;
    const newPath = pick[0]!.fsPath;
    byLayerId.set(m.ref.layerId, {
      layerId: m.ref.layerId,
      path: newPath,
      pathKind: 'absolute',
    });
    anyChanged = true;
  }

  return {
    updated: originalRefs.map((r) => byLayerId.get(r.layerId) ?? r),
    anyChanged,
  };
}

function basename(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}
