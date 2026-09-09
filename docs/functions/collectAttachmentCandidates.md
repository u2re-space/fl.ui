[**@fest-lib/fl-ui v1.0.28**](../README.md)

***

[@fest-lib/fl-ui](../README.md) / collectAttachmentCandidates

# Function: collectAttachmentCandidates()

```ts
function collectAttachmentCandidates(data, source): AttachmentCandidate[];
```

Defined in: modules/projects/fl.ui/src/ui/inputs/attachments/AttachmentSources.ts:53

Collect actual files and URI-list links from a browser transfer payload.
Text-only data is deliberately ignored so an editable composer keeps native
paste behavior and cursor selection semantics.

## Parameters

### data

`DataTransferLike` \| `null` \| `undefined`

### source

`"drop"` \| `"paste"` \| `"share"`

## Returns

[`AttachmentCandidate`](../type-aliases/AttachmentCandidate.md)[]
