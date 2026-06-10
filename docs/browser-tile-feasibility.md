# Browser Tile Feasibility

Issue: [#6](https://github.com/owenps/fluidity/issues/6)

## Verdict

Browser Tile should proceed as an experimental native child-webview prototype, not as an iframe.

Caveat: true in-window Browser Tiles currently require Tauri's `unstable` child-webview path. If Fluidity does not want to ship with that feature pinned, defer Browser Tile or ship only an "open in external browser" / separate-window fallback.

## Findings

### iframe embedding is not viable

GitHub rejects iframe embedding with `x-frame-options: deny` and `content-security-policy: frame-ancestors 'none'`. Many other arbitrary sites do the same. Browser Tile must use a top-level native webview, not DOM iframe embedding.

### Tauri approaches

| Approach | Viable? | Notes |
| --- | --- | --- |
| DOM `<iframe>` | No | Blocked by site headers; fragile by design. |
| `WebviewWindow` loading external URL | Partial | Stable and simple, but creates an OS window, not a Tile inside the Workspace Grid. Useful fallback only. |
| Child `Webview` inside the main window | Best fit | Can load `https://github.com/...` and has position/size/focus APIs, so it maps to Tile geometry. Requires Tauri `unstable` for creation in Tauri 2.11.2. |

Evidence:

- Tauri JS docs show `new Webview(window, label, { url, x, y, width, height })` with remote URL support.
- Tauri 2.11.2 Rust source returns `UnstableFeatureNotSupported` for `create_webview` without `feature = "unstable"`.
- `Window::add_child` is also gated by `all(desktop, feature = "unstable")`.
- Current Fluidity has `tauri = { version = "2", features = [] }`, so child webview creation is not available today.

## Recommended architecture

Add a `browser` Tile kind backed by a Browser Tile Runtime:

- React Browser Tile renders only Fluidity chrome + a measured content rect.
- Runtime creates a native child webview labelled by `workspaceId/tileId`.
- On tile move/resize/fullscreen/switch/close, runtime calls set position, size, show/hide, close.
- On tile focus, runtime calls webview focus.
- Persist only Browser Tile definition and resume URL, not live page/runtime state.

Prefer a Rust-owned runtime over direct frontend `new Webview(...)` if we need navigation policy, new-window handling, title updates, downloads, or tighter permission boundaries.

## Constraints

### Auth

- Native webview auth is possible; GitHub login should work as a normal top-level page.
- Do not expect existing Safari/Chrome sessions. User may need to log in inside Fluidity.
- Cookies/storage are app-webview storage; support clearing/incognito later.
- OAuth redirects, passkeys, downloads, and SSO should be manually tested on macOS.

### Navigation

- Start with `https://` URLs only.
- Open non-http schemes externally.
- Handle `window.open` / target-blank links; either reuse the Browser Tile or create another Browser Tile.
- Store current URL as Tile Resume Metadata once URL observation is implemented.

### Site embedding

- Native webview avoids iframe `X-Frame-Options` / `frame-ancestors` blocks.
- Sites can still block or degrade non-mainstream webviews, popups, downloads, media, or auth flows.

### Keyboard focus

- Major risk: when the native child webview is focused, React `keydown` handlers in Fluidity likely do not receive keystrokes.
- App-level commands need native menu accelerators/global command routing, or an explicit way to return focus to Fluidity chrome.
- Browser-focused mode must not break Workspace switching, tile movement, command palette, or close tile commands.

### Overlay/geometry

- Child webviews are native views, not DOM children. CSS z-index, clipping, and React event handling do not apply normally.
- Hide or resize browser webviews when pickers/settings/modals/drag previews appear, or native content may cover Fluidity UI.

### Security

- Treat remote pages as untrusted.
- Do not grant remote URLs Tauri IPC capabilities.
- Current capability uses `windows: ["main"]`; for multiwebview work prefer label-scoped `webviews` capabilities and no `remote.urls` for Browser Tile pages.
- Do not enable `withGlobalTauri` for Browser Tile content.

## Recommendation

Proceed with a small prototype only if acceptable to enable/pin Tauri `unstable`:

1. Enable child webviews behind an experimental Browser Tile flag.
2. Load `https://github.com` in a Browser Tile.
3. Prove resize/move/focus/fullscreen/workspace switch behavior.
4. Prove Fluidity commands still work or document required native command routing.
5. Verify remote page has no usable Tauri IPC permissions.

If `unstable` is unacceptable, defer Browser Tile until Tauri stabilizes child webviews; use system browser/open-external as interim behavior.

## Sources checked

- https://v2.tauri.app/reference/javascript/api/namespacewebview/
- https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/
- https://v2.tauri.app/reference/config/#capabilityremote
- Local Tauri 2.11.2 source under Cargo registry
- `src-tauri/Cargo.toml`
- `src-tauri/capabilities/default.json`
- `curl -I https://github.com`
