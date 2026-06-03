# Maps Viewer — Quickstart

This walks through opening a single file, then loading multiple files, then saving the setup as a project.

## 1. First-time setup

1. Install the **Maps Viewer** extension.
2. Open VS Code on any folder containing one or more `.geojson` files (or paste one in).
3. Get a free Mapbox **public** token from https://account.mapbox.com/access-tokens/ (the token starts with `pk.`).

## 2. Open a single file

1. Right-click any `.geojson` in the Explorer → **View in Maps**.
2. First time only: a prompt asks for your Mapbox token. Paste it and press Enter.
3. The map opens in a panel beside the editor. Hover a feature to see its properties.

The token is stored in VS Code's encrypted `SecretStorage`. You won't be prompted again on this machine. Run **Maps Viewer: Set Mapbox Token…** to rotate or clear it.

## 3. Add more files (multi-file comparison)

Two ways:

- **Right-click** another `.geojson` → quick-pick → **Add to current map**.
- **Cmd+Shift+P** → **Maps Viewer: Add File to Current Map…** → file picker (multi-select OK).

Each new layer gets a distinct color from the 22-color palette.

## 4. Tune layers via the sidebar

The LayersPanel sits on the left of the map panel:

- **● dot** — toggle visibility
- **Color swatch** — opens the 22-swatch picker
- **Layer name** — click and edit to rename
- **Stroke slider** — drag 0–30 for line thickness
- **✕** — remove the layer

## 5. Save as a project

1. Click the **Maps Manager** icon in the activity bar (left edge of VS Code).
2. With your map configured, click the **+** in the view title or run **Maps Viewer: Save as Project…**.
3. Name it (e.g. "NZ regions audit"). Project appears under Recent + All Projects.

Closing the map panel is fine — the project remains. Click it in the sidebar later to restore the exact view (layers + colors + stroke + camera).

## 6. Discover features

Once you've set a primary key per layer, you can find any record in seconds:

1. **Maps Viewer: Set Primary Key…** → pick a layer → pick a property column (e.g. `REGION_CODE`).
2. **Maps Viewer: Locate Feature…** → type a value → the map flies to that feature with a brief yellow pulse.

You can also limit the map to one country:

- **Maps Viewer: Set Country Scope…** → pick from 47 countries or "World" to clear.

## 7. Sync projects across machines (optional)

By default `maps.json` lives in VS Code's per-machine global storage. To sync via iCloud / Dropbox:

1. Pick a path inside your synced folder (e.g. `~/Dropbox/maps-viewer/maps.json`).
2. Settings → search **"Maps Viewer: Maps Location"** → set it to that absolute path.
3. Both machines now read/write the same file. (Last-writer-wins if two open at once.)

## Troubleshooting

| Symptom | Fix |
|---|---|
| Map is blank, devtools shows a Worker error | Reload window (Cmd+Shift+P → "Developer: Reload Window") |
| "Mapbox token required" repeats every time | Token failed `SecretStorage` write. Try `Set Mapbox Token…` again. |
| Right-click menu has no "View in Maps" | File doesn't have `.geojson` extension — VS Code menus filter on extension |
| F5 doesn't launch in dev mode (macOS) | F5 is Dictation. Use Cmd+Shift+P → "Debug: Start Debugging" |
