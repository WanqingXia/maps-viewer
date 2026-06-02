# Maps Viewer — Privacy

**Maps Viewer does not collect telemetry, analytics, or any user data.**

## What's stored locally

- **Your Mapbox token** — saved via VS Code's `SecretStorage` API (encrypted by the host OS keychain). Never written to disk in plaintext, never sent off-machine.
- **Your saved Map Projects** (`maps.json`) — written to VS Code's per-extension global storage path, or to a custom path you set via `mapsViewer.mapsLocation`. Plain JSON; you can edit it directly if you want.

## What's sent over the network

When a map is open, the webview makes HTTPS requests to:

- `https://*.mapbox.com` — for map tiles, styles, and fonts (authenticated with your token)
- `https://api.mapbox.com` — same purpose, different subdomain
- `https://events.mapbox.com` — Mapbox's own usage telemetry. **This goes to Mapbox, not to us.** It's a side effect of using their SDK. The Mapbox token you provided is what authorizes those requests.

## What's never sent

- Your GeoJSON content (read locally, rendered locally — never uploaded)
- Your file paths
- Any extension usage metrics

## Mapbox terms

You're using Maps Viewer with **your own** Mapbox token. The map tiles + styles are subject to [Mapbox's TOS](https://www.mapbox.com/legal/tos) and their pricing tier. The free tier (50,000 map loads/month) is generally enough for casual development; check your Mapbox dashboard if you have heavy use.

## No analytics SDKs

This extension does not link any third-party analytics, error reporting, or usage tracking SDKs. We don't have a server. There's no backend.

## Source

The extension's source is open and auditable. See the `packages/` directory; the only HTTP traffic the host-side code makes is via `vscode.env.openExternal` (when you click "Get free token") and the Mapbox SDK requests above.
