[**@fest-lib/fl-ui v1.0.20**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / EnvironmentTaskbarOptions

# Type Alias: EnvironmentTaskbarOptions

```ts
type EnvironmentTaskbarOptions = object;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:70

## Properties

### device

```ts
device: ShellDeviceStatus;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:71

***

### focusedTaskId

```ts
focusedTaskId: refType<string>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:75

Which pinned task is highlighted (home | viewer | window id).

***

### onCloseWindow?

```ts
optional onCloseWindow?: (viewId) => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:81

Close a managed window.

#### Parameters

##### viewId

`string`

#### Returns

`void`

***

### onHome

```ts
onHome: () => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:72

#### Returns

`void`

***

### onMinimizeWindow?

```ts
optional onMinimizeWindow?: (viewId) => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:79

Minimize a managed window (desktop Win toggle).

#### Parameters

##### viewId

`string`

#### Returns

`void`

***

### onViewer

```ts
onViewer: () => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:73

#### Returns

`void`

***

### onWindowTask?

```ts
optional onWindowTask?: (viewId) => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:77

Activate / restore a managed window task (view id).

#### Parameters

##### viewId

`string`

#### Returns

`void`
