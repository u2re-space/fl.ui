[**@fest-lib/fl-ui v1.0.29**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / FlUIConfig

# Interface: FlUIConfig

Defined in: modules/projects/fl.ui/src/index.ts:33

## Properties

### includeGlobalNativeControlStyles?

```ts
optional includeGlobalNativeControlStyles?: boolean;
```

Defined in: modules/projects/fl.ui/src/index.ts:40

When true, also loads host-wide rules for native `button` and bare `input`/`select`/`textarea`.
Default false so fl-ui does not restyle the whole document.

***

### loadStyles?

```ts
optional loadStyles?: boolean;
```

Defined in: modules/projects/fl.ui/src/index.ts:35

Whether to load styles automatically (default: true)

***

### styleVariant?

```ts
optional styleVariant?: FlUIStyleVariant;
```

Defined in: modules/projects/fl.ui/src/index.ts:42

Style variant to use (default: "veela-advanced")
