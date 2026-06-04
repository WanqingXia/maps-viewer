# Maps Viewer — Quickstart

This walks through opening a single file, then loading multiple files, then saving the setup as a project.

## 1. First-time setup

1. Install the **Maps Viewer** extension.
2. Open VS Code on any folder containing one or more `.geojson` files (or paste one in).
3. Maps Viewer includes a bundled Mapbox public token, so no token setup is required for normal use.

## 2. Open a single file

1. Right-click any `.geojson` in the Explorer → **View in Maps**.
2. The map opens in a panel beside the editor. Hover a feature to see its properties.

Run **Maps Viewer: Set Mapbox Token…** only if you want to override the bundled token with your own Mapbox public token. User-provided tokens are stored in VS Code's encrypted `SecretStorage`.

## 3. Add more files (multi-file comparison)

Two ways:

- **Right-click** another `.geojson` → quick-pick → **Add to current map**.
- **Cmd+Shift+P** → **Maps Viewer: Add File to Current Map…** → file picker (multi-select OK).

Each new layer gets a distinct color from the 22-color palette.

## 4. Tune layers via the sidebar

The LayersPanel sits on the left of the map panel:

- **Eye icon** — toggle layer visibility
- **Color swatch** — opens the 22-swatch picker
- **Layer name** — click and edit to rename
- **Stroke slider** — drag 0–30 for line thickness
- **Primary key selector** — choose the property used to list feature records
- **Records** — expand searchable/sortable feature rows with view/hide and zoom controls
- **✕** — remove the layer

Use **New Group** to create a group, then drag profiles into or out of that group. Grouped profiles inherit the group color and visibility; if a group is deleted, its profiles return to standard layers.

Use **Point Render** when zooming out. When enabled, lines and shapes that become too small to read at the current zoom collapse into fixed-size dots so their positions remain visible.

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

- Use the **Country View** selector in the side panel, or run **Maps Viewer: Set Country Scope…** → pick from curated countries or "World" to clear.

## 7. Sync projects across machines (optional)

By default `maps.json` lives in VS Code's per-machine global storage. To sync via iCloud / Dropbox:

1. Pick a path inside your synced folder (e.g. `~/Dropbox/maps-viewer/maps.json`).
2. Settings → search **"Maps Viewer: Maps Location"** → set it to that absolute path.
3. Both machines now read/write the same file. (Last-writer-wins if two open at once.)

## Troubleshooting

| Symptom | Fix |
|---|---|
| Map is blank, devtools shows a Worker error | Reload window (Cmd+Shift+P → "Developer: Reload Window") |
| "Mapbox token required" appears | The bundled token was unavailable in this build. Run `Set Mapbox Token…` and paste a Mapbox public token. |
| Right-click menu has no "View in Maps" | File doesn't have `.geojson` extension — VS Code menus filter on extension |
| F5 doesn't launch in dev mode (macOS) | F5 is Dictation. Use Cmd+Shift+P → "Debug: Start Debugging" |
