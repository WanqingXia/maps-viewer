import * as vscode from 'vscode';

/**
 * One-shot welcome notification on first activation per major version.
 *
 * The key is versioned (`.v1`) so a future major release can re-introduce
 * a quick-start prompt for material new features without spamming
 * existing users every reload.
 *
 * No effect if the user has already dismissed it on this machine.
 */
const WELCOME_KEY = 'mapsViewer.welcomeShown.v1';

export async function maybeShowWelcome(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(WELCOME_KEY)) return;

  const version = String(context.extension.packageJSON.version ?? '0.0.0');
  const choice = await vscode.window.showInformationMessage(
    `Maps Viewer v${version} is installed. Right-click any .geojson file to open it on a map.`,
    'Quick start',
    'Got it',
  );

  if (choice === 'Quick start') {
    const homepage = pickHomepageUrl(context);
    await vscode.env.openExternal(vscode.Uri.parse(homepage));
  }

  await context.globalState.update(WELCOME_KEY, true);
}

/**
 * Best-effort link to the quickstart docs. Falls back to the extension's
 * homepage from package.json, then to the public repository.
 */
function pickHomepageUrl(context: vscode.ExtensionContext): string {
  const pkg = context.extension.packageJSON as {
    homepage?: string;
    repository?: { url?: string };
  };
  if (pkg.homepage) return pkg.homepage;
  if (pkg.repository?.url) return pkg.repository.url;
  return 'https://github.com/WanqingXia/maps-viewer#readme';
}
