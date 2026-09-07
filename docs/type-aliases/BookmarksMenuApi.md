[**@fest-lib/fl-ui v1.0.23**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / BookmarksMenuApi

# Type Alias: BookmarksMenuApi

```ts
type BookmarksMenuApi = object;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:49

## Properties

### create?

```ts
optional create?: (parentId, spec) => Promise<BookmarkMenuEntry | null>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:61

Create a URL bookmark or folder under `parentId` (`"0"` = Chrome root).
Omit `url` to create a folder.

#### Parameters

##### parentId

`string` \| `undefined`

##### spec

###### title

`string`

###### url?

`string`

#### Returns

`Promise`\<[`BookmarkMenuEntry`](BookmarkMenuEntry.md) \| `null`\>

***

### listChildren

```ts
listChildren: (folderId?) => Promise<BookmarkMenuEntry[]>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:50

#### Parameters

##### folderId?

`string`

#### Returns

`Promise`\<[`BookmarkMenuEntry`](BookmarkMenuEntry.md)[]\>

***

### open

```ts
open: (entry) => Promise<void>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:52

#### Parameters

##### entry

[`BookmarkMenuEntry`](BookmarkMenuEntry.md)

#### Returns

`Promise`\<`void`\>

***

### remove?

```ts
optional remove?: (entry) => Promise<boolean>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:55

#### Parameters

##### entry

[`BookmarkMenuEntry`](BookmarkMenuEntry.md)

#### Returns

`Promise`\<`boolean`\>

***

### resolveIconUrl?

```ts
optional resolveIconUrl?: (href, size?) => string;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:54

Prefer Google S2; extension `_favicon` is a fallback.

#### Parameters

##### href

`string`

##### size?

`number`

#### Returns

`string`

***

### search

```ts
search: (query) => Promise<BookmarkMenuEntry[]>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:51

#### Parameters

##### query

`string`

#### Returns

`Promise`\<[`BookmarkMenuEntry`](BookmarkMenuEntry.md)[]\>

***

### update?

```ts
optional update?: (id, patch) => Promise<BookmarkMenuEntry | null>;
```

Defined in: modules/projects/fl.ui/src/ui/navigation/app-menu/bookmarks-menu.ts:56

#### Parameters

##### id

`string`

##### patch

###### title?

`string`

###### url?

`string`

#### Returns

`Promise`\<[`BookmarkMenuEntry`](BookmarkMenuEntry.md) \| `null`\>
