[**@fest-lib/fl-ui v1.0.48**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / MobileTaskbar

# Class: MobileTaskbar

Defined in: fl.ui/src/ui/navigation/appearance/Mobile.ts:11

## Extends

- `DOMMixin`

## Constructors

### Constructor

```ts
new MobileTaskbar(): MobileTaskbar;
```

Defined in: fl.ui/src/ui/navigation/appearance/Mobile.ts:15

#### Returns

`MobileTaskbar`

#### Overrides

```ts
DOMMixin.constructor
```

## Properties

### element?

```ts
optional element?: any;
```

Defined in: fl.ui/src/ui/navigation/appearance/Mobile.ts:12

## Accessors

### elements

#### Get Signature

```ts
get elements(): WeakSet<Element> | undefined;
```

Defined in: dom.ts/src/mixin/Mixins.ts:513

##### Returns

`WeakSet`\<`Element`\> \| `undefined`

#### Inherited from

```ts
DOMMixin.elements
```

***

### name

#### Get Signature

```ts
get name(): string | undefined;
```

Defined in: dom.ts/src/mixin/Mixins.ts:515

##### Returns

`string` \| `undefined`

#### Inherited from

```ts
DOMMixin.name
```

***

### storage

#### Get Signature

```ts
get storage(): unknown;
```

Defined in: dom.ts/src/mixin/Mixins.ts:514

##### Returns

`unknown`

#### Inherited from

```ts
DOMMixin.storage
```

## Methods

### connect()

```ts
connect(element?): MobileTaskbar;
```

Defined in: fl.ui/src/ui/navigation/appearance/Mobile.ts:20

#### Parameters

##### element?

`any` = `null`

#### Returns

`MobileTaskbar`

#### Overrides

```ts
DOMMixin.connect
```

***

### disconnect()

```ts
disconnect(element?): MobileTaskbar;
```

Defined in: fl.ui/src/ui/navigation/appearance/Mobile.ts:27

#### Parameters

##### element?

`any` = `null`

#### Returns

`MobileTaskbar`

#### Overrides

```ts
DOMMixin.disconnect
```

***

### relatedForElement()

```ts
relatedForElement(element): Related;
```

Defined in: dom.ts/src/mixin/Mixins.ts:512

#### Parameters

##### element

`Element`

#### Returns

`Related`

#### Inherited from

```ts
DOMMixin.relatedForElement
```

***

### storeForElement()

```ts
storeForElement(element): unknown;
```

Defined in: dom.ts/src/mixin/Mixins.ts:511

#### Parameters

##### element

`Element`

#### Returns

`unknown`

#### Inherited from

```ts
DOMMixin.storeForElement
```
