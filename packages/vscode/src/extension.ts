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

  // The webview package's bundle + Mapbox CSP vendor files live as siblings
  // of the extension package, so we resolve them relative to extension URI.
  const webviewDistUri = vscode.Uri.joinPath(context.extensionUri, '..', 'webview', 'dist');
  const webviewVendorUri = vscode.Uri.joinPath(context.extensionUri, '..', 'webview', 'vendor');

  const ctx: ViewInMapsCtx = {
    extUri: context.extensionUri,
    webviewDistUri,
    webviewVendorUri,
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
