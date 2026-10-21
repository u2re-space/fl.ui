/**
 * Anchored window: `<app-box>` + `<window-titlebar>` + **two body panes** + SE **resizer**.
 * Uses `fest/lure` `bindAnchorableDragResize` for junction mixins + CSS `anchor-name`.
 */
import {
    APP_BOX_TAG,
    WINDOW_TITLEBAR_TAG,
    ensureWindowElementsDefined,
    type AppBoxElement,
    type WindowTitlebarElement
} from "./WindowElements";
import { JUNCTION_DRAG_EVENTS, JUNCTION_RESIZE_EVENTS, bindAnchorableDragResize } from "@fest-lib/lure";

export {
    APP_BOX_TAG,
    WINDOW_TITLEBAR_TAG,
    ensureWindowElementsDefined,
    AppBoxElement,
    WindowTitlebarElement
} from "./WindowElements";

export type AnchoredWindowOptions = {
    title?: string;
    /** First column / primary region. */
    panePrimary?: Node;
    /** Second column / secondary region. */
    paneSecondary?: Node;
    minWidth?: number;
    minHeight?: number;
};

export type AnchoredWindowParts = {
    frame: AppBoxElement;
    titlebar: WindowTitlebarElement;
    split: HTMLElement;
    panePrimary: HTMLElement;
    paneSecondary: HTMLElement;
    resizer: HTMLElement;
    unbind: () => void;
};

export function createAnchoredWindowShell(opts: AnchoredWindowOptions = {}): AnchoredWindowParts {
    ensureWindowElementsDefined();

    const frame = document.createElement(APP_BOX_TAG) as AppBoxElement;

    frame.style.cssText =
        "position:absolute;inset:auto;left:8%;top:8%;inline-size:min(640px,90vw);block-size:min(400px,72vh);" +
        "min-inline-size:280px;min-block-size:180px;box-sizing:border-box;display:grid;" +
        "grid-template-rows:auto minmax(0,1fr);" +
        "border-radius:12px;overflow:hidden;" +
        "background:color-mix(in oklab, var(--color-surface-container-low, #0f172a) 100%, #000);" +
        "border:1px solid color-mix(in oklab, var(--color-outline-variant, #334155) 45%, transparent);" +
        "box-shadow:0 24px 48px -24px color-mix(in oklab, #000 55%, transparent);color:var(--color-on-surface, #e2e8f0);";

    const titlebar = document.createElement(WINDOW_TITLEBAR_TAG) as WindowTitlebarElement;
    titlebar.setAttribute("heading", opts.title ?? "Window");
    titlebar.style.cssText =
        "display:flex;align-items:center;gap:0.5rem;padding:0.55rem 0.75rem;cursor:grab;user-select:none;" +
        "background:color-mix(in oklab, var(--color-surface-container-low, #1e293b) 100%, transparent);" +
        "border-bottom:1px solid color-mix(in oklab, var(--color-outline-variant, #334155) 35%, transparent);";

    const split = document.createElement("div");
    split.className = "ui-anchored-window__split";
    split.style.cssText =
        "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1px;min-block-size:0;min-inline-size:0;" +
        "background:color-mix(in oklab, var(--color-outline-variant, #334155) 40%, transparent);";

    const panePrimary = document.createElement("div");
    panePrimary.className = "ui-anchored-window__pane ui-anchored-window__pane--primary";
    panePrimary.style.cssText =
        "min-block-size:0;min-inline-size:0;overflow:auto;padding:0.65rem;background:color-mix(in oklab, var(--color-surface-container-low, #0f172a) 100%, transparent);";

    const paneSecondary = document.createElement("div");
    paneSecondary.className = "ui-anchored-window__pane ui-anchored-window__pane--secondary";
    paneSecondary.style.cssText = panePrimary.style.cssText;

    if (opts.panePrimary) panePrimary.append(opts.panePrimary);
    if (opts.paneSecondary) paneSecondary.append(opts.paneSecondary);

    split.append(panePrimary, paneSecondary);

    const resizer = document.createElement("div");
    resizer.className = "ui-anchored-window__resizer";
    resizer.setAttribute("aria-hidden", "true");
    resizer.style.cssText =
        "position:absolute;inset-inline-end:4px;inset-block-end:4px;inline-size:14px;block-size:14px;cursor:nwse-resize;" +
        "background:linear-gradient(135deg, transparent 50%, color-mix(in oklab, currentColor 35%, transparent) 50%);";

    frame.append(titlebar, split, resizer);

    const unbind = bindAnchorableDragResize({
        frame,
        dragHandle: titlebar,
        resizeHandle: resizer,
        minWidth: opts.minWidth ?? 280,
        minHeight: opts.minHeight ?? 180,
        anchors: {
            frame: "--ui-anchored-window",
            dragHandle: "--ui-anchored-window-titlebar",
            resizeHandle: "--ui-anchored-window-resizer"
        }
    });

    return { frame, titlebar, split, panePrimary, paneSecondary, resizer, unbind };
}

/** @deprecated Prefer `createAnchoredWindowShell` + `.frame`. */
export function createAnchoredWindow(opts: AnchoredWindowOptions = {}): HTMLElement {
    return createAnchoredWindowShell(opts).frame;
}

export function wireAnchoredWindowDebug(host: HTMLElement, log = console.log.bind(console)): () => void {
    const onDragEnd = (ev: Event) => log(JUNCTION_DRAG_EVENTS.end, (ev as CustomEvent).detail);
    const onResizeEnd = (ev: Event) => log(JUNCTION_RESIZE_EVENTS.end, (ev as CustomEvent).detail);
    host.addEventListener(JUNCTION_DRAG_EVENTS.end, onDragEnd);
    host.addEventListener(JUNCTION_RESIZE_EVENTS.end, onResizeEnd);
    return () => {
        host.removeEventListener(JUNCTION_DRAG_EVENTS.end, onDragEnd);
        host.removeEventListener(JUNCTION_RESIZE_EVENTS.end, onResizeEnd);
    };
}
