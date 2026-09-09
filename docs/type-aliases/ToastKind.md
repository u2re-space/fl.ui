[**@fest-lib/fl-ui v1.0.29**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / ToastKind

# Type Alias: ToastKind

```ts
type ToastKind = "info" | "success" | "warning" | "error";
```

Defined in: modules/projects/fl.ui/src/misc/Toast.ts:20

Standalone Toast System (kept in sync with subsystem `boot/toast.ts`).

Works in PWA, Chrome extension (content script / popup), and main-thread pages.

WHY (CRX): host-page CSS often wins over `@layer` + `light-dark()` styles injected into
the light DOM, producing unreadable / “broken” toasts. The layer lives in open Shadow DOM
with explicit colors so page styles cannot restyle the pills.
