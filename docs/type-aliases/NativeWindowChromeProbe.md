[**@fest-lib/fl-ui v1.0.23**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / NativeWindowChromeProbe

# Type Alias: NativeWindowChromeProbe

```ts
type NativeWindowChromeProbe = object;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:26

## Properties

### displayMode

```ts
displayMode: NativeDisplayMode;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:31

***

### isStandaloneLike

```ts
isStandaloneLike: boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:35

Installed-like display (standalone / fullscreen / WCO).

***

### requested

```ts
requested: boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:28

Attribute `native-mode` is requested by host.

***

### surface

```ts
surface: "off" | "wco" | "standalone" | "fallback";
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:43

Effective native surface:
- `wco` → hide custom min/max/close; use window-drag
- `standalone` → mobile/desktop installed, stretch; limited custom chrome
- `fallback` → normal tab; full-bleed + keep custom buttons
- `off` → native-mode not requested

***

### titlebarRect

```ts
titlebarRect: 
  | {
  height: number;
  width: number;
  x: number;
  y: number;
}
  | null;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:33

Geometry of the titlebar area when WCO is visible.

***

### wcoVisible

```ts
wcoVisible: boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:30

`navigator.windowControlsOverlay.visible` (installed desktop PWA).
