[**@fest-lib/fl-ui v1.0.24**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / LauncherBridgeApi

# Type Alias: LauncherBridgeApi

```ts
type LauncherBridgeApi = object;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:122

## Properties

### launcherAppInfo?

```ts
optional launcherAppInfo?: (pkg) => Promise<LauncherAppInfo | null>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:127

#### Parameters

##### pkg

`string`

#### Returns

`Promise`\<`LauncherAppInfo` \| `null`\>

***

### launcherIcon

```ts
launcherIcon: (cacheKey, size?, variant?, pack?, drawable?) => Promise<string>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:130

#### Parameters

##### cacheKey

`string`

##### size?

`number`

##### variant?

`string`

##### pack?

`string`

##### drawable?

`string`

#### Returns

`Promise`\<`string`\>

***

### launcherIconPackIcons?

```ts
optional launcherIconPackIcons?: (pack, query?, limit?) => Promise<object[]>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:143

#### Parameters

##### pack

`string`

##### query?

`string`

##### limit?

`number`

#### Returns

`Promise`\<`object`[]\>

***

### launcherIconPacks?

```ts
optional launcherIconPacks?: () => Promise<object[]>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:140

#### Returns

`Promise`\<`object`[]\>

***

### launcherIconVariants?

```ts
optional launcherIconVariants?: (cacheKey) => Promise<object[]>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:137

#### Parameters

##### cacheKey

`string`

#### Returns

`Promise`\<`object`[]\>

***

### launcherIsDefault

```ts
launcherIsDefault: () => Promise<boolean>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:123

#### Returns

`Promise`\<`boolean`\>

***

### launcherLaunch

```ts
launcherLaunch: (pkg, component?, launch?) => Promise<boolean>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:126

#### Parameters

##### pkg

`string`

##### component?

`string`

##### launch?

`LauncherLaunchSpec`

#### Returns

`Promise`\<`boolean`\>

***

### launcherList

```ts
launcherList: (query?) => Promise<LauncherAppEntry[]>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:125

#### Parameters

##### query?

`string`

#### Returns

`Promise`\<[`LauncherAppEntry`](LauncherAppEntry.md)[]\>

***

### launcherOpenAppInfo?

```ts
optional launcherOpenAppInfo?: (pkg) => Promise<boolean>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:128

#### Parameters

##### pkg

`string`

#### Returns

`Promise`\<`boolean`\>

***

### launcherRequestDefault

```ts
launcherRequestDefault: () => Promise<boolean>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:124

#### Returns

`Promise`\<`boolean`\>

***

### launcherUninstall?

```ts
optional launcherUninstall?: (pkg) => Promise<boolean>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts:129

#### Parameters

##### pkg

`string`

#### Returns

`Promise`\<`boolean`\>
