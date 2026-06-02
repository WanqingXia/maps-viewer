import * as vscode from 'vscode';
import type { MapsJson, Project } from '@maps-viewer/shared';
import { parseMapsJson, EMPTY_MAPS_JSON, isParseError } from '@maps-viewer/core';
import type { Logger } from '../util/logger.js';

/**
 * Persistent store for the list of saved Map Projects.
 *
 * Backing file: by default `maps.json` under `context.globalStorageUri`
 * (per-extension global location). Users can override via the
 * `mapsViewer.mapsLocation` setting to point at iCloud/Dropbox.
 *
 * Concurrency: in-memory cache is single-writer per VS Code window. Two
 * windows writing concurrently produce a last-writer-wins outcome —
 * documented as a known limitation in the Phase 3 plan.
 */
export class MapsStore {
  private cache: MapsJson = EMPTY_MAPS_JSON;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private constructor(
    private readonly fileUri: vscode.Uri,
    private readonly logger: Logger,
  ) {}

  static async create(ctx: vscode.ExtensionContext, logger: Logger): Promise<MapsStore> {
    const configured = vscode.workspace
      .getConfiguration('mapsViewer')
      .get<string>('mapsLocation', '')
      ?.trim();
    const uri = configured
      ? vscode.Uri.file(configured)
      : vscode.Uri.joinPath(ctx.globalStorageUri, 'maps.json');
    const store = new MapsStore(uri, logger);
    await store.load();
    return store;
  }

  /** Currently configured backing file path. */
  getLocation(): vscode.Uri {
    return this.fileUri;
  }

  async load(): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.fileUri);
      const text = new TextDecoder().decode(bytes);
      this.cache = parseMapsJson(text);
    } catch (err) {
      if (isParseError(err)) {
        this.logger.error('maps.json failed schema validation; treating as empty', err);
        void vscode.window.showErrorMessage(
          `Maps Viewer: ${this.fileUri.fsPath} is malformed. Falling back to an empty project list.`,
        );
      }
      // FileNotFound / first run / parse error — start empty.
      this.cache = EMPTY_MAPS_JSON;
    }
  }

  list(): ReadonlyArray<Project> {
    return this.cache.projects;
  }

  get(id: string): Project | undefined {
    return this.cache.projects.find((p) => p.id === id);
  }

  async upsert(project: Project): Promise<void> {
    const exists = this.cache.projects.some((p) => p.id === project.id);
    const next: MapsJson = {
      version: 1,
      projects: exists
        ? this.cache.projects.map((p) => (p.id === project.id ? project : p))
        : [...this.cache.projects, project],
    };
    await this.write(next);
  }

  async delete(id: string): Promise<void> {
    const next: MapsJson = {
      version: 1,
      projects: this.cache.projects.filter((p) => p.id !== id),
    };
    await this.write(next);
  }

  async refresh(): Promise<void> {
    await this.load();
    this._onDidChange.fire();
  }

  private async write(next: MapsJson): Promise<void> {
    const parent = vscode.Uri.joinPath(this.fileUri, '..');
    try {
      await vscode.workspace.fs.createDirectory(parent);
    } catch {
      /* may already exist */
    }
    const payload = JSON.stringify(next, null, 2);
    await vscode.workspace.fs.writeFile(this.fileUri, new TextEncoder().encode(payload));
    this.cache = next;
    this._onDidChange.fire();
  }
}
