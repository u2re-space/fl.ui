[**@fest-lib/fl-ui v1.0.30**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / NativeChromeSubscribeOptions

# Type Alias: NativeChromeSubscribeOptions

```ts
type NativeChromeSubscribeOptions = object;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:133

## Properties

### getRequested

```ts
getRequested: () => boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:137

Whether host currently wants native-mode.

#### Returns

`boolean`

***

### onChange

```ts
onChange: (probe) => void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts:135

Fired on WCO geometrychange + display-mode media changes.

#### Parameters

##### probe

[`NativeWindowChromeProbe`](NativeWindowChromeProbe.md)

#### Returns

`void`
