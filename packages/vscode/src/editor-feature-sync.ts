import * as vscode from 'vscode';
import { MapPanel } from './map-panel.js';
import type { Logger } from './util/logger.js';

const DEBOUNCE_MS = 150;
const GEOJSON_EXTENSION = '.geojson';

/**
 * MVP editor-to-map sync:
 * when the cursor is inside `FeatureCollection.features[index]`, zoom the
 * corresponding open map layer to that feature.
 */
export function registerEditorFeatureSync(context: vscode.ExtensionContext, logger: Logger): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastLocated = '';

  const schedule = (editor: vscode.TextEditor | undefined): void => {
    if (!editor || !isGeoJsonDocument(editor.document)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      try {
        const featureIndex = featureIndexAtOffset(
          editor.document.getText(),
          editor.document.offsetAt(editor.selection.active),
        );
        if (featureIndex === null) return;
        const key = `${editor.document.uri.toString()}#${featureIndex}`;
        if (key === lastLocated) return;
        if (MapPanel.locateFeatureInOpenPanel(editor.document.uri, featureIndex)) {
          lastLocated = key;
        }
      } catch (err) {
        logger.error('editor feature sync failed', err);
      }
    }, DEBOUNCE_MS);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => schedule(event.textEditor)),
    vscode.window.onDidChangeActiveTextEditor((editor) => schedule(editor)),
    {
      dispose: () => {
        if (timer) clearTimeout(timer);
      },
    },
  );
}

function isGeoJsonDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && document.uri.path.toLowerCase().endsWith(GEOJSON_EXTENSION);
}

export function featureIndexAtOffset(text: string, offset: number): number | null {
  if (offset < 0 || offset > text.length) return null;
  let index = 0;
  while (index < text.length) {
    const key = findStringToken(text, 'features', index);
    if (key === null) return null;
    const colon = nextNonWhitespace(text, key.end);
    if (colon === null || text[colon] !== ':') {
      index = key.end;
      continue;
    }
    const arrayStart = nextNonWhitespace(text, colon + 1);
    if (arrayStart === null || text[arrayStart] !== '[') {
      index = key.end;
      continue;
    }
    const found = featureArrayIndexAtOffset(text, arrayStart, offset);
    if (found !== undefined) return found;
    index = arrayStart + 1;
  }
  return null;
}

function featureArrayIndexAtOffset(text: string, arrayStart: number, offset: number): number | null | undefined {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let featureStart = -1;
  let featureIndex = 0;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const char = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === ']' && depth === 0) {
      return offset > arrayStart && offset < i ? null : undefined;
    }

    if (char === '{' || char === '[') {
      if (depth === 0 && char === '{') featureStart = i;
      depth++;
      continue;
    }

    if (char === '}' || char === ']') {
      if (depth > 0) depth--;
      if (depth === 0 && featureStart >= 0) {
        const featureEnd = i + 1;
        if (offset >= featureStart && offset <= featureEnd) return featureIndex;
        featureIndex++;
        featureStart = -1;
      }
    }
  }
  return undefined;
}

function findStringToken(text: string, target: string, from: number): { start: number; end: number } | null {
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = from; i < text.length; i++) {
    const char = text[i]!;
    if (!inString) {
      if (char === '"') {
        inString = true;
        start = i;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      if (text.slice(start + 1, i) === target) return { start, end: i + 1 };
      inString = false;
      start = -1;
    }
  }
  return null;
}

function nextNonWhitespace(text: string, from: number): number | null {
  for (let i = from; i < text.length; i++) {
    if (!/\s/.test(text[i]!)) return i;
  }
  return null;
}
