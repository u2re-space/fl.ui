[**@fest-lib/fl-ui v1.0.27**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / showToast

# Function: showToast()

```ts
function showToast(options): HTMLElement | null;
```

Defined in: modules/projects/fl.ui/src/misc/Toast.ts:339

Create and show a toast notification

## Parameters

### options

`string` \| [`ToastOptions`](../interfaces/ToastOptions.md)

Toast options object or message string

## Returns

`HTMLElement` \| `null`

The created toast element, or null if in service worker context
