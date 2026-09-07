/**
 * FIND:raw-editor
 * TAG:raw-editor,raw-editor-layout
 * WHY: Raw scroll + source live in this shadow `<style>`. Capacitor paints that
 * tree; markdown-view adopted `@scope` does not reach a slotted light-DOM `<pre>`.
 */
import { ensureViewportTracking } from "@fest-lib/dom";
import { attachCodeHighlight, languageFromFilename } from "../highlight";
import { RAW_EDITOR_SHADOW_CSS } from "./styles";

export const RAW_EDITOR_TAG = "cw-raw-editor";

export class CwRawEditorElement extends HTMLElement {
    #pre: HTMLPreElement | null = null;
    #code: HTMLElement | null = null;

    get value(): string {
        return this.#code?.textContent ?? "";
    }

    set value(next: string) {
        const code = this.#ensureTree();
        if (code.textContent !== next) code.textContent = next;
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
        ensureViewportTracking();
        this.#ensureTree();
    }

    #ensureTree(): HTMLElement {
        this.toggleAttribute("data-raw-target", true);
        this.classList.add("markdown-viewer-raw");
        if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Raw content");

        const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        if (!this.#code || !shadow.contains(this.#code)) {
            const style = document.createElement("style");
            style.textContent = RAW_EDITOR_SHADOW_CSS;
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
