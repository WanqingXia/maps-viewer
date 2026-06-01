import * as vscode from 'vscode';
import { Logger } from './util/logger.js';
import { TokenManager } from './token/token-manager.js';
import { viewInMaps, type ViewInMapsCtx } from './commands/view-in-maps.js';
import { setMapboxToken } from './commands/set-mapbox-token.js';

let logger: Logger | undefined;

export function activate(context: vscode.ExtensionContext): void {
  logger = Logger.create();
  const version = String(context.extension.packageJSON.version ?? 'unknown');
  logger.info(`Maps Viewer v${version} activated`);

  const tokenManager = new TokenManager(context.secrets);

  // Webview app bundle + Mapbox CSP-strict vendor files are bundled into
  // this extension's own `dist/webview/` directory by the esbuild build
  // step (see `esbuild.config.mjs` → `copyWebviewAssets`). This works
  // identically in dev (F5) and in an installed VSIX.
  const webviewAssetsUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');

  const ctx: ViewInMapsCtx = {
    extUri: context.extensionUri,
    webviewAssetsUri,
    tokenManager,
    logger,
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('mapsViewer.about', () => {
      logger?.info('About command invoked');
      void vscode.window.showInformationMessage(`Maps Viewer v${version}`);
    }),
    vscode.commands.registerCommand('mapsViewer.viewInMaps', (uri?: vscode.Uri) => viewInMaps(ctx, uri)),
    vscode.commands.registerCommand('mapsViewer.setMapboxToken', () => setMapboxToken(tokenManager, logger!)),
    { dispose: () => logger?.dispose() },
  );
}

export function deactivate(): void {
  logger?.info('Maps Viewer deactivated');
}
