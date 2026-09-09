[**@fest-lib/fl-ui v1.0.29**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / applyQuickTheme

# Function: applyQuickTheme()

```ts
function applyQuickTheme(mode): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:96

Apply light/dark from Quick Settings without importing app Theme.ts (fl.ui ↔ subsystem cycle).
WHY: Must mirror `syncBrowserChromeTheme` — `data-scheme` + hosts + body — or env-shell /
veela keep OS `prefers-color-scheme` / stale `data-scheme="auto"` and light never sticks.

When preference is `auto`, keep `data-scheme="auto"` and pin `data-theme` to the resolved
OS mode so light-dark()/components refresh while still tracking system changes.

## Parameters

### mode

[`QuickThemeMode`](../type-aliases/QuickThemeMode.md) \| `"auto"`

## Returns

`void`
