[**@fest-lib/fl-ui v1.0.21**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / MountTaskBarResult

# Type Alias: MountTaskBarResult

```ts
type MountTaskBarResult = object;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:84

## Properties

### appMenu?

```ts
optional appMenu?: MountAppMenuResult;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:91

Launcher SKU app drawer (Task 4+); undefined on non-launcher builds.

***

### closeSwitcher?

```ts
optional closeSwitcher?: () => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:96

#### Returns

`void`

***

### dispose

```ts
dispose: () => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:97

#### Returns

`void`

***

### element

```ts
element: HTMLElement;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:85

***

### isSwitcherOpen?

```ts
optional isSwitcherOpen?: () => boolean;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:95

#### Returns

`boolean`

***

### openAppMenu?

```ts
optional openAppMenu?: () => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:93

Open app menu with taskbar chrome sync (swipe-up from Speed Dial).

#### Returns

`void`

***

### openAppMenuPage?

```ts
optional openAppMenuPage?: () => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:94

#### Returns

`void`

***

### setFocusedTaskId

```ts
setFocusedTaskId: (id) => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:87

#### Parameters

##### id

`string`

#### Returns

`void`

***

### syncWindowTasks

```ts
syncWindowTasks: (windows) => void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:89

Replace dynamic window tasks (Home / Markdown pins stay).

#### Parameters

##### windows

[`EnvWindowTaskDescriptor`](EnvWindowTaskDescriptor.md)[]

#### Returns

`void`

***

### taskList

```ts
taskList: ITask[];
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts:86
