[**@fest-lib/fl-ui v1.0.26**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / AttachmentSource

# Type Alias: AttachmentSource

```ts
type AttachmentSource = "picker" | "drop" | "paste" | "share";
```

Defined in: modules/projects/fl.ui/src/ui/inputs/attachments/AttachmentSources.ts:9

Normalizes browser picker, drop, paste, and share payloads into attachment
candidates without deciding how a consuming view persists or displays them.

FIND:attachment-sources
WHY: Browsers expose the same clipboard file through both `items` and
`files`; this module preserves real file order without duplicating it.
