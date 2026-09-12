[**@fest-lib/fl-ui v1.0.30**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / Windows2

# Class: Windows2

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:64

Draggable window chrome: titlebar + content + footer slots, standard window controls.

INVARIANT: when `managed` is set, the host shell owns left/top/width/height/z;
chrome emits `window-move` / `window-resize` / `window-focus` / max|min|close intents.

INVARIANT (`native-mode`): when WCO is visible, OS owns min/max/close — custom buttons hide;
titlebar uses CSS `window-drag` / `app-region` instead of JS pointer-drag.

## Extends

- [`UIElement`](UIElement.md)

## Constructors

### Constructor

```ts
new Windows2(): Windows2;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:132

#### Returns

`Windows2`

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

### contentHandler?

```ts
optional contentHandler?: HTMLElement;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:66

***

### footerHandler?

```ts
optional footerHandler?: HTMLElement;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:67

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

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:89

#### Parameters

##### this

`Windows2`

#### Returns

`any`

#### Overrides

[`UIElement`](UIElement.md).[`render`](UIElement.md#render)

***

### resizer?

```ts
optional resizer?: HTMLElement;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:68

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

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:88

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

### titleHandler?

```ts
optional titleHandler?: HTMLElement;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:65

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

## Accessors

### isMaximized

#### Get Signature

```ts
get isMaximized(): boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:401

##### Returns

`boolean`

***

### isMinimized

#### Get Signature

```ts
get isMinimized(): boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:410

##### Returns

`boolean`

***

### managed

#### Get Signature

```ts
get managed(): boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:137

Shell-driven chrome: position/size come from host CSS, not transform.

##### Returns

`boolean`

***

### nativeMode

#### Get Signature

```ts
get nativeMode(): boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:142

Host requested mono/task native chrome (WCO / standalone / fallback full-bleed).

##### Returns

`boolean`

#### Set Signature

```ts
set nativeMode(value): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:146

##### Parameters

###### value

`boolean`

##### Returns

`void`

***

### nativeSurface

#### Get Signature

```ts
get nativeSurface(): "standalone" | "off" | "wco" | "fallback";
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:151

##### Returns

`"standalone"` \| `"off"` \| `"wco"` \| `"fallback"`

***

### usesNativeWindowDrag

#### Get Signature

```ts
get usesNativeWindowDrag(): boolean;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:415

True when CSS window-drag owns titlebar (WCO / installed standalone).

##### Returns

`boolean`

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
optional adoptedCallback(): void | Windows2 | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:125

#### Returns

`void` \| `Windows2` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`adoptedCallback`](UIElement.md#adoptedcallback)

***

### applyBounds()

```ts
applyBounds(bounds): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:372

Apply absolute bounds (managed shells / workspace layer).

#### Parameters

##### bounds

`Partial`\<[`UiWindowBounds`](../type-aliases/UiWindowBounds.md)\> & `object`

#### Returns

`void`

***

### attributeChangedCallback()?

```ts
optional attributeChangedCallback(
   name, 
   oldValue, 
   newValue
): void | Windows2 | undefined;
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

`void` \| `Windows2` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`attributeChangedCallback`](UIElement.md#attributechangedcallback)

***

### bringToFront()

```ts
bringToFront(z): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:510

#### Parameters

##### z

`number`

#### Returns

`void`

***

### clearFocused()

```ts
clearFocused(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:516

#### Returns

`void`

***

### closeWindow()

```ts
closeWindow(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:487

#### Returns

`void`

***

### connectedCallback()

```ts
connectedCallback(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:164

#### Returns

`void`

#### Overrides

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

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:170

#### Returns

`void`

#### Overrides

[`UIElement`](UIElement.md).[`disconnectedCallback`](UIElement.md#disconnectedcallback)

***

### enterNativeMode()

```ts
enterNativeMode(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:424

Enter/exit native-mode. Managed hosts should listen for `window-native` /
`window-exit-native` instead of mutating attrs directly when preferred.

#### Returns

`void`

***

### exitNativeMode()

```ts
exitNativeMode(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:433

#### Returns

`void`

***

### loadStyleLibrary()

```ts
loadStyleLibrary(module): void | Windows2 | undefined;
```

Defined in: modules/projects/lur.e/src/lure/misc/Glit.ts:154

#### Parameters

##### module

`any`

#### Returns

`void` \| `Windows2` \| `undefined`

#### Inherited from

[`UIElement`](UIElement.md).[`loadStyleLibrary`](UIElement.md#loadstylelibrary)

***

### onInitialize()

```ts
onInitialize(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:155

#### Returns

`void`

#### Overrides

[`UIElement`](UIElement.md).[`onInitialize`](UIElement.md#oninitialize)

***

### onRender()

```ts
onRender(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:159

#### Returns

`void`

#### Overrides

[`UIElement`](UIElement.md).[`onRender`](UIElement.md#onrender)

***

### requestFocus()

```ts
requestFocus(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:506

#### Returns

`void`

***

### restoreWindow()

```ts
restoreWindow(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:475

#### Returns

`void`

***

### setVisible()

```ts
setVisible(visible): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:395

#### Parameters

##### visible

`boolean`

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

### toggleMaximize()

```ts
toggleMaximize(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:451

WHY (managed): only emit intent — environment-shell owns attrs via applyChrome.

#### Returns

`void`

***

### toggleMinimize()

```ts
toggleMinimize(): void;
```

Defined in: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts:464

#### Returns

`void`
