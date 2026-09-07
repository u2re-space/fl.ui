[**@fest-lib/fl-ui v1.0.24**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / FlUIStyleVariant

# Type Alias: FlUIStyleVariant

```ts
type FlUIStyleVariant = "veela-basic" | "veela-advanced";
```

Defined in: modules/projects/fl.ui/src/index.ts:31

FL.UI - UI Components Library

Default stylesheet scopes native control chrome to `.btn` and omits host-wide
`input` / `select` / `textarea` overrides. For legacy document-wide styling, set
`configureFlUI({ includeGlobalNativeControlStyles: true })` before importing components,
or call `loadFlUIGlobalNativeControlStyles()` after bootstrap.

Entry points by style variant:
- `fest/fl-ui` - Default (veela-advanced)
- `fest/fl-ui/core` - Basic styles only (no veela)
- `fest/fl-ui/veela` - Alias for veela-advanced
- `fest/fl-ui/veela-basic` - Veela basic styles
- `fest/fl-ui/veela-advanced` - Veela advanced styles
- `fest/fl-ui/veela-beercss` - Beer CSS compatible styles

## Example

```ts
// Default (veela-advanced)
import { Button, Card } from "@fest-lib/fl-ui";

// With specific variant
import { Button } from "@fest-lib/fl-ui/veela-basic";
```
