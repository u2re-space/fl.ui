[**@fest-lib/fl-ui v1.0.18**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / UIElement

# Class: UIElement

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:14

## Extends

- `HTMLElement`\<`this`\> & `GLitElementInstance`\<`this`\> & `CustomElementLifecycle`\<`this`\>

## Extended by

- [`StatusBar`](StatusBar.md)
- [`UITaskBar`](UITaskBar.md)
- [`UITask`](UITask.md)
- [`CalendarFlyout`](CalendarFlyout.md)
- [`QuickSettings`](QuickSettings.md)
- [`Windows2`](Windows2.md)

## Constructors

### Constructor

```ts
new UIElement(): UIElement;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:22

#### Returns

`UIElement`

#### Overrides

```ts
GLitElement().constructor
```

## Properties

### adoptedStyleSheets

```ts
adoptedStyleSheets: CSSStyleSheet[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:149

#### Inherited from

```ts
GLitElement().adoptedStyleSheets
```

***

### initialAttributes?

```ts
optional initialAttributes?: Record<string, any> | (() => Record<string, any>);
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:147

#### Inherited from

```ts
GLitElement().initialAttributes
```

***

### styleLibs

```ts
styleLibs: HTMLStyleElement[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:148

#### Inherited from

```ts
GLitElement().styleLibs
```

***

### styles?

```ts
optional styles?: any;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:146

#### Inherited from

```ts
GLitElement().styles
```

***

### theme

```ts
theme: string = "default";
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:15

***

### formAssociated?

```ts
static optional formAssociated?: boolean;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:134

#### Inherited from

```ts
GLitElement().formAssociated
```

***

### observedAttributes?

```ts
static optional observedAttributes?: string[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:133

#### Inherited from

```ts
GLitElement().observedAttributes
```

## Methods

### $init()?

```ts
optional $init(): void;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:156

#### Returns

`void`

#### Inherited from

```ts
GLitElement().$init
```

***

### adoptedCallback()?

```ts
optional adoptedCallback(): void | UIElement | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:125

#### Returns

`void` \| `UIElement` \| `undefined`

#### Inherited from

```ts
GLitElement().adoptedCallback
```

***

### attributeChangedCallback()?

```ts
optional attributeChangedCallback(
   name, 
   oldValue, 
   newValue
): void | UIElement | undefined;
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

`void` \| `UIElement` \| `undefined`

#### Inherited from

```ts
GLitElement().attributeChangedCallback
```

***

### connectedCallback()

```ts
connectedCallback(): this;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:28

#### Returns

`this`

#### Overrides

```ts
GLitElement().connectedCallback
```

***

### createShadowRoot()

```ts
createShadowRoot(): ShadowRoot;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:155

#### Returns

`ShadowRoot`

#### Inherited from

```ts
GLitElement().createShadowRoot
```

***

### disconnectedCallback()?

```ts
optional disconnectedCallback(): void | UIElement | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:124

#### Returns

`void` \| `UIElement` \| `undefined`

#### Inherited from

```ts
GLitElement().disconnectedCallback
```

***

### loadStyleLibrary()

```ts
loadStyleLibrary(module): void | UIElement | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:154

#### Parameters

##### module

`any`

#### Returns

`void` \| `UIElement` \| `undefined`

#### Inherited from

```ts
GLitElement().loadStyleLibrary
```

***

### onInitialize()

```ts
onInitialize(): this;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:37

#### Returns

`this`

#### Overrides

```ts
GLitElement().onInitialize
```

***

### onRender()

```ts
onRender(): void | UIElement | undefined;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:24

#### Returns

`void` \| `UIElement` \| `undefined`

#### Overrides

```ts
GLitElement().onRender
```

***

### render()

```ts
render(_weak?): any;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:18

#### Parameters

##### \_weak?

`WeakRef`\<`any`\>

#### Returns

`any`

#### Overrides

```ts
GLitElement().render
```

***

### styleLayers()

```ts
styleLayers(): string[];
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:150

#### Returns

`string`[]

#### Inherited from

```ts
GLitElement().styleLayers
```
