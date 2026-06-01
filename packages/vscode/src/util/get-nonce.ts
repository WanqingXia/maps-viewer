/**
 * 32-char alphanumeric nonce used for the webview CSP `script-src 'nonce-X'`.
 * `Math.random()` is fine here — the CSP itself enforces script integrity; we
 * only need per-render uniqueness, not cryptographic strength.
 */
export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
