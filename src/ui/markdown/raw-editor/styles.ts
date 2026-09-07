/**
 * FIND:raw-editor
 * WHY: Shadow `<style>` is the only sheet Capacitor paints on this tree.
 * Veela `_code-highlight.scss` and markdown-view `@scope` do not pierce it.
 * INVARIANT: no @layer / nesting / @scope — flatten only.
 */
export const RAW_EDITOR_SHADOW_CSS = `
:host {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    color: var(--view-fg, inherit);
    background-color: var(--view-bg, transparent);
    color-scheme: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
}
:host([hidden]) {
    display: none !important;
}
.cw-raw-editor__scroll {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    overflow-anchor: none;
    padding: var(--view-padding, 0.75rem);
    padding-bottom: calc(var(--view-padding, 0.75rem) + var(--virtual-keyboard-height, env(keyboard-inset-height, 0px)) + env(safe-area-inset-bottom, 0px));
}
.cw-raw-editor__pre {
    position: relative;
    margin: 0;
    box-sizing: border-box;
    min-height: 100%;
    width: 100%;
    border: none;
    color: inherit;
    background: transparent;
    font: inherit;
    line-height: inherit;
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    tab-size: 4;
}
.cw-raw-editor__source,
.cw-raw-editor__pre > code {
    display: block !important;
    box-sizing: border-box;
    width: 100%;
    min-height: 100%;
    font: inherit;
    line-height: max(1.35em, var(--code-line-height, 1.45));
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    color: inherit;
    background: transparent !important;
    outline: none;
    caret-color: var(--view-fg, light-dark(#1f2328, #e6edf3));
    padding-inline-start: var(--code-gutter, 0px);
    font-variant-ligatures: none;
    font-kerning: none;
}
.cw-raw-editor__source.code-highlight-painted:not(.code-highlight-source-only) {
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: var(--view-fg, light-dark(#1f2328, #e6edf3));
}
.cw-raw-editor__source.code-highlight-source-only,
.cw-raw-editor__source.code-highlight-inplace {
    color: light-dark(#1f2328, #e6edf3);
    -webkit-text-fill-color: currentColor;
}
.code-highlight-overlay {
    display: block;
    pointer-events: none;
    user-select: none;
    overflow: hidden;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    color-scheme: inherit;
    color: light-dark(#1f2328, #e6edf3);
    -webkit-text-fill-color: currentColor;
    white-space: pre;
    tab-size: 4;
    z-index: 1;
    font: inherit;
    line-height: max(1.35em, var(--code-line-height, 1.45));
}
.code-highlight-overlay__gutter {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--code-gutter, 0px);
    text-align: end;
    padding-right: 0.5rem;
    box-sizing: border-box;
    color: light-dark(#656d76, #8b949e);
    white-space: pre;
    overflow: hidden;
    user-select: none;
    pointer-events: none;
}
.code-highlight-overlay__paint,
.code-highlight-overlay__paint * {
    font-family: inherit;
    font-size: inherit;
    font-weight: 400;
    font-style: normal;
    line-height: inherit;
    letter-spacing: inherit;
    white-space: inherit;
    font-synthesis: none;
    -webkit-text-fill-color: currentColor;
}
.code-highlight-overlay [class^="hljs-"],
.code-highlight-overlay [class*=" hljs-"],
.code-highlight-inplace [class^="hljs-"],
.code-highlight-inplace [class*=" hljs-"] {
    -webkit-text-fill-color: currentColor;
}
.code-highlight-overlay .hljs-comment,
.code-highlight-overlay .hljs-quote,
.code-highlight-inplace .hljs-comment,
.code-highlight-inplace .hljs-quote {
    color: light-dark(#656d76, #8b949e);
}
.code-highlight-overlay .hljs-keyword,
.code-highlight-overlay .hljs-selector-tag,
.code-highlight-overlay .hljs-literal,
.code-highlight-overlay .hljs-built_in,
.code-highlight-overlay .hljs-title,
.code-highlight-overlay .hljs-section,
.code-highlight-overlay .hljs-name,
.code-highlight-inplace .hljs-keyword,
.code-highlight-inplace .hljs-selector-tag,
.code-highlight-inplace .hljs-literal,
.code-highlight-inplace .hljs-built_in,
.code-highlight-inplace .hljs-title,
.code-highlight-inplace .hljs-section,
.code-highlight-inplace .hljs-name {
    color: light-dark(#0550ae, #79c0ff);
}
.code-highlight-overlay .hljs-string,
.code-highlight-overlay .hljs-addition,
.code-highlight-overlay .hljs-attr,
.code-highlight-inplace .hljs-string,
.code-highlight-inplace .hljs-addition,
.code-highlight-inplace .hljs-attr {
    color: light-dark(#0a3069, #a5d6ff);
}
.code-highlight-overlay .hljs-number,
.code-highlight-overlay .hljs-variable,
.code-highlight-overlay .hljs-template-variable,
.code-highlight-overlay .hljs-type,
.code-highlight-inplace .hljs-number,
.code-highlight-inplace .hljs-variable,
.code-highlight-inplace .hljs-template-variable,
.code-highlight-inplace .hljs-type {
    color: light-dark(#116329, #3fb950);
}
.code-highlight-overlay .hljs-property,
.code-highlight-overlay .hljs-attribute,
.code-highlight-overlay .hljs-selector-class,
.code-highlight-overlay .hljs-selector-id,
.code-highlight-inplace .hljs-property,
.code-highlight-inplace .hljs-attribute,
.code-highlight-inplace .hljs-selector-class,
.code-highlight-inplace .hljs-selector-id {
    color: light-dark(#116329, #7ee787);
}
.code-highlight-overlay .hljs-meta,
.code-highlight-overlay .hljs-doctag,
.code-highlight-overlay .hljs-punctuation,
.code-highlight-overlay .hljs-operator,
.code-highlight-overlay .hljs-tag,
.code-highlight-inplace .hljs-meta,
.code-highlight-inplace .hljs-doctag,
.code-highlight-inplace .hljs-punctuation,
.code-highlight-inplace .hljs-operator,
.code-highlight-inplace .hljs-tag {
    color: light-dark(#656d76, #c9d1d9);
}
.code-highlight-overlay .hljs-deletion,
.code-highlight-inplace .hljs-deletion {
    color: light-dark(#cf222e, #ffa198);
}
@media print {
    .code-highlight-overlay { display: none !important; }
    .cw-raw-editor__source {
        color: #111 !important;
        -webkit-text-fill-color: #111 !important;
    }
}
`;
