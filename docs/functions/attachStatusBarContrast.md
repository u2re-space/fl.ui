[**@fest-lib/fl-ui v1.0.29**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / attachStatusBarContrast

# Function: attachStatusBarContrast()

```ts
function attachStatusBarContrast(target): () => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/statusbar/statusbar.ts:120

Sample wallpaper + open-window chrome → status/launcher fg.
WHY: Overlay status sits on wallpaper OR on light window title spacers (`data-status-gap`);
wallpaper-only probe kept white icons over light titlebars in app light theme.

## Parameters

### target

`HTMLElement`

## Returns

() => `void`
