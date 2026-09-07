[**@fest-lib/fl-ui v1.0.23**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / positionFlyout

# Function: positionFlyout()

```ts
function positionFlyout(
   el, 
   mode, 
   opts?
): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/flyout/ChromeFlyout.ts:102

Place flyout for desktop (bottom-right) or mobile (calendar center / QS top-center).
INVARIANT: panel itself must set `pointer-events: auto`.

## Parameters

### el

`HTMLElement`

### mode

[`ChromeFlyoutKind`](../type-aliases/ChromeFlyoutKind.md)

### opts?

#### align?

[`ChromeFlyoutAlign`](../type-aliases/ChromeFlyoutAlign.md)

#### anchor?

`HTMLElement` \| `null`

## Returns

`void`
