[**@fest-lib/fl-ui v1.0.24**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / ModalOptions

# Type Alias: ModalOptions

```ts
type ModalOptions = object;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:38

## Properties

### className?

```ts
optional className?: string;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:41

***

### closeOnBackdrop?

```ts
optional closeOnBackdrop?: boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:43

***

### closeOnEscape?

```ts
optional closeOnEscape?: boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:44

***

### content

```ts
content: HTMLElement | DocumentFragment;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:39

***

### id?

```ts
optional id?: string;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:40

***

### initialFocus?

```ts
optional initialFocus?: HTMLElement | string | null;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:42

***

### onClose?

```ts
optional onClose?: (reason) => void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:46

#### Parameters

##### reason

[`ModalCloseReason`](ModalCloseReason.md)

#### Returns

`void`

***

### useNativeDialog?

```ts
optional useNativeDialog?: boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/modal/Modal.ts:45
