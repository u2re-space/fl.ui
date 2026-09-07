[**@fest-lib/fl-ui v1.0.18**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / initToastReceiver

# Function: initToastReceiver()

```ts
function initToastReceiver(): () => void;
```

Defined in: modules/projects/fl.ui/src/misc/Toast.ts:502

Initialize toast listener for receiving broadcasts
Call this in main thread contexts (content scripts, popup, etc.)

## Returns

Cleanup function to stop listening

() => `void`
