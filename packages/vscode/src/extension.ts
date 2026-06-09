import * as vscode from 'vscode';
import { Logger } from './util/logger.js';
import { TokenManager } from './token/token-manager.js';
import { viewInMaps, type ViewInMapsCtx } from './commands/view-in-maps.js';
import { setMapboxToken } from './commands/set-mapbox-token.js';
import { addFileToMap } from './commands/add-file-to-map.js';
import { locateFeature } from './commands/locate-feature.js';
import { setCountryScope } from './commands/set-country-scope.js';
import { setPrimaryKey } from './commands/set-primary-key.js';
import { MapsStore } from './manager/maps-store.js';
import { MapsTreeDataProvider } from './manager/maps-tree-data-provider.js';
import { saveProject } from './manager/commands/save-project.js';
import { openProject } from './manager/commands/open-project.js';
import { renameProject } from './manager/commands/rename-project.js';
import { deleteProject } from './manager/commands/delete-project.js';
import { newProject } from './manager/commands/new-project.js';
import { maybeShowWelcome } from './welcome.js';
import { registerEditorFeatureSync } from './editor-feature-sync.js';

let logger: Logger | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = Logger.create();
  const version = String(context.extension.packageJSON.version ?? 'unknown');
  logger.info(`Maps Viewer v${version} activated`);

  const tokenManager = new TokenManager(context.secrets);
  const webviewAssetsUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');

  // Phase 3: persistent project store + sidebar tree view.
  const store = await MapsStore.create(context, logger);
  const treeProvider = new MapsTreeDataProvider(store);

  const ctx: ViewInMapsCtx = {
    extUri: context.extensionUri,
    webviewAssetsUri,
    tokenManager,
    logger,
  };
  const saveCtx = { store, logger };
  const openCtx = { store, tokenManager, logger, extUri: context.extensionUri, webviewAssetsUri };

  context.subscriptions.push(
    // existing Phase 0/1/2 commands
    vscode.commands.registerCommand('mapsViewer.about', () => {
      logger?.info('About command invoked');
      void vscode.window.showInformationMessage(`Maps Viewer v${version}`);
    }),
    vscode.commands.registerCommand('mapsViewer.viewInMaps', (uri?: vscode.Uri) => viewInMaps(ctx, uri)),
    vscode.commands.registerCommand('mapsViewer.setMapboxToken', () => setMapboxToken(tokenManager, logger!)),
    vscode.commands.registerCommand('mapsViewer.addFileToMap', () => addFileToMap(logger!)),

    // Phase 4: discovery commands
    vscode.commands.registerCommand('mapsViewer.locateFeature', () => locateFeature(logger!)),
    vscode.commands.registerCommand('mapsViewer.setCountryScope', () => setCountryScope(logger!)),
    vscode.commands.registerCommand('mapsViewer.setPrimaryKey', () => setPrimaryKey(logger!)),

    // Phase 3: project commands
    vscode.commands.registerCommand('mapsViewer.saveProject', () => saveProject(saveCtx)),
    vscode.commands.registerCommand('mapsViewer.openProject', (id?: string) => {
      if (typeof id !== 'string') {
        void vscode.window.showInformationMessage(
          'Open a project from the Maps Manager sidebar (activity bar icon).',
        );
        return;
      }
      return openProject(openCtx, id);
    }),
    vscode.commands.registerCommand('mapsViewer.renameProject', (node?: unknown) => {
      const id = extractProjectId(node);
      if (!id) return;
      return renameProject(store, logger!, id);
    }),
    vscode.commands.registerCommand('mapsViewer.deleteProject', (node?: unknown) => {
      const id = extractProjectId(node);
      if (!id) return;
      return deleteProject(store, logger!, id);
    }),
    vscode.commands.registerCommand('mapsViewer.newProject', () => newProject(saveCtx)),
    vscode.commands.registerCommand('mapsViewer.refreshMapsTree', () => {
      void store.refresh();
      treeProvider.refresh();
    }),

    // Tree view registration
    vscode.window.registerTreeDataProvider('mapsViewer.tree', treeProvider),

    { dispose: () => logger?.dispose() },
  );

  registerEditorFeatureSync(context, logger);

  // One-shot welcome notification on first activation per major version.
  // Fire-and-forget — never blocks activation.
  void maybeShowWelcome(context).catch((err) => {
    logger?.error('welcome notification failed', err);
  });
}

export function deactivate(): void {
  logger?.info('Maps Viewer deactivated');
}

/**
 * The `view/item/context` menu items pass the underlying TreeNode. We
 * project that to a project id (or undefined if the click came from
 * somewhere unexpected — palette without args).
 */
function extractProjectId(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const obj = node as { kind?: unknown; project?: { id?: unknown } };
  if (obj.kind !== 'project') return undefined;
  const id = obj.project?.id;
  return typeof id === 'string' ? id : undefined;
}
