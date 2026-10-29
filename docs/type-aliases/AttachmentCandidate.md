[**@fest-lib/fl-ui v1.0.43**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / AttachmentCandidate

# Type Alias: AttachmentCandidate

```ts
type AttachmentCandidate = 
  | {
  file: File;
  kind: "file";
  source: AttachmentSource;
}
  | {
  kind: "url";
  source: Exclude<AttachmentSource, "picker">;
  url: string;
};
```

Defined in: fl.ui/src/ui/inputs/attachments/AttachmentSources.ts:11
