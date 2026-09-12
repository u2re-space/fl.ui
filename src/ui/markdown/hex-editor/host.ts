/**
 * FIND:hex-editor
 * WHY: Hex pairs live in this shadow. markdown-view `@scope` does not pierce it.
 * INVARIANT: only [0-9a-fA-F] and pair spaces; blur/save pads an odd nibble with 0.
 * INVARIANT: Latin1 overlay is a view of the same bytes — it must not replace hex SoT.
 * INVARIANT: HEX and Latin1 share 16-byte rows and 3ch cells; scroll is copied 1:1.
 * PERF: large buffers paint as chunk textareas; off-screen chunks use content-visibility.
 * INVARIANT: while a paint is in flight and the user has not edited, commitBytes is #srcBytes.
 */
import { ensureViewportTracking } from "@fest-lib/dom";
import { yieldToMain } from "../yield-main";
import {
    HEX_PAINT_CHUNK_BYTES,
    HEX_PAINT_FIRST_BYTES,
    HEX_PAINT_SYNC_MAX_BYTES,
    byteToRowDisplayIndex,
    bytesFromHex,
    bytesToHexRowsSlice,
    bytesToLatin1RowsSlice,
    caretFromDigitIndex,
    compactHexDigits,
    countHexDigitsBefore,
    formatHexRows,
    hexSelectionToByteRange,
    padOddNibble,
    sanitizeHexDraft
} from "./hex";
import { hexEditorShadowCss } from "./styles";

export const HEX_EDITOR_TAG = "cw-hex-editor";

export class CwHexEditorElement extends HTMLElement {
    #scroll: HTMLDivElement | null = null;
    #chunks: HTMLTextAreaElement[] = [];
    #latin1: HTMLPreElement | null = null;
    #toggle: HTMLButtonElement | null = null;
    #resize: ResizeObserver | null = null;
    #painting = false;
    #latin1Parts: string[] = [];
    #latin1Els: HTMLElement[] = [];
    #latin1OriginEnd = 0;
    #selFrom = -1;
    #selTo = -1;
    #syncingScroll = false;
    #srcBytes = new Uint8Array(0);
    #paintedOriginEnd = 0;
    #dirty = false;
    #loading = false;
    #paintGen = 0;

    get value(): string {
        return this.#chunkHex();
    }

    set value(next: string) {
        this.bytes = bytesFromHex(next);
    }

    get bytes(): Uint8Array {
        if (!this.#dirty) return this.#srcBytes;
        return this.#bytesFromChunksAndTail();
    }

    set bytes(next: Uint8Array) {
        this.#srcBytes = next;
        this.#dirty = false;
        void this.#paintHex(next);
    }

    /** Pad the trailing nibble, reformat pairs, return disk bytes. */
    commitBytes(): Uint8Array {
        if (!this.#dirty) {
            this.#padLastChunk();
            return this.#srcBytes;
        }
        this.#padLastChunk();
        const out = this.#bytesFromChunksAndTail();
        this.#srcBytes = out;
        this.#dirty = false;
        this.#loading = false;
        this.#paintedOriginEnd = out.length;
        this.toggleAttribute("data-loading", false);
        this.removeAttribute("aria-busy");
        return out;
    }

    clearDraft(): void {
        this.#paintGen += 1;
        this.#srcBytes = new Uint8Array(0);
        this.#paintedOriginEnd = 0;
        this.#dirty = false;
        this.#loading = false;
        this.toggleAttribute("data-loading", false);
        this.removeAttribute("aria-busy");
        this.#ensureTree();
        this.#replaceChunks([""]);
        this.#setLatin1Open(false);
        this.#resetLatin1();
        const first = this.#chunks[0];
        if (first) {
            first.scrollTop = 0;
            first.scrollLeft = 0;
        }
        if (this.#scroll) {
            this.#scroll.scrollTop = 0;
            this.#scroll.scrollLeft = 0;
        }
    }

    placeCaretAtStart(): void {
        const ta = this.#chunks[0] ?? this.#ensureTree();
        this.#setLatin1Open(false);
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(0, 0);
    }

    get sourceElement(): HTMLTextAreaElement | null {
        this.#ensureTree();
        return this.#chunks[0] ?? null;
    }

    hasFocus(): boolean {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (!active) return false;
        if (active === this) return true;
        return Boolean(this.shadowRoot?.contains(active));
    }

    connectedCallback(): void {
        try {
            ensureViewportTracking();
        } catch {
            /* Viewport optional */
        }
        this.#ensureTree();
        document.addEventListener("selectionchange", this.#onHexSelection);
    }

    disconnectedCallback(): void {
        this.#paintGen += 1;
        document.removeEventListener("selectionchange", this.#onHexSelection);
        this.#resize?.disconnect();
        this.#resize = null;
    }

    #chunkHex(): string {
        return this.#chunks
            .map((ta) => ta.value)
            .filter((part) => part.length > 0)
            .join(" ");
    }

    #bytesFromChunksAndTail(): Uint8Array {
        const painted = bytesFromHex(this.#chunkHex());
        if (this.#loading && this.#paintedOriginEnd < this.#srcBytes.length) {
            const tail = this.#srcBytes.subarray(this.#paintedOriginEnd);
            const out = new Uint8Array(painted.length + tail.length);
            out.set(painted, 0);
            out.set(tail, painted.length);
            return out;
        }
        return painted;
    }

    #activeChunk(): HTMLTextAreaElement | null {
        const active = this.shadowRoot?.activeElement;
        if (active instanceof HTMLTextAreaElement && this.#chunks.includes(active)) return active;
        return this.#chunks[0] ?? null;
    }

    #padLastChunk(): void {
        const ta = this.#chunks[this.#chunks.length - 1];
        if (!ta) return;
        const next = formatHexRows(padOddNibble(compactHexDigits(ta.value)));
        if (next === ta.value) return;
        ta.value = next;
        this.#stampChunk(ta);
        this.#fitChunk(ta);
    }

    #stampChunk(ta: HTMLTextAreaElement): void {
        ta.dataset.bytes = String((compactHexDigits(ta.value).length / 2) | 0);
    }

    #bytesBefore(ta: HTMLTextAreaElement): number {
        let n = 0;
        for (const chunk of this.#chunks) {
            if (chunk === ta) return n;
            n += Number(chunk.dataset.bytes || 0) || (compactHexDigits(chunk.value).length / 2) | 0;
        }
        return n;
    }

    #rewriteLive(ta = this.#activeChunk()): void {
        if (!ta || this.#painting) return;
        const digits = compactHexDigits(ta.value);
        const next = formatHexRows(digits);
        if (next === ta.value) {
            this.#stampChunk(ta);
            this.#syncLatin1Sel();
            return;
        }
        const caretDigits = countHexDigitsBefore(ta.value, ta.selectionStart ?? 0);
        this.#painting = true;
        ta.value = next;
        const pos = caretFromDigitIndex(next, caretDigits);
        ta.setSelectionRange(pos, pos);
        this.#painting = false;
        this.#stampChunk(ta);
        this.#fitChunk(ta);
        this.#dirty = true;
        this.#refreshLatin1Chunk(ta);
        this.#syncLatin1Sel();
    }

    #onBeforeInput = (e: InputEvent): void => {
        if (e.inputType === "insertText" && e.data && /[^0-9a-fA-F\s]/.test(e.data)) {
            e.preventDefault();
            const data = sanitizeHexDraft(e.data);
            if (!data) return;
            this.#insertSanitized(data, e.currentTarget as HTMLTextAreaElement);
        }
    };

    #onPaste = (e: ClipboardEvent): void => {
        e.preventDefault();
        const data = sanitizeHexDraft(e.clipboardData?.getData("text") || "");
        if (!data) return;
        this.#insertSanitized(data, e.currentTarget as HTMLTextAreaElement);
    };

    #insertSanitized(raw: string, target?: HTMLTextAreaElement | null): void {
        const ta = target ?? this.#activeChunk() ?? this.#ensureTree();
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? start;
        ta.value = `${ta.value.slice(0, start)}${raw}${ta.value.slice(end)}`;
        const caret = start + raw.length;
        ta.setSelectionRange(caret, caret);
        this.#dirty = true;
        this.#rewriteLive(ta);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
    }

    #onBlur = (e: Event): void => {
        const ta = e.currentTarget instanceof HTMLTextAreaElement ? e.currentTarget : this.#activeChunk();
        if (!ta) return;
        ta.value = formatHexRows(padOddNibble(compactHexDigits(ta.value)));
        this.#stampChunk(ta);
        this.#fitChunk(ta);
        this.#refreshLatin1Chunk(ta);
    };

    #resetLatin1(): void {
        this.#latin1Parts = [];
        this.#latin1Els = [];
        this.#latin1OriginEnd = 0;
        this.#selFrom = -1;
        this.#selTo = -1;
        this.#latin1?.replaceChildren();
    }

    #appendLatin1Slice(bytes: Uint8Array, start: number, end: number): void {
        if (end <= start || end <= this.#latin1OriginEnd) return;
        const lo = Math.max(start, this.#latin1OriginEnd);
        const text = bytesToLatin1RowsSlice(bytes, lo, end);
        this.#latin1Parts.push(text);
        this.#latin1OriginEnd = end;
        if (!this.#latin1 || !this.hasAttribute("data-latin1")) return;
        const span = this.#latin1Span(text);
        this.#latin1Els.push(span);
        this.#latin1.append(span);
        this.#alignPairHeight(this.#latin1Els.length - 1);
    }

    #latin1Span(text: string): HTMLSpanElement {
        const span = document.createElement("span");
        span.className = "cw-hex-editor__latin1-chunk";
        span.textContent = text;
        return span;
    }

    #refreshLatin1Chunk(ta: HTMLTextAreaElement): void {
        if (!this.hasAttribute("data-latin1") || !this.#latin1) return;
        const idx = this.#chunks.indexOf(ta);
        if (idx < 0) return;
        if (idx >= this.#latin1Parts.length) return;
        const decoded = bytesFromHex(ta.value);
        this.#latin1Parts[idx] = bytesToLatin1RowsSlice(decoded, 0, decoded.length);
        this.#selFrom = -1;
        this.#selTo = -1;
        this.#renderLatin1Plain();
    }

    async #catchUpLatin1(): Promise<void> {
        if (!this.hasAttribute("data-latin1")) return;
        const bytes = this.#dirty ? this.#bytesFromChunksAndTail() : this.#srcBytes;
        const end = this.#loading && !this.#dirty ? this.#paintedOriginEnd : bytes.length;
        while (this.#latin1OriginEnd < end) {
            const start = this.#latin1OriginEnd;
            const next = Math.min(start + (start === 0 ? HEX_PAINT_FIRST_BYTES : HEX_PAINT_CHUNK_BYTES), end);
            this.#appendLatin1Slice(bytes, start, next);
            if (next < end) await yieldToMain();
        }
        this.#alignPairHeights();
        this.#syncScrollFromHex();
    }

    #renderLatin1Plain(): void {
        const pre = this.#latin1;
        if (!pre) return;
        pre.replaceChildren();
        this.#latin1Els = [];
        for (const part of this.#latin1Parts) {
            const span = this.#latin1Span(part);
            this.#latin1Els.push(span);
            pre.append(span);
        }
        this.#alignPairHeights();
        this.#syncScrollFromHex();
    }

    #onHexSelection = (): void => {
        if (!this.hasAttribute("data-latin1")) return;
        const active = this.shadowRoot?.activeElement ?? document.activeElement;
        if (active !== this && !(active instanceof HTMLTextAreaElement && this.#chunks.includes(active))) return;
        this.#syncLatin1Sel();
    };

    #syncLatin1Sel(): void {
        const ta = this.#activeChunk();
        const pre = this.#latin1;
        if (!ta || !pre || !this.hasAttribute("data-latin1")) return;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? start;
        if (start === end) {
            if (this.#selFrom !== -1) {
                this.#selFrom = -1;
                this.#selTo = -1;
                this.#renderLatin1Plain();
            }
            return;
        }
        const local = hexSelectionToByteRange(ta.value, start, end);
        const base = this.#bytesBefore(ta);
        const from = byteToRowDisplayIndex(base + local.from);
        const to = byteToRowDisplayIndex(base + local.to);
        const total = this.#latin1Parts.reduce((n, part) => n + part.length, 0);
        const lo = Math.max(0, Math.min(from, total));
        const hi = Math.max(lo, Math.min(to, total));
        if (lo === this.#selFrom && hi === this.#selTo) return;
        this.#selFrom = lo;
        this.#selTo = hi;
        pre.replaceChildren();
        this.#latin1Els = [];
        let pos = 0;
        for (const part of this.#latin1Parts) {
            const wrap = this.#latin1Span("");
            wrap.replaceChildren();
            const a = pos;
            const b = pos + part.length;
            if (hi <= a || lo >= b) {
                wrap.textContent = part;
            } else {
                const s0 = Math.max(0, lo - a);
                const s1 = Math.min(part.length, hi - a);
                if (s0 > 0) wrap.append(part.slice(0, s0));
                const mark = document.createElement("mark");
                mark.className = "cw-hex-editor__latin1-sel";
                mark.textContent = part.slice(s0, s1);
                wrap.append(mark);
                if (s1 < part.length) wrap.append(part.slice(s1));
            }
            this.#latin1Els.push(wrap);
            pre.append(wrap);
            pos = b;
        }
        this.#alignPairHeights();
        this.#syncScrollFromHex();
    }

    #setLatin1Open(open: boolean): void {
        this.toggleAttribute("data-latin1", open);
        if (this.#toggle) {
            this.#toggle.setAttribute("aria-expanded", open ? "true" : "false");
            this.#toggle.textContent = open ? "‹" : "›";
            this.#toggle.title = open ? "Hide Latin1" : "Show Latin1";
        }
        if (open) {
            void this.#catchUpLatin1().then(() => {
                this.#syncLatin1Sel();
                this.#alignPairHeights();
                this.#syncScrollFromHex();
            });
        }
    }

    #toggleLatin1 = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
        this.#setLatin1Open(!this.hasAttribute("data-latin1"));
    };

    #fitChunk(ta: HTMLTextAreaElement): void {
        ta.style.height = "auto";
        ta.style.height = `${Math.max(ta.scrollHeight, 0)}px`;
    }

    #fitAll = (): void => {
        for (const ta of this.#chunks) this.#fitChunk(ta);
        this.#alignPairHeights();
        this.#syncScrollFromHex();
    };

    #alignPairHeight(index: number): void {
        const ta = this.#chunks[index];
        const lat = this.#latin1Els[index];
        if (!ta || !lat) return;
        const h = Math.max(ta.offsetHeight, 0);
        if (h) lat.style.minHeight = `${h}px`;
    }

    #alignPairHeights(): void {
        const n = Math.min(this.#chunks.length, this.#latin1Els.length);
        for (let i = 0; i < n; i++) this.#alignPairHeight(i);
    }

    #copyScroll(from: HTMLElement, to: HTMLElement): void {
        to.scrollTop = from.scrollTop;
        to.scrollLeft = from.scrollLeft;
    }

    #syncScrollFromHex(): void {
        const hex = this.#scroll;
        const lat = this.#latin1;
        if (!hex || !lat || !this.hasAttribute("data-latin1") || this.#syncingScroll) return;
        this.#syncingScroll = true;
        this.#copyScroll(hex, lat);
        this.#syncingScroll = false;
    }

    #onHexScroll = (): void => {
        if (this.#syncingScroll || !this.hasAttribute("data-latin1") || !this.#latin1 || !this.#scroll) return;
        this.#syncingScroll = true;
        this.#copyScroll(this.#scroll, this.#latin1);
        this.#syncingScroll = false;
    };

    #onLatin1Scroll = (): void => {
        if (this.#syncingScroll || !this.#scroll || !this.#latin1) return;
        this.#syncingScroll = true;
        this.#copyScroll(this.#latin1, this.#scroll);
        this.#syncingScroll = false;
    };

    #bindChunk(ta: HTMLTextAreaElement): void {
        ta.className = "cw-hex-editor__input";
        ta.spellcheck = false;
        ta.setAttribute("autocapitalize", "off");
        ta.setAttribute("autocorrect", "off");
        ta.setAttribute("autocomplete", "off");
        ta.setAttribute("wrap", "off");
        ta.addEventListener("beforeinput", this.#onBeforeInput);
        ta.addEventListener("paste", this.#onPaste);
        ta.addEventListener("dragover", (e) => e.preventDefault());
        ta.addEventListener("drop", (e) => {
            e.preventDefault();
            const data = sanitizeHexDraft(e.dataTransfer?.getData("text") || "");
            if (data) this.#insertSanitized(data, ta);
        });
        ta.addEventListener("input", () => {
            if (this.#painting) return;
            this.#dirty = true;
            this.#rewriteLive(ta);
        });
        ta.addEventListener("blur", this.#onBlur);
        ta.addEventListener("select", () => this.#syncLatin1Sel());
        ta.addEventListener("keyup", this.#onHexSelection);
        ta.addEventListener("pointerup", () => this.#syncLatin1Sel());
    }

    #addChunk(text: string): HTMLTextAreaElement {
        const ta = document.createElement("textarea");
        this.#bindChunk(ta);
        ta.value = text;
        this.#stampChunk(ta);
        this.#scroll?.append(ta);
        this.#chunks.push(ta);
        this.#fitChunk(ta);
        return ta;
    }

    #clearChunks(): void {
        if (this.#scroll) this.#scroll.replaceChildren();
        this.#chunks = [];
    }

    #replaceChunks(texts: string[]): void {
        this.#clearChunks();
        const parts = texts.length ? texts : [""];
        for (const text of parts) this.#addChunk(text);
    }

    async #paintHex(bytes: Uint8Array): Promise<void> {
        const gen = ++this.#paintGen;
        this.#ensureTree();
        this.#loading = true;
        this.toggleAttribute("data-loading", true);
        this.setAttribute("aria-busy", "true");
        this.#resetLatin1();
        this.#paintedOriginEnd = 0;
        this.#clearChunks();

        if (!bytes.length) {
            this.#addChunk("");
            this.#finishPaint(gen);
            return;
        }

        const syncAll = bytes.length <= HEX_PAINT_SYNC_MAX_BYTES;
        const paintSlice = (start: number, end: number): void => {
            this.#addChunk(bytesToHexRowsSlice(bytes, start, end));
            this.#paintedOriginEnd = end;
            if (this.hasAttribute("data-latin1")) this.#appendLatin1Slice(bytes, start, end);
        };

        const first = syncAll ? bytes.length : Math.min(HEX_PAINT_FIRST_BYTES, bytes.length);
        paintSlice(0, first);
        if (syncAll) {
            this.#finishPaint(gen);
            return;
        }

        let i = first;
        while (i < bytes.length) {
            await yieldToMain();
            if (gen !== this.#paintGen) return;
            const end = Math.min(i + HEX_PAINT_CHUNK_BYTES, bytes.length);
            paintSlice(i, end);
            i = end;
        }
        this.#finishPaint(gen);
    }

    #finishPaint(gen: number): void {
        if (gen !== this.#paintGen) return;
        this.#loading = false;
        this.toggleAttribute("data-loading", false);
        this.removeAttribute("aria-busy");
        this.#fitAll();
    }

    #ensureTree(): HTMLTextAreaElement {
        this.toggleAttribute("data-hex-target", true);
        this.classList.add("markdown-viewer-hex");
        if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Hex content");

        const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        if (!this.#scroll || !shadow.contains(this.#scroll)) {
            const style = document.createElement("style");
            style.textContent = hexEditorShadowCss();
            const wrap = document.createElement("div");
            wrap.className = "cw-hex-editor__wrap";
            const scroll = document.createElement("div");
            scroll.className = "cw-hex-editor__scroll";
            const latin1 = document.createElement("pre");
            latin1.className = "cw-hex-editor__latin1";
            latin1.setAttribute("aria-label", "Latin1 preview");
            wrap.append(scroll, latin1);
            scroll.addEventListener("scroll", this.#onHexScroll, { passive: true });
            latin1.addEventListener("scroll", this.#onLatin1Scroll, { passive: true });
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "cw-hex-editor__toggle";
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Latin1 preview");
            toggle.title = "Show Latin1";
            toggle.textContent = "›";
            toggle.addEventListener("click", this.#toggleLatin1);
            shadow.replaceChildren(style, wrap, toggle);
            this.#scroll = scroll;
            this.#latin1 = latin1;
            this.#toggle = toggle;
            this.#chunks = [];
            this.#addChunk("");
            if (typeof ResizeObserver === "function") {
                this.#resize = new ResizeObserver(this.#fitAll);
                this.#resize.observe(scroll);
            }
        }
        return this.#chunks[0]!;
    }
}

export const isHexEditorHost = (el: Element | null | undefined): el is CwHexEditorElement =>
    el instanceof CwHexEditorElement || Boolean(el && el.localName === HEX_EDITOR_TAG);

export function ensureHexEditor(): string {
    if (!customElements.get(HEX_EDITOR_TAG)) {
        customElements.define(HEX_EDITOR_TAG, CwHexEditorElement);
    }
    return HEX_EDITOR_TAG;
}

export function createHexEditorHost(opts?: { slot?: string }): CwHexEditorElement {
    ensureHexEditor();
    const host = document.createElement(HEX_EDITOR_TAG) as CwHexEditorElement;
    host.hidden = true;
    if (opts?.slot) host.slot = opts.slot;
    host.sourceElement;
    return host;
}
