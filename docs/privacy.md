# Maps Viewer — Privacy

**Maps Viewer does not collect telemetry, analytics, or any user data.**

## What's stored locally

- **Optional custom Mapbox token** — if you override the bundled token, your token is saved via VS Code's `SecretStorage` API (encrypted by the host OS keychain). It is never written to disk in plaintext.
- **Your saved Map Projects** (`maps.json`) — written to VS Code's per-extension global storage path, or to a custom path you set via `mapsViewer.mapsLocation`. Plain JSON; you can edit it directly if you want.

## What's sent over the network

When a map is open, the webview makes HTTPS requests to:

- `https://*.mapbox.com` — for map tiles, styles, and fonts (authenticated with the bundled token, or your custom token if configured)
- `https://api.mapbox.com` — same purpose, different subdomain
- `https://events.mapbox.com` — Mapbox's own usage telemetry. **This goes to Mapbox, not to us.** It's a side effect of using their SDK.

## What's never sent

- Your GeoJSON content (read locally, rendered locally — never uploaded)
- Your file paths
- Any extension usage metrics

## Mapbox terms

Maps Viewer includes a Mapbox public token for the default basemap. The map tiles and styles are subject to [Mapbox's TOS](https://www.mapbox.com/legal/tos). If you configure your own token, usage may count against your Mapbox account.

## No analytics SDKs

This extension does not link any third-party analytics, error reporting, or usage tracking SDKs. We don't have a server. There's no backend.

## Source

The extension's source is open and auditable. See the `packages/` directory; the only HTTP traffic the host-side code makes is via `vscode.env.openExternal` when setting a custom token and the Mapbox SDK requests above.
