/**
 * FIND:raw-editor
 * TAG:raw-editor,raw-editor-layout
 * WHY: Raw scroll + source live in this shadow `<style>`. Capacitor paints that
 * tree; markdown-view adopted `@scope` does not reach a slotted light-DOM `<pre>`.
 * INVARIANT: Capacitor gets RAW_EDITOR_CAPACITOR_CSS — PWA sheet stays untouched.
 */
import { ensureViewportTracking } from "@fest-lib/dom";
import { attachCodeHighlight, languageFromFilename } from "../highlight";
import { rawEditorShadowCss } from "./styles";

const isNativeCapacitorHost = (): boolean => {
    try {
        if (typeof document !== "undefined" && document.documentElement.dataset.cwspNativeShell === "capacitor") {
            return true;
        }
        const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        return typeof cap?.isNativePlatform === "function" && Boolean(cap.isNativePlatform());
    } catch {
        return false;
    }
};

export const RAW_EDITOR_TAG = "cw-raw-editor";

export class CwRawEditorElement extends HTMLElement {
    #pre: HTMLPreElement | null = null;
    #code: HTMLElement | null = null;
    #scroll: HTMLDivElement | null = null;
    #unsubScreen: (() => void) | null = null;
    #unsubEmpty: (() => void) | null = null;
    #unsubNewlines: (() => void) | null = null;
    #newlineArmed = false;

    get value(): string {
        const t = this.#code?.textContent ?? "";
        /* WHY: one trailing LF is the HTML swallow pad, not a user blank line. */
        return t.endsWith("\n") ? t.slice(0, -1) : t;
    }

    set value(next: string) {
        const code = this.#ensureTree();
        /* WHY: pre/code hides a trailing LF — keep an extra one so last empty rows paint. */
        code.textContent = `${next}\n`;
    }

    /* WHY: empty contenteditable has no line box — Capacitor caret jumps off-canvas.
     * Keep one newline so "|" sits on a real row; scroll to origin. */
    clearDraft(): void {
        const code = this.#ensureTree();
        code.textContent = "\n";
        if (this.#scroll) {
            this.#scroll.scrollTop = 0;
            this.#scroll.scrollLeft = 0;
        }
        try {
            this.highlight("markdown");
        } catch {
            /* overlay optional */
        }
    }

    placeCaretAtStart(): void {
        this.#placeCaretAtStartOnce();
        if (isNativeCapacitorHost() && typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => this.#placeCaretAtStartOnce());
        }
    }

    get sourceElement(): HTMLElement | null {
        this.#ensureTree();
        return this.#code;
    }

    hasFocus(): boolean {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (!active) return false;
        if (active === this) return true;
        return Boolean(this.shadowRoot?.contains(active));
    }

    highlight(language?: string): void {
        const code = this.#ensureTree();
        const lang = language || languageFromFilename("") || "markdown";
        attachCodeHighlight(code, { language: lang, lineNumbers: false });
    }

    connectedCallback(): void {
        try {
            ensureViewportTracking();
        } catch {
            /* Viewport optional — must not block view mount. */
        }
        this.#ensureTree();
        this.#bindEmptyFocus();
        this.#bindNewlines();
        if (isNativeCapacitorHost()) this.#bindKeyboardPad();
    }

    disconnectedCallback(): void {
        this.#unsubScreen?.();
        this.#unsubScreen = null;
        this.#unsubEmpty?.();
        this.#unsubEmpty = null;
        this.#unsubNewlines?.();
        this.#unsubNewlines = null;
    }

    /* WHY: Android WebView often skips insertParagraph; HTML also eats a trailing LF. */
    #bindNewlines(): void {
        const code = this.#code;
        if (!code || this.#unsubNewlines) return;
        const onBefore = (e: Event): void => {
            const ev = e as InputEvent;
            if (ev.inputType !== "insertParagraph" && ev.inputType !== "insertLineBreak") return;
            ev.preventDefault();
            this.#newlineArmed = true;
            this.#insertNewline();
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key !== "Enter" || e.altKey || e.metaKey || e.ctrlKey) return;
            if (this.#newlineArmed) return;
            e.preventDefault();
            e.stopPropagation();
            this.#insertNewline();
        };
        const onKeyUp = (e: KeyboardEvent): void => {
            if (e.key === "Enter") this.#newlineArmed = false;
        };
        code.addEventListener("beforeinput", onBefore);
        code.addEventListener("keydown", onKey);
        this.addEventListener("keydown", onKey);
        code.addEventListener("keyup", onKeyUp);
        this.addEventListener("keyup", onKeyUp);
        this.#unsubNewlines = () => {
            code.removeEventListener("beforeinput", onBefore);
            code.removeEventListener("keydown", onKey);
            this.removeEventListener("keydown", onKey);
            code.removeEventListener("keyup", onKeyUp);
            this.removeEventListener("keyup", onKeyUp);
        };
    }

    #caretAtDomEnd(): boolean {
        const code = this.#code;
        if (!code) return false;
        const root = this.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
        const sel = root?.getSelection?.() ?? document.getSelection();
        if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        const text = code.firstChild;
        if (text && text.nodeType === Node.TEXT_NODE) {
            return range.endContainer === text && range.endOffset >= text.textContent!.length;
        }
        return range.endContainer === code;
    }

    #placeCaretBeforeTrailingPad(): void {
        const code = this.#code;
        const text = code?.firstChild;
        if (!code || !text || text.nodeType !== Node.TEXT_NODE) return;
        const data = text.textContent || "";
        const off = data.endsWith("\n") ? Math.max(0, data.length - 1) : data.length;
        const root = this.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
        const sel = root?.getSelection?.() ?? document.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStart(text, off);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    #insertNewline(): void {
        const code = this.#code;
        if (!code) return;
        code.focus({ preventScroll: true });
        if (this.#caretAtDomEnd()) this.#placeCaretBeforeTrailingPad();
        let ok = false;
        try {
            ok = document.execCommand("insertText", false, "\n");
        } catch {
            ok = false;
        }
        if (!ok) {
            const root = this.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
            const sel = root?.getSelection?.() ?? document.getSelection();
            if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode("\n"));
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        const data = code.textContent || "";
        if (!data.endsWith("\n")) code.append("\n");
        code.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }

    /* WHY: calc-size height can be shorter than the scrollport — tap empty chrome, not the source. */
    #bindEmptyFocus(): void {
        const scroll = this.#scroll;
        if (!scroll || this.#unsubEmpty) return;
        const onDown = (e: PointerEvent): void => {
            if (e.button !== 0) return;
            const code = this.#code;
            if (!code) return;
            const hit = e.composedPath()[0];
            if (hit instanceof Node && (hit === code || code.contains(hit))) return;
            e.preventDefault();
            this.#focusSource();
        };
        scroll.addEventListener("pointerdown", onDown);
        this.#unsubEmpty = () => scroll.removeEventListener("pointerdown", onDown);
    }

    #focusSource(): void {
        const code = this.#code;
        if (!code) return;
        const empty = !(code.textContent || "").replace(/\n/g, "").trim();
        if (empty) {
            this.#placeCaretAtStartOnce();
            return;
        }
        code.focus({ preventScroll: true });
        this.#placeCaretBeforeTrailingPad();
    }

    #placeCaretAtStartOnce(): void {
        const code = this.#code;
        if (!code) return;
        code.focus({ preventScroll: true });
        const root = this.shadowRoot as (ShadowRoot & { getSelection?: () => Selection | null }) | null;
        const sel = root?.getSelection?.() ?? document.getSelection();
        if (!sel) return;
        const range = document.createRange();
        const text = code.firstChild;
        if (text && text.nodeType === Node.TEXT_NODE) {
            range.setStart(text, 0);
            range.collapse(true);
        } else {
            range.selectNodeContents(code);
            range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        if (this.#scroll) {
            this.#scroll.scrollTop = 0;
            this.#scroll.scrollLeft = 0;
        }
    }

    /* WHY: do not import new @fest-lib/dom names — package `exports` is dist/dom.js.
     * Viewport already writes --virtual-keyboard-height on <html>; copy CSS-px here. */
    #bindKeyboardPad(): void {
        if (this.#unsubScreen) return;
        const on = (): void => this.#stampKeyboardPad();
        window.addEventListener("keyboardDidShow", on);
        window.addEventListener("keyboardWillShow", on);
        window.addEventListener("keyboardDidHide", on);
        window.addEventListener("keyboardWillHide", on);
        window.visualViewport?.addEventListener("resize", on);
        this.#unsubScreen = () => {
            window.removeEventListener("keyboardDidShow", on);
            window.removeEventListener("keyboardWillShow", on);
            window.removeEventListener("keyboardDidHide", on);
            window.removeEventListener("keyboardWillHide", on);
            window.visualViewport?.removeEventListener("resize", on);
        };
        on();
    }

    #stampKeyboardPad(): void {
        try {
            const raw = getComputedStyle(document.documentElement).getPropertyValue("--virtual-keyboard-height");
            const kb = Math.max(0, Number.parseFloat(raw) || 0);
            const px = `${kb}px`;
            this.style.setProperty("--virtual-keyboard-height", px);
            //if (this.#pre) this.#pre.style.paddingBottom = px;
        } catch {
            /* ignore */
        }
    }

    #ensureTree(): HTMLElement {
        this.toggleAttribute("data-raw-target", true);
        this.classList.add("markdown-viewer-raw");
        if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Raw content");

        const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        if (!this.#code || !shadow.contains(this.#code)) {
            const native = isNativeCapacitorHost();
            this.toggleAttribute("data-capacitor", native);
            const style = document.createElement("style");
            style.textContent = rawEditorShadowCss(native);
            const scroll = document.createElement("div");
            scroll.className = "cw-raw-editor__scroll";
            const pre = document.createElement("pre");
            pre.className = "cw-raw-editor__pre markdown-viewer-raw";
            const code = document.createElement("code");
            code.className = "cw-raw-editor__source code-highlight-source";
            /* WHY: plaintext-only keeps textContent as the draft (Chromium). */
            code.setAttribute("contenteditable", "plaintext-only");
            code.setAttribute("spellcheck", "false");
            code.setAttribute("autocapitalize", "off");
            code.setAttribute("autocorrect", "off");
            pre.appendChild(code);
            scroll.appendChild(pre);
            shadow.replaceChildren(style, scroll);
            this.#scroll = scroll;
            this.#pre = pre;
            this.#code = code;
        }
        return this.#code;
    }
}

export const isRawEditorHost = (el: Element | null | undefined): el is CwRawEditorElement =>
    el instanceof CwRawEditorElement || Boolean(el && el.localName === RAW_EDITOR_TAG);

export function ensureRawEditor(): string {
    if (!customElements.get(RAW_EDITOR_TAG)) {
        customElements.define(RAW_EDITOR_TAG, CwRawEditorElement);
    }
    return RAW_EDITOR_TAG;
}

export function createRawEditorHost(opts?: { slot?: string }): CwRawEditorElement {
    ensureRawEditor();
    const host = document.createElement(RAW_EDITOR_TAG) as CwRawEditorElement;
    host.hidden = true;
    if (opts?.slot) host.slot = opts.slot;
    host.sourceElement;
    return host;
}
