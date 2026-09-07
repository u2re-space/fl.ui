[**@fest-lib/fl-ui v1.0.21**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / NativeDisplayMode

# Type Alias: NativeDisplayMode

```ts
type NativeDisplayMode = 
  | "browser"
  | "standalone"
  | "fullscreen"
  | "minimal-ui"
  | "window-controls-overlay"
  | "unknown";
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:18

WHY: `native-mode` on `<ui-window>` must know whether OS Window Controls Overlay /
standalone display-mode can own min/max/close + window drag, or whether to fall back
to full-bleed in-tab maximize with custom chrome.

Specs:
- https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API
- https://drafts.csswg.org/css-ui-4/#window-drag
- https://chromestatus.com/feature/5201338641285120
