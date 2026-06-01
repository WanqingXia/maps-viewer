import * as vscode from 'vscode';

/**
 * Single-channel output logger used everywhere in the extension host.
 *
 * - Create exactly one instance per extension activation.
 * - Never use `console.log` in production code; always go through `Logger`.
 * - Levels are prefixes only; we do not gate by level in Phase 0.
 */
export class Logger {
  private constructor(private readonly channel: vscode.OutputChannel) {}

  static create(name = 'Maps Viewer'): Logger {
    return new Logger(vscode.window.createOutputChannel(name));
  }

  info(message: string, ...args: unknown[]): void {
    this.channel.appendLine(`[info]  ${this.format(message, args)}`);
  }

  warn(message: string, ...args: unknown[]): void {
    this.channel.appendLine(`[warn]  ${this.format(message, args)}`);
  }

  error(message: string, err?: unknown): void {
    const suffix = err === undefined ? '' : ` :: ${this.stringifyError(err)}`;
    this.channel.appendLine(`[error] ${message}${suffix}`);
  }

  show(): void {
    this.channel.show();
  }

  dispose(): void {
    this.channel.dispose();
  }

  private format(message: string, args: readonly unknown[]): string {
    if (args.length === 0) return message;
    const tail = args.map((a) => this.safeJson(a)).join(' ');
    return `${message} ${tail}`;
  }

  private safeJson(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private stringifyError(err: unknown): string {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
}
