[**@fest-lib/fl-ui v1.0.19**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / UITask

# Class: UITask

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/Task.ts:45

## Extends

- [`UIElement`](UIElement.md)

## Constructors

### Constructor

```ts
new UITask(): UITask;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/Task.ts:51

#### Returns

`UITask`

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

### icon?

```ts
optional icon?: string;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/Task.ts:48

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
render: (this) => any;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/Task.ts:53

#### Parameters

##### this

`UITask`

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

### theme

```ts
theme: string = "default";
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:15

#### Inherited from

[`UIElement`](UIElement.md).[`theme`](UIElement.md#theme)

***

### title?

```ts
optional title?: string;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/Task.ts:47

The **`HTMLElement.title`** property represents the title of the element: the text usually displayed in a 'tooltip' popup when the mouse is over the node.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/HTMLElement/title)

#### Overrides

```ts
UIElement.title
```

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
optional adoptedCallback(): void | UITask | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:125

#### Returns

`void` \| `UITask` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`adoptedCallback`](UIElement.md#adoptedcallback)

***

### attributeChangedCallback()?

```ts
optional attributeChangedCallback(
   name, 
   oldValue, 
   newValue
): void | UITask | undefined;
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

`void` \| `UITask` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`attributeChangedCallback`](UIElement.md#attributechangedcallback)

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
optional disconnectedCallback(): void | UITask | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:124

#### Returns

`void` \| `UITask` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`disconnectedCallback`](UIElement.md#disconnectedcallback)

***

### loadStyleLibrary()

```ts
loadStyleLibrary(module): void | UITask | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:154

#### Parameters

##### module

`any`

#### Returns

`void` \| `UITask` \| `undefined`

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
onRender(): void | UITask | undefined;
```

Defined in: modules/projects/fl.ui/src/ui/base/UIElement.ts:24

#### Returns

`void` \| `UITask` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`onRender`](UIElement.md#onrender)

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

Defined in: modules/projects/fl.ui/src/ui/navigation/taskbar/element/Task.ts:52

#### Returns

`CSSStyleSheet` \| `null`

#### Overrides

```ts
UIElement.styles
```
