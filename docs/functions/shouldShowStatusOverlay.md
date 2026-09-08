[**@fest-lib/fl-ui v1.0.27**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / shouldShowStatusOverlay

# Function: shouldShowStatusOverlay()

```ts
function shouldShowStatusOverlay(opts): boolean;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/statusbar/statusbar.ts:85

Transparent top status overlay when:
- mobile browser (not standalone), or
- PWA / CSS fullscreen, or
- document fullscreen API on a mobile-sized viewport.
Standalone installed PWA: no overlay (OS chrome / edge-to-edge windows).

## Parameters

### opts

#### desktop

`boolean`

#### displayMode?

[`ShellDisplayMode`](../type-aliases/ShellDisplayMode.md)

#### standalone?

`boolean`

## Returns

`boolean`
