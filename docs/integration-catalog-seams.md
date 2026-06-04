# Integration Catalog Seams

This maps the current bundled Integration catalog implementation and the seams that need to become Extension-aware before manifest-only Integration Tile Contributions can ship.

## Current bundled catalog

The only Integration catalog is `src/shared/integrationCatalog.json`. It is hand-authored and bundled into both sides of the app:

- TypeScript imports it as a Vite JSON module from `src/tilePickerCatalog.tsx`.
- Rust embeds the same file at compile time with `include_str!("../../src/shared/integrationCatalog.json")` in `src-tauri/src/lib.rs`.

The catalog currently contains first-party CLI Tool Tiles for Claude, Codex, Gemini, OpenCode, and Pi. Each Integration has an `id`, `title`, and `tiles[]`; each tile has an `id`, `title`, `kind: "tool"`, `defaultVisible`, `iconKey`, `toolCommand`, and `resumeProvider`.

## TypeScript consumption today

`src/tilePickerCatalog.tsx` is the frontend adapter for the shared catalog:

- Defines frontend-only catalog interfaces that read only the fields needed by the picker: Integration id/title and tile id/title/kind/defaultVisible/iconKey.
- Maps built-in `iconKey` values to React icon nodes.
- Flattens `integrationCatalog.integrations[].tiles[]` into `integrationTilePickerItems`.
- Builds each Tool Tile picker item id as `${integrationId}.${integrationTileId}`.
- Exposes `configurableTilePickerItems`, `createDefaultTilePickerVisibility`, `getTilePickerItems`, `findTilePickerItem`, and `findTilePickerItemForTile`.

Other frontend seams assume that static adapter shape:

- `src/settings.ts` normalizes persisted Tile picker visibility by iterating static `configurableTilePickerItems`; unknown stored item ids are dropped.
- `src/App.tsx` calls `integration_tool_availability_list`, indexes responses by `${integrationId}.${integrationTileId}`, disables unavailable Tool Tile picker items, and turns selected catalog items into `Tile` objects.
- `src/App.tsx` passes Tool Tile launches to `TerminalTile` as `{ kind: "tool", integrationId, integrationTileId, resume }`.
- `src/SettingsView.tsx` renders Tile picker configuration from static `configurableTilePickerItems` and indexes availability by the same picker item id.
- `src/tileLayout.ts` creates and clones Tool Tiles with only `integrationId + integrationTileId`.
- `src/types.ts` defines persisted Tool Tiles, terminal launches, and availability responses without Extension identity.

## Rust consumption today

`src-tauri/src/lib.rs` is the runtime adapter for the same JSON:

- `integration_catalog()` deserializes the embedded JSON into `IntegrationCatalog` every time it is called.
- `tool_integration_tiles()` flattens catalog Tool Tiles into `ToolIntegrationTile` values.
- `tool_integration_tile(integration_id, integration_tile_id)` resolves a Tool Tile by the two-part identity and returns the first match.
- `integration_tool_availability_list()` returns availability for every bundled Tool Tile.
- `tool_availability_for_tile()` checks `command -v <tool_command>` through the user's shell.
- `terminal_create()` resolves a requested Tool Tile, checks availability, builds a launch plan, and starts the Terminal Session Runtime.
- `sanitize_tile_state()` validates persisted Workspace Tile State. Unknown `kind: "tool"` tiles are currently dropped; legacy `toolId`/`initialCommand` state is migrated to the bundled catalog by matching `toolCommand` or `resumeProvider`.

Launch and resume behavior is partly catalog-driven and partly hard-coded:

- The catalog provides one `toolCommand` string and an optional `resumeProvider` string.
- `terminal_launch_plan_for_resolved_tool()` uses the resolved `resumeProvider` to decide whether stored resume metadata matches the tool.
- `new_preassigned_resume()`, `new_tool_shell_command()`, and `resume_tool_shell_command()` hard-code which providers get preassigned resume metadata and which CLI flags implement new/resume behavior.

## TypeScript seams to make Extension-aware

- Replace the static `src/tilePickerCatalog.tsx` module-level flattened catalog with a contribution catalog/registry that can be refreshed after Extension Reload.
- Add `extensionId` to `TilePickerCatalogItem` Tool items and to all Tool Tile creation/clone/launch paths in `src/App.tsx`, `src/tileLayout.ts`, `src/TerminalTile.tsx`, and `src/types.ts`.
- Change picker item ids and availability map keys from `${integrationId}.${integrationTileId}` to an Extension-scoped key such as `${extensionId}:${integrationId}.${integrationTileId}`.
- Preserve and migrate existing Tile picker visibility settings for bundled items from legacy keys like `claude.cli` to `fluidity.core:claude.cli`.
- Represent icon references from Extension Definitions, including first-party icon keys, relative image paths, and text fallbacks. The current `iconByKey` map is only a first-party adapter.
- Decide whether the frontend receives a fully merged catalog from Rust or merges a Rust-provided Extension catalog with a frontend Core Extension Pack adapter. Avoid duplicating Extension discovery logic in TypeScript.
- Add an unresolved/broken Tool Tile UI path. `findTilePickerItemForTile()` currently falls back to Terminal when it cannot resolve a Tool Tile, which would hide missing Extension contributions.

## Rust seams to make Extension-aware

- Introduce a runtime contribution registry keyed by `extensionId + integrationId + integrationTileId`; seed it with the bundled Core Extension Pack under `extensionId: "fluidity.core"`.
- Add `extension_id` to `PersistedTile`, `TerminalLaunchRequest`, `ToolIntegrationTile`, and `ToolAvailabilityResponse`.
- Resolve launches by the three-part identity. A missing Extension contribution should return a specific unavailable/broken contribution error instead of generic `unsupported integration tile`.
- Preserve unresolved persisted Tool Tiles during `sanitize_tile_state()` instead of dropping them. Sanitization should validate shape and geometry without requiring the contribution to be installed.
- Migrate bundled persisted Tool Tiles with no `extensionId` to `fluidity.core` when their old two-part identity resolves to the Core Extension Pack.
- Replace `toolCommand: String` with the v1 Extension Definition command shape (`command.argv[]`). Availability checks should validate the executable at `argv[0]`; launch should shell-escape and pass the entire argv without implicit splitting or shell interpolation.
- Replace hard-coded provider launch/resume switches with catalog/manifest resume strategies. The current `none` and `session-id-arg` strategies should be data-driven.
- Scope Project Extension contributions to the relevant Project/Workspace when resolving launches and availability.
- Include provenance/debug data in registry errors and availability responses so users can distinguish missing executables from missing/invalid Extensions.

## Persisted Tile State migration needs

Persisted Tool Tiles currently store only:

```json
{
  "kind": "tool",
  "integrationId": "claude",
  "integrationTileId": "cli"
}
```

The Extension-aware shape should add `extensionId`:

```json
{
  "kind": "tool",
  "extensionId": "fluidity.core",
  "integrationId": "claude",
  "integrationTileId": "cli"
}
```

Migration should cover:

- Existing bundled Tool Tiles: assign `extensionId: "fluidity.core"` when the old two-part identity resolves to a Core Extension Pack contribution.
- Legacy pre-catalog Tool Tiles: keep the existing `toolId`/`initialCommand` migration path, then assign `fluidity.core`.
- Existing Tile picker visibility settings: copy legacy keys such as `pi.cli` to the new `fluidity.core:pi.cli` keys before unknown-key filtering drops them.
- Unresolved Tool Tiles: preserve the tile, title, geometry, and Tile Resume Metadata; mark it unresolved at render/launch time instead of deleting it from Workspace Tile State.
- App state versioning: consider bumping `APP_STATE_VERSION` when the new field becomes serialized so future migrations can distinguish pre-Extension state.

## Global-uniqueness risks

Current code assumes `integrationId + integrationTileId` is globally unique in several places:

- `src/tilePickerCatalog.tsx` generates Tool picker item ids with `${integrationId}.${integrationTileId}`.
- `src/App.tsx` and `src/SettingsView.tsx` index availability responses by that same string.
- `src/settings.ts` persists Tile picker visibility using that same static item id.
- `src/tileLayout.ts`, `src/App.tsx`, `src/TerminalTile.tsx`, and `src/types.ts` model Tool Tiles and launches without Extension identity.
- `src-tauri/src/lib.rs::tool_integration_tile()` returns the first Tool Tile matching the two-part identity.
- `src-tauri/src/lib.rs::tool_integration_tile_for_launch()` and `tool_integration_tile_for_tile()` resolve launches and persisted tiles with the two-part identity.
- `src-tauri/src/lib.rs::sanitize_tile_state()` drops Tool Tiles that cannot resolve against the currently bundled two-part catalog.
- Resume metadata `provider` strings are separate from Integration identity but also globally compared. Extension-provided resume providers could collide unless resume strategy identity is scoped or validated.

These should move together to the three-part identity so two Extensions can safely contribute the same Integration id and Integration Tile id without picker, settings, availability, launch, or persistence collisions.
