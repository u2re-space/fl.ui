/**
 * FIND:hex-editor
 * WHY: Shadow `<style>` is the only sheet that paints this tree.
 * INVARIANT: flatten only — no @layer / nesting / @scope / stretch / light-dark.
 * COMPAT: Capacitor WebView drops stretch / cqb / light-dark and the whole declaration.
 */
export const HEX_EDITOR_SHADOW_CSS = `
:host {
    display: flex;
    flex-direction: row;
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
    font-variant-numeric: tabular-nums;
    z-index: 1;
    pointer-events: auto;
}
:host([hidden]) {
    display: none !important;
    content-visibility: auto;
}
.cw-hex-editor__wrap {
    display: flex;
    flex-direction: row;
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
}
.cw-hex-editor__scroll {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: auto;
    padding: var(--view-padding, 0.75rem);
    scrollbar-width: thin;
}
/* WHY: own rule — Capacitor may drop safe-* and the whole declaration. */
.cw-hex-editor__scroll,
.cw-hex-editor__latin1 {
    justify-content: safe start;
    align-content: safe center;
    justify-items: safe center;
    align-items: safe center;
}
.cw-hex-editor__input {
    display: block;
    box-sizing: border-box;
    flex: 0 0 auto;
    width: max-content;
    min-width: 100%;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: none;
    resize: none;
    outline: none;
    color: inherit;
    background: transparent;
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
    letter-spacing: 0;
    line-height: 1.5;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
    tab-size: 4;
    overflow: hidden;
    field-sizing: content;
    content-visibility: auto;
    contain-intrinsic-size: auto 8rem;
}
:host([data-latin1]) .cw-hex-editor__input {
    content-visibility: visible;
}
.cw-hex-editor__input::placeholder {
    text-transform: none;
}
.cw-hex-editor__toggle {
    flex: 0 0 2rem;
    width: 2rem;
    margin: 0;
    padding: 0;
    border: none;
    border-left: 1px solid rgba(128, 128, 128, 0.35);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
}
.cw-hex-editor__latin1 {
    display: none;
    flex-direction: column;
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
    margin: 0;
    padding: var(--view-padding, 0.75rem);
    overflow: auto;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
    line-height: 1.5;
    text-transform: none;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    border-left: 1px solid rgba(128, 128, 128, 0.35);
    background: var(--view-bg, inherit);
    color: inherit;
    scrollbar-width: thin;
}
:host([data-latin1]) .cw-hex-editor__latin1 {
    display: flex;
}
.cw-hex-editor__latin1-chunk {
    display: block;
    box-sizing: border-box;
    width: max-content;
    min-width: 100%;
    margin: 0;
    padding: 0;
    white-space: pre;
    line-height: 1.5;
}
.cw-hex-editor__scroll::after,
.cw-hex-editor__latin1::after {
    content: "";
    display: block;
    flex: 0 0 2rem;
    width: 100%;
    height: 2rem;
    min-height: 2rem;
    pointer-events: none;
}
.cw-hex-editor__latin1-sel {
    background: rgba(0, 122, 204, 0.38);
    color: inherit;
    padding: 0;
}
`;

export const hexEditorShadowCss = (): string => HEX_EDITOR_SHADOW_CSS;
