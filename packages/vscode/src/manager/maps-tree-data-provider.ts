import * as vscode from 'vscode';
import type { Project } from '@maps-viewer/shared';
import type { MapsStore } from './maps-store.js';

type TreeNode =
  | { readonly kind: 'recent-section' }
  | { readonly kind: 'all-section' }
  | { readonly kind: 'project'; readonly project: Project; readonly section: 'recent' | 'all' };

const MAX_RECENT = 5;

export class MapsTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: MapsStore) {
    store.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'recent-section') {
      const item = new vscode.TreeItem('Recent', vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'section';
      item.iconPath = new vscode.ThemeIcon('history');
      return item;
    }
    if (node.kind === 'all-section') {
      const item = new vscode.TreeItem('All Projects', vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'section';
      item.iconPath = new vscode.ThemeIcon('list-unordered');
      return item;
    }
    const item = new vscode.TreeItem(node.project.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'project';
    item.id = `${node.section}:${node.project.id}`;
    item.description = `${node.project.files.length} file${node.project.files.length === 1 ? '' : 's'}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${node.project.name}**`,
        '',
        `Files: ${node.project.files.length}`,
        `Basemap: ${node.project.basemap}`,
        `Country: ${node.project.country ?? 'World'}`,
        `Updated: ${node.project.updatedAt}`,
      ].join('  \n'),
    );
    item.iconPath = new vscode.ThemeIcon('map');
    item.command = {
      command: 'mapsViewer.openProject',
      title: 'Open Project',
      arguments: [node.project.id],
    };
    return item;
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!node) {
      return [{ kind: 'recent-section' }, { kind: 'all-section' }];
    }
    const projects = this.store.list();
    if (node.kind === 'recent-section') {
      return [...projects]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_RECENT)
        .map((p) => ({ kind: 'project' as const, project: p, section: 'recent' as const }));
    }
    if (node.kind === 'all-section') {
      return [...projects]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ kind: 'project' as const, project: p, section: 'all' as const }));
    }
    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

/** Discriminated tree node for `view/item/context` `when` clauses elsewhere. */
export type { TreeNode };
