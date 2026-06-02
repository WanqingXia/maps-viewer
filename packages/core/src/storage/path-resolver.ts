import type { ProjectFileRef } from '@maps-viewer/shared';

/**
 * Workspace folder info — the host (vscode) supplies it. We keep this
 * adapter in `core` so it stays vscode-free and unit-testable.
 */
export interface WorkspaceFolderInfo {
  /** Basename of the workspace folder (e.g. "maps-viewer"). */
  readonly name: string;
  /** Absolute filesystem path. */
  readonly path: string;
}

export interface ResolvedPath {
  /** Resolved absolute path. */
  readonly absolute: string;
  /**
   * How the resolution happened:
   *   - 'as-stored'           absolute path used verbatim
   *   - 'workspace-matched'   workspaceRelative found via matching basename
   *   - 'workspace-fallback'  workspaceRelative; matching folder missing,
   *                           used first available workspace folder
   */
  readonly method: 'as-stored' | 'workspace-matched' | 'workspace-fallback';
}

/** Build a Project file ref, choosing workspaceRelative when possible. */
export function toProjectFileRef(
  layerId: string,
  absolutePath: string,
  workspaces: ReadonlyArray<WorkspaceFolderInfo>,
): ProjectFileRef {
  const ws = workspaces.find((w) => absolutePath.startsWith(`${w.path}/`));
  if (ws) {
    return {
      layerId,
      path: absolutePath.slice(ws.path.length + 1),
      pathKind: 'workspaceRelative',
      workspaceFolder: ws.name,
    };
  }
  return { layerId, path: absolutePath, pathKind: 'absolute' };
}

/**
 * Inverse of `toProjectFileRef`. Returns the resolved absolute path and
 * the method used. Does NOT touch the filesystem — caller stat()s.
 */
export function resolveProjectFileRef(
  ref: ProjectFileRef,
  workspaces: ReadonlyArray<WorkspaceFolderInfo>,
): ResolvedPath {
  if (ref.pathKind === 'absolute') {
    return { absolute: ref.path, method: 'as-stored' };
  }
  const matched = ref.workspaceFolder
    ? workspaces.find((w) => w.name === ref.workspaceFolder)
    : undefined;
  if (matched) {
    return { absolute: `${matched.path}/${ref.path}`, method: 'workspace-matched' };
  }
  const fallback = workspaces[0];
  if (fallback) {
    return { absolute: `${fallback.path}/${ref.path}`, method: 'workspace-fallback' };
  }
  // No workspace open at all — best we can do is return the relative
  // string; the caller's stat will fail and they'll trigger repath.
  return { absolute: ref.path, method: 'as-stored' };
}
