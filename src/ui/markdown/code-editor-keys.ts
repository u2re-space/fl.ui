/**
 * Tab indent + Esc blur for highlighted code fields (Settings CSS/JSON, viewer RAW).
 *
 * FIND:code-editor-keys
 * TAG:code-highlight
 * WHY: While the source is focused, Tab must insert spaces (not move chrome).
 * Esc blurs and parks focus on the frame so Tab is navigation again; click / tap
 * / Enter on the frame re-arms the editor.
 */

const indentUnit = (el: HTMLElement): string => {
    const n = Number.parseInt(getComputedStyle(el).tabSize || "4", 10);
    return " ".repeat(n === 2 ? 2 : 4);
};

const insertAtCaret = (el: HTMLElement, text: string): boolean => {
    if (el instanceof HTMLTextAreaElement) {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        el.setRangeText(text, start, end, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }
    if (!el.isContentEditable) return false;
    el.focus();
    return document.execCommand("insertText", false, text);
};

const editorFrame = (source: HTMLElement): HTMLElement => {
    const frame = source.closest("pre[data-raw-target], .code-highlight-host, pre, [data-raw-target]");
    return frame instanceof HTMLElement ? frame : source;
};

/** Bind Tab / Esc / re-arm on one editable highlight host. */
export const bindCodeEditorKeys = (source: HTMLElement): (() => void) => {
    const editable = source instanceof HTMLTextAreaElement || source.isContentEditable;
    if (!editable) return () => undefined;

    const frame = editorFrame(source);

    const arm = (): void => {
        if (source instanceof HTMLTextAreaElement) source.tabIndex = 0;
        if (document.activeElement !== source) source.focus({ preventScroll: true });
    };

    const disarm = (): void => {
        if (source instanceof HTMLTextAreaElement) source.tabIndex = -1;
        source.blur();
        if (frame !== source) {
            if (!frame.hasAttribute("tabindex")) frame.tabIndex = 0;
            frame.focus({ preventScroll: true });
        }
    };

    const onSourceKey = (event: KeyboardEvent): void => {
        if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
        if (event.key === "Escape") {
            event.preventDefault();
            disarm();
            return;
        }
        if (event.key !== "Tab" || event.shiftKey) return;
        event.preventDefault();
        insertAtCaret(source, indentUnit(source));
    };

    const onFrameKey = (event: KeyboardEvent): void => {
        if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
        if (event.key !== "Enter") return;
        /* WHY: Capacitor reports activeElement as the CE host, not `code`.
         * Stealing Enter then only re-arms — newline never lands. */
        if (event.composedPath().includes(source)) return;
        event.preventDefault();
        arm();
    };

    const onPointerArm = (): void => {
        arm();
    };

    source.addEventListener("keydown", onSourceKey);
    frame.addEventListener("keydown", onFrameKey);
    frame.addEventListener("pointerdown", onPointerArm);
    return () => {
        source.removeEventListener("keydown", onSourceKey);
        frame.removeEventListener("keydown", onFrameKey);
        frame.removeEventListener("pointerdown", onPointerArm);
        if (source instanceof HTMLTextAreaElement && source.tabIndex < 0) source.tabIndex = 0;
    };
};
