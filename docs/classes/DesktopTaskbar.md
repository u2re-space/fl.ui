[**@fest-lib/fl-ui v1.0.27**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / DesktopTaskbar

# Class: DesktopTaskbar

Defined in: modules/projects/fl.ui/src/ui/navigation/appearance/Desktop.ts:11

## Extends

- `DOMMixin`

## Constructors

### Constructor

```ts
new DesktopTaskbar(): DesktopTaskbar;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/appearance/Desktop.ts:15

#### Returns

`DesktopTaskbar`

#### Overrides

```ts
DOMMixin.constructor
```

## Properties

### element?

```ts
optional element?: any;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/appearance/Desktop.ts:12

## Accessors

### elements

#### Get Signature

```ts
get elements(): any;
```

Defined in: modules/projects/dom.ts/src/mixin/Mixins.ts:146

##### Returns

`any`

#### Inherited from

```ts
DOMMixin.elements
```

***

### name

#### Get Signature

```ts
get name(): any;
```

Defined in: modules/projects/dom.ts/src/mixin/Mixins.ts:148

##### Returns

`any`

#### Inherited from

[`MobileTaskbar`](MobileTaskbar.md).[`name`](MobileTaskbar.md#name)

***

### storage

#### Get Signature

```ts
get storage(): any;
```

Defined in: modules/projects/dom.ts/src/mixin/Mixins.ts:147

##### Returns

`any`

#### Inherited from

```ts
DOMMixin.storage
```

## Methods

### connect()

```ts
connect(element?): DesktopTaskbar;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/appearance/Desktop.ts:20

#### Parameters

##### element?

`any` = `null`

#### Returns

`DesktopTaskbar`

#### Overrides

```ts
DOMMixin.connect
```

***

### disconnect()

```ts
disconnect(element?): DesktopTaskbar;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/appearance/Desktop.ts:27

#### Parameters

##### element?

`any` = `null`

#### Returns

`DesktopTaskbar`

#### Overrides

```ts
DOMMixin.disconnect
```

***

### relatedForElement()

```ts
relatedForElement(element): object;
```

Defined in: modules/projects/dom.ts/src/mixin/Mixins.ts:143

#### Parameters

##### element

`any`

#### Returns

`object`

##### behaviorSet

```ts
behaviorSet: any;
```

##### mixinSet

```ts
mixinSet: any;
```

##### storeSet

```ts
storeSet: Map<any, any>;
```

#### Inherited from

```ts
DOMMixin.relatedForElement
```

***

### storeForElement()

```ts
storeForElement(element): any;
```

Defined in: modules/projects/dom.ts/src/mixin/Mixins.ts:142

#### Parameters

##### element

`any`

#### Returns

`any`

#### Inherited from

```ts
DOMMixin.storeForElement
```
