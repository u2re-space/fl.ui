[**@fest-lib/fl-ui v1.0.28**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / CalendarFlyout

# Class: CalendarFlyout

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:106

Win11-like calendar flyout: today header + navigable month grid.

INVARIANT: instance `open()`/`close()`/`toggle()` only flip local visibility state
(`hidden` + `open` attribute) — the shared exclusivity/singleton/positioning contract
lives in the module-level [toggleCalendarFlyout](../functions/toggleCalendarFlyout.md) / [closeCalendarFlyout](../functions/closeCalendarFlyout.md)
helpers, which wrap `ChromeFlyout` (mirrors Quick Settings wiring).

## Extends

- [`UIElement`](UIElement.md)

## Constructors

### Constructor

```ts
new CalendarFlyout(): CalendarFlyout;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:133

#### Returns

`CalendarFlyout`

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

### render

```ts
render: () => any;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:114

#### Returns

`any`

#### Overrides

[`UIElement`](UIElement.md).[`render`](UIElement.md#render)

***

### styleLibs

```ts
styleLibs: HTMLStyleElement[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:148

#### Inherited from

[`UIElement`](UIElement.md).[`styleLibs`](UIElement.md#stylelibs)

***

### styles

```ts
styles: () => CSSStyleSheet | null;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:113

#### Returns

`CSSStyleSheet` \| `null`

#### Overrides

[`UIElement`](UIElement.md).[`styles`](UIElement.md#styles)

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
optional adoptedCallback(): void | CalendarFlyout | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:125

#### Returns

`void` \| `CalendarFlyout` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`adoptedCallback`](UIElement.md#adoptedcallback)

***

### attributeChangedCallback()?

```ts
optional attributeChangedCallback(
   name, 
   oldValue, 
   newValue
): void | CalendarFlyout | undefined;
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

`void` \| `CalendarFlyout` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`attributeChangedCallback`](UIElement.md#attributechangedcallback)

***

### close()

```ts
close(): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:265

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

### disconnectedCallback()

```ts
disconnectedCallback(): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:146

#### Returns

`void`

#### Overrides

[`UIElement`](UIElement.md).[`disconnectedCallback`](UIElement.md#disconnectedcallback)

***

### loadStyleLibrary()

```ts
loadStyleLibrary(module): void | CalendarFlyout | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:154

#### Parameters

##### module

`any`

#### Returns

`void` \| `CalendarFlyout` \| `undefined`

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
onRender(): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:140

#### Returns

`void`

#### Overrides

[`UIElement`](UIElement.md).[`onRender`](UIElement.md#onrender)

***

### open()

```ts
open(): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:258

#### Returns

`void`

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

### toggle()

```ts
toggle(anchor?): void;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/calendar/CalendarFlyout.ts:271

#### Parameters

##### anchor?

`HTMLElement` \| `null`

#### Returns

`void`
