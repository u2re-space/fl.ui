[**@fest-lib/fl-ui v1.0.19**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / QuickSettings

# Class: QuickSettings

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:412

Win11-like Quick Settings flyout: theme toggle + placeholder tiles + night/brightness sliders.

INVARIANT: instance `open()`/`close()`/`toggle()` only flip local visibility state
(`hidden` + `open` attribute) — the shared exclusivity/singleton/positioning contract
lives in the module-level [toggleQuickSettingsFlyout](../functions/toggleQuickSettingsFlyout.md) / [closeQuickSettingsFlyout](../functions/closeQuickSettingsFlyout.md)
helpers, which wrap `ChromeFlyout` (mirrors `CalendarFlyout.ts`).

## Extends

- [`UIElement`](UIElement.md)

## Constructors

### Constructor

```ts
new QuickSettings(): QuickSettings;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:413

#### Returns

`QuickSettings`

#### Overrides

[`UIElement`](UIElement.md).[`constructor`](UIElement.md#constructor)

## Properties

### adoptedStyleSheets

```ts
adoptedStyleSheets: CSSStyleSheet[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:149

#### Inherited from

[`UIElement`](UIElement.md).[`adoptedStyleSheets`](UIElement.md#adoptedstylesheets)

***

### initialAttributes?

```ts
optional initialAttributes?: Record<string, any> | (() => Record<string, any>);
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:147

#### Inherited from

[`UIElement`](UIElement.md).[`initialAttributes`](UIElement.md#initialattributes)

***

### styleLibs

```ts
styleLibs: HTMLStyleElement[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:148

#### Inherited from

[`UIElement`](UIElement.md).[`styleLibs`](UIElement.md#stylelibs)

***

### theme

```ts
theme: string = "default";
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:15

#### Inherited from

[`UIElement`](UIElement.md).[`theme`](UIElement.md#theme)

***

### formAssociated?

```ts
static optional formAssociated?: boolean;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:134

#### Inherited from

[`UIElement`](UIElement.md).[`formAssociated`](UIElement.md#formassociated)

***

### observedAttributes?

```ts
static optional observedAttributes?: string[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:133

#### Inherited from

[`UIElement`](UIElement.md).[`observedAttributes`](UIElement.md#observedattributes)

## Methods

### $init()?

```ts
optional $init(): void;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:156

#### Returns

`void`

#### Inherited from

[`UIElement`](UIElement.md).[`$init`](UIElement.md#init)

***

### adoptedCallback()?

```ts
optional adoptedCallback(): void | QuickSettings | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:125

#### Returns

`void` \| `QuickSettings` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`adoptedCallback`](UIElement.md#adoptedcallback)

***

### attributeChangedCallback()?

```ts
optional attributeChangedCallback(
   name, 
   oldValue, 
   newValue
): void | QuickSettings | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:126

#### Parameters

##### name

`string`

##### oldValue

`string` \| `null`

##### newValue

`string` \| `null`

#### Returns

`void` \| `QuickSettings` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`attributeChangedCallback`](UIElement.md#attributechangedcallback)

***

### close()

```ts
close(): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:505

#### Returns

`void`

***

### connectedCallback()

```ts
connectedCallback(): this;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:28

#### Returns

`this`

#### Inherited from

[`UIElement`](UIElement.md).[`connectedCallback`](UIElement.md#connectedcallback)

***

### createShadowRoot()

```ts
createShadowRoot(): ShadowRoot;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:155

#### Returns

`ShadowRoot`

#### Inherited from

[`UIElement`](UIElement.md).[`createShadowRoot`](UIElement.md#createshadowroot)

***

### disconnectedCallback()?

```ts
optional disconnectedCallback(): void | QuickSettings | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:124

#### Returns

`void` \| `QuickSettings` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`disconnectedCallback`](UIElement.md#disconnectedcallback)

***

### loadStyleLibrary()

```ts
loadStyleLibrary(module): void | QuickSettings | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:154

#### Parameters

##### module

`any`

#### Returns

`void` \| `QuickSettings` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`loadStyleLibrary`](UIElement.md#loadstylelibrary)

***

### onInitialize()

```ts
onInitialize(): this;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:37

#### Returns

`this`

#### Inherited from

[`UIElement`](UIElement.md).[`onInitialize`](UIElement.md#oninitialize)

***

### onRender()

```ts
onRender(): this;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:492

#### Returns

`this`

#### Overrides

[`UIElement`](UIElement.md).[`onRender`](UIElement.md#onrender)

***

### open()

```ts
open(): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:498

#### Returns

`void`

***

### render()

```ts
render(): any;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:417

#### Returns

`any`

#### Overrides

[`UIElement`](UIElement.md).[`render`](UIElement.md#render)

***

### styleLayers()

```ts
styleLayers(): string[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:150

#### Returns

`string`[]

#### Inherited from

[`UIElement`](UIElement.md).[`styleLayers`](UIElement.md#stylelayers)

***

### styles()

```ts
styles(): CSSStyleSheet | null;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:416

#### Returns

`CSSStyleSheet` \| `null`

#### Overrides

```ts
UIElement.styles
```

***

### toggle()

```ts
toggle(anchor?): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts:511

#### Parameters

##### anchor?

`HTMLElement` \| `null`

#### Returns

`void`
