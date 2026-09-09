/**
 * FIND:raw-editor
 * WHY: Shadow `<style>` is the only sheet that paints this tree.
 * Veela `_code-highlight.scss` and markdown-view `@scope` do not pierce it.
 * INVARIANT: PWA/Web keeps stretch / cqb / light-dark. Capacitor WebView
 * drops those values and the whole declaration — use RAW_EDITOR_CAPACITOR_CSS.
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
    overflow: hidden !important;
    color: var(--view-fg, inherit);
    background-color: var(--view-bg, transparent);
    color-scheme: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    max-block-size: stretch !important;
    max-inline-size: stretch !important;
    inline-size: stretch;
    block-size: stretch;
    container-type: size;
    z-index: 1;
    pointer-events: auto;
}
:host([hidden]) {
    display: none !important;
}
.cw-raw-editor__scroll {
    inset: 0;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow-x: auto !important;
    overflow-y: auto !important;
    overscroll-behavior: none;
    overflow-anchor: none;
    cursor: text;
    padding: var(--view-padding, 0.75rem);
    max-block-size: stretch !important;
    max-inline-size: stretch !important;
    inline-size: stretch;
    block-size: stretch;
    container-type: size;
    z-index: 1;
    pointer-events: auto;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    scrollbar-color: var(--view-fg, light-dark(#1f2328, #e6edf3)) transparent;
}

.cw-raw-editor__pre {
    position: relative;
    margin: 0;
    box-sizing: border-box;
    min-height: 100%;
    min-block-size: stretch;
    width: 100%;
    inline-size: stretch;
    max-inline-size: stretch;
    border: none;
    color: inherit;
    background: transparent;
    font: inherit;
    line-height: inherit;
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    tab-size: 4;
    padding: 0px;
    z-index: 1;
    max-block-size: none !important;
    max-height: none !important;
    pointer-events: auto;
    inset: 0;
}

.cw-raw-editor__source,
.cw-raw-editor__pre > code {
    display: block !important;
    box-sizing: border-box;
    width: 100%;
    max-inline-size: stretch;
    min-width: 100%;
    min-height: 100%;
    min-block-size: 100%;
    height: max-content;
    block-size: max-content;
    /* WHY: H = max(I+K, box). Extra on size stays inside 100cqh → no overflow to scroll. */
    block-size: calc-size(max-content, 
        max(size, 100cqh) + 
        max(
            var(--virtual-keyboard-height, 0px) - 
            max(100cqh - size, 0px)
        , 0px)
    );
    max-block-size: none !important;
    max-height: none !important;
    font: inherit;
    line-height: max(1.35em, var(--code-line-height, 1.45));
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    /* WHY: Android/source-only drops the overlay — transparent !important here
     * hid every glyph. Only paint-over-source stays invisible. */
    color: var(--view-fg, inherit);
    background: transparent !important;
    outline: none;
    caret-color: var(--view-fg, light-dark(#1f2328, #e6edf3));
    padding-inline-start: var(--code-gutter, 0px);
    font-variant-ligatures: none;
    font-kerning: none;
    z-index: 2;
    pointer-events: auto;
    position: relative;
    inset: 0;
}
.cw-raw-editor__source.code-highlight-painted:not(.code-highlight-source-only) {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    caret-color: var(--view-fg, light-dark(#1f2328, #e6edf3));
}
.cw-raw-editor__source.code-highlight-source-only,
.cw-raw-editor__source.code-highlight-inplace {
    color: var(--view-fg, light-dark(#1f2328, #e6edf3)) !important;
    -webkit-text-fill-color: currentColor !important;
}
.code-highlight-overlay {
    position: absolute !important;
    display: block;
    pointer-events: none;
    user-select: none;
    overflow: hidden;
    visibility: visible;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    color-scheme: inherit;
    color: inherit;
    color: light-dark(#1f2328, #e6edf3);
    -webkit-text-fill-color: currentColor;
    white-space: pre;
    tab-size: 4;
    font: inherit;
    line-height: max(1.35em, var(--code-line-height, 1.45));
    inline-size: stretch;
    block-size: stretch;
    min-block-size: stretch !important;
    min-inline-size: stretch !important;
    z-index: 1;
    scrollbar-gutter: stable;
    scrollbar-width: none;
    pointer-events: none !important;
    opacity: 1;
    inset: 0;
}
.code-highlight-overlay__gutter {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--code-gutter, 0px);
    text-align: end;
    padding-right: 0.5rem;
    box-sizing: border-box;
    color: inherit;
    color: light-dark(#656d76, #8b949e);
    white-space: pre;
    overflow: hidden;
    user-select: none !important;
    pointer-events: none !important;
    z-index: 1;
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
    z-index: 2;
    block-size: max-content;
    margin-trim: block;
    box-sizing: border-box;
    pointer-events: none !important;
    user-select: none !important;
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

.cw-raw-editor__scroll {
    scrollbar-width: thin !important;
    scrollbar-gutter: stable !important;
}
`;

/* COMPAT: Android WebView — % / px / var() only. No stretch, cqb, light-dark, env(). */
export const RAW_EDITOR_CAPACITOR_CSS = `
:host {
    display: block;
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 100%;
    min-height: 100%;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
    color: var(--view-fg, inherit);
    background-color: var(--view-bg, transparent);
    color-scheme: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    z-index: 1;
    pointer-events: auto;
    container-type: size;
}
:host([hidden]) {
    display: none !important;
}
.cw-raw-editor__scroll {
    box-sizing: border-box;
    position: absolute;
    inset: 0;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: max(100%, 100cqh);
    min-width: 100%;
    min-height: max(100%, 100cqh);
    max-height: max(100%, 100cqh);
    max-width: 100%;
    overflow-x: auto;
    overflow-y: auto;
    overscroll-behavior: none;
    -webkit-overflow-scrolling: touch;
    padding: var(--view-padding, 0.75rem);
    z-index: 1;
    pointer-events: auto;
    cursor: text;
    container-type: size;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    scrollbar-color: var(--view-fg, light-dark(#1f2328, #e6edf3)) transparent;
}
.cw-raw-editor__pre {
    position: relative;
    margin: 0;
    box-sizing: border-box;
    min-height: 100%;
    min-block-size: 100%;
    width: max-content;
    min-width: 100%;
    max-width: none;
    max-height: none;
    height: max-content;
    /* WHY: H = max(I, box) + max(K, 0). Extra on size stays inside 100cqh → no overflow to scroll. */
    height: calc-size(max-content, 
        max(size, 100cqh) + 
        max(
            var(--virtual-keyboard-height, 0px) - 
            max(100cqh - size, 0px)
        , 0px)
    );
    border: none;
    color: inherit;
    background: transparent;
    font: inherit;
    line-height: inherit;
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    tab-size: 4;
    padding: 0;
    z-index: 1;
    pointer-events: auto;
}
.cw-raw-editor__source,
.cw-raw-editor__pre > code {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-width: 100%;
    min-height: 100%;
    width: max-content;
    height: max-content;
    max-width: none;
    max-height: none;
    font: inherit;
    line-height: 1.45;
    white-space: pre;
    word-break: normal;
    overflow-wrap: normal;
    color: var(--view-fg, #e6edf3) !important;
    -webkit-text-fill-color: currentColor !important;
    background: transparent;
    outline: none;
    caret-color: var(--view-fg, currentColor);
    padding-left: var(--code-gutter, 0px);
    z-index: 2;
    pointer-events: auto;
}
.cw-raw-editor__source.code-highlight-source-only,
.cw-raw-editor__source.code-highlight-inplace {
    color: var(--view-fg, #e6edf3) !important;
    -webkit-text-fill-color: currentColor !important;
}
.code-highlight-overlay {
    display: block;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
    overflow: hidden;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    color-scheme: inherit;
    color: var(--view-fg, #e6edf3);
    -webkit-text-fill-color: currentColor;
    white-space: pre;
    tab-size: 4;
    font: inherit;
    line-height: 1.45;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
}
.code-highlight-overlay__gutter {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--code-gutter, 0px);
    text-align: right;
    padding-right: 0.5rem;
    box-sizing: border-box;
    color: #8b949e;
    white-space: pre;
    overflow: hidden;
    -webkit-user-select: none;
    user-select: none;
    pointer-events: none;
    z-index: 1;
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
    -webkit-text-fill-color: currentColor;
    z-index: 2;
    box-sizing: border-box;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
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
    color: #8b949e;
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
    color: #79c0ff;
}
.code-highlight-overlay .hljs-string,
.code-highlight-overlay .hljs-addition,
.code-highlight-overlay .hljs-attr,
.code-highlight-inplace .hljs-string,
.code-highlight-inplace .hljs-addition,
.code-highlight-inplace .hljs-attr {
    color: #a5d6ff;
}
.code-highlight-overlay .hljs-number,
.code-highlight-overlay .hljs-variable,
.code-highlight-overlay .hljs-template-variable,
.code-highlight-overlay .hljs-type,
.code-highlight-inplace .hljs-number,
.code-highlight-inplace .hljs-variable,
.code-highlight-inplace .hljs-template-variable,
.code-highlight-inplace .hljs-type {
    color: #3fb950;
}
.code-highlight-overlay .hljs-property,
.code-highlight-overlay .hljs-attribute,
.code-highlight-overlay .hljs-selector-class,
.code-highlight-overlay .hljs-selector-id,
.code-highlight-inplace .hljs-property,
.code-highlight-inplace .hljs-attribute,
.code-highlight-inplace .hljs-selector-class,
.code-highlight-inplace .hljs-selector-id {
    color: #7ee787;
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
    color: #c9d1d9;
}
.code-highlight-overlay .hljs-deletion,
.code-highlight-inplace .hljs-deletion {
    color: #ffa198;
}
:host-context([data-theme="light"]) .code-highlight-overlay,
:host-context([data-theme="light"]) .cw-raw-editor__source.code-highlight-source-only,
:host-context([data-theme="light"]) .cw-raw-editor__source.code-highlight-inplace {
    color: #1f2328;
}
:host-context([data-theme="light"]) .code-highlight-overlay__gutter,
:host-context([data-theme="light"]) .hljs-comment,
:host-context([data-theme="light"]) .hljs-quote {
    color: #656d76;
}
:host-context([data-theme="light"]) .hljs-keyword,
:host-context([data-theme="light"]) .hljs-selector-tag,
:host-context([data-theme="light"]) .hljs-literal,
:host-context([data-theme="light"]) .hljs-built_in,
:host-context([data-theme="light"]) .hljs-title,
:host-context([data-theme="light"]) .hljs-section,
:host-context([data-theme="light"]) .hljs-name {
    color: #0550ae;
}
:host-context([data-theme="light"]) .hljs-string,
:host-context([data-theme="light"]) .hljs-addition,
:host-context([data-theme="light"]) .hljs-attr {
    color: #0a3069;
}
:host-context([data-theme="light"]) .hljs-number,
:host-context([data-theme="light"]) .hljs-variable,
:host-context([data-theme="light"]) .hljs-template-variable,
:host-context([data-theme="light"]) .hljs-type {
    color: #116329;
}
:host-context([data-theme="light"]) .hljs-property,
:host-context([data-theme="light"]) .hljs-attribute,
:host-context([data-theme="light"]) .hljs-selector-class,
:host-context([data-theme="light"]) .hljs-selector-id {
    color: #116329;
}
:host-context([data-theme="light"]) .hljs-meta,
:host-context([data-theme="light"]) .hljs-doctag,
:host-context([data-theme="light"]) .hljs-punctuation,
:host-context([data-theme="light"]) .hljs-operator,
:host-context([data-theme="light"]) .hljs-tag {
    color: #656d76;
}
:host-context([data-theme="light"]) .hljs-deletion {
    color: #cf222e;
}
@media print {
    .code-highlight-overlay { display: none !important; }
    .cw-raw-editor__source {
        color: #111 !important;
        -webkit-text-fill-color: #111 !important;
    }
}
`;

export const rawEditorShadowCss = (nativeCapacitor: boolean): string =>
    nativeCapacitor ? RAW_EDITOR_CAPACITOR_CSS : RAW_EDITOR_SHADOW_CSS;

