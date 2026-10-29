/*
 * Filename: FileManagerContent.ts
 * FullPath: modules/projects/fl.ui/src/ui/explorer/FileManagerContent.ts
 * Change date and time: 17.05.00_30.08.2026
 * Reason for changes: Kick row paint on app resume — recents dropped glyphs again.
 */

import { property, defineElement, H, bindWith, initGlobalClipboard } from "@fest-lib/lure";
import { addEvent, handleStyleChange } from "@fest-lib/dom";
import { preloadStyle } from "@fest-lib/style-lib";
import { ref } from "@fest-lib/object";

//
import { UIElement } from "fl-ui/base/UIElement";

// @ts-ignore
import fmCss from "veela-lib/ui/components/file-manager-content.scss?inline";
import { type FileEntryItem, FileOperative } from "./Operative.ts";

//
import { createItemCtxMenu } from "./ContextMenu.ts";

//
import { entryKey, entryKind, iconFor, formatDate, formatSize } from "./utils.ts";
import { EXPLORER_SORT_EVENT, peekExplorerSort, sortExplorerEntries } from "./entry-sort.ts";
import { resolveEntryIcon } from "./fs-backend.ts";

//
initGlobalClipboard();

//
try { preloadStyle(fmCss); } catch { /* COMPAT: style preload must not block define */ }

// @ts-ignore
@defineElement("ui-file-manager-content")
export class FileManagerContent extends UIElement {
    @property({ source: "query-shadow", name: ".fm-grid-rows" }) gridRowsEl?: HTMLElement;
    @property({ source: "query-shadow", name: ".fm-grid" }) gridEl?: HTMLElement;

    //
    public operativeInstance: FileOperative | null = null;
    public operativeInstanceRef = ref<FileOperative | null>(null);
    #rowsContainer: HTMLElement | null = null;
    #dropHandlersBound = false;

    //
    get entries() { return this.operativeInstance?.entries ?? []; }
    get path() { return this.operativeInstance?.path || "/"; }
    set path(value: string) { if (this.operativeInstance) this.operativeInstance.path = value || "/"; }
    get pathRef() { return this.operativeInstance?.pathRef; }

    //
    refreshList(): Promise<void> {
        // INVARIANT: the header belongs to `.fm-grid` and must survive a list refresh.
        this.findRowsContainer()?.replaceChildren();
        const operative = this.operativeInstance;
        if (!operative) {
            this.syncRows();
            return Promise.resolve();
        }
        return Promise.resolve(operative.refreshList(this.path || "/"))
            .then(() => this.syncRows())
            .catch((error) => {
                console.warn(error);
            });
    }

    //
    onInitialize(): this {
        const result = super.onInitialize();
        this.bindResumePaint();
        return (result ?? this) as this;
    }

    /** WHY: Android recents pauses the compositor; names vanish until a style recalc. */
    private bindResumePaint(): void {
        const onShow = (): void => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            const rows = this.findRowsContainer();
            if (rows) this.kickRowPaint(rows);
        };
        addEvent(document, "visibilitychange", onShow);
        addEvent(document, "cwsp:theme-resume", onShow);
        addEvent(globalThis, "pageshow", onShow);
    }

    //
    private eventBelongsToExplorer(ev: Event | null): boolean {
        if (!ev) return false;
        const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
        if (path.includes(this)) return true;
        // Non-composed drag events stop at the shadow boundary; still treat
        // anything inside this component's shadow tree as in-scope.
        if (this.shadowRoot && path.includes(this.shadowRoot)) return true;

        const target = ev.target as Node | null;
        if (target === this || (target && this.contains(target))) return true;
        if (target && this.shadowRoot?.contains(target)) return true;

        // Clipboard events may target the window while the empty explorer
        // surface owns focus. Walk out of nested shadow roots before deciding.
        let active: any = document.activeElement;
        while (active) {
            if (active === this || this.contains(active)) return true;
            const host = active.getRootNode?.({ composed: true })?.host;
            if (!host || host === active) break;
            active = host;
        }
        return false;
    }

    protected bindDropHandlers() {
        if (this.#dropHandlersBound) return;
        // WHY: Real browser DragEvents are not `composed`, so a host-only listener
        // never sees drops that land on `.fm-grid-rows` inside the shadow tree.
        // Listen on shadowRoot (and the host) so empty-space and row drops both work.
        const shadow = this.shadowRoot;
        if (!shadow) return;
        this.#dropHandlersBound = true;
        if (!this.hasAttribute("tabindex")) this.tabIndex = 0;

        addEvent(this, "pointerdown", (ev: PointerEvent) => {
            const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
            const pressedButton = path.some((node) => node instanceof HTMLButtonElement);
            if (pressedButton) return;
            this.focus({ preventScroll: true });
        });

        const acceptDrag = (ev: DragEvent) => {
            if (!this.eventBelongsToExplorer(ev)) return;
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        };

        const onDrop = (ev: DragEvent) => {
            if (!this.eventBelongsToExplorer(ev)) return;
            ev.preventDefault();
            ev.stopPropagation();
            void this.operativeInstance?.onDrop?.(ev);
        };

        // Capture on shadowRoot so dragover/drop fire for the real (non-composed) event path.
        const dragOpts = { capture: true, passive: false };
        for (const target of [shadow, this] as EventTarget[]) {
            addEvent(target, "dragenter", acceptDrag, dragOpts);
            addEvent(target, "dragover", acceptDrag, dragOpts);
            addEvent(target, "drop", onDrop, dragOpts);
        }

        // Paste is composed, but binding the surface keeps Ctrl+V reliable after a blank-area click.
        addEvent(this, "paste", (ev: ClipboardEvent) => this.onPaste(ev));
        addEvent(shadow, "paste", (ev: ClipboardEvent) => this.onPaste(ev));
    }

    //
    public onPaste(ev: ClipboardEvent) {
        if (this.eventBelongsToExplorer(ev) && this.operativeInstance) this.operativeInstance.onPaste(ev);
    }

    //
    public onCopy(ev: ClipboardEvent) {
        if (this.eventBelongsToExplorer(ev) && this.operativeInstance) this.operativeInstance.onCopy(ev);
    }

    //
    byFirstTwoLetterOrName(name: string): number {
        const firstTwoLetters = name?.substring?.(0, 2)?.toUpperCase?.();
        const index = (firstTwoLetters?.charCodeAt?.(0) || 65) - 65;
        return index;
    }

    //
    constructor() {
        super();
        this.operativeInstance ??= new FileOperative();
        this.operativeInstance.host = this as any;
        this.addEventListener("entries-updated", () => this.syncRows());
        addEvent(window, EXPLORER_SORT_EVENT, () => this.syncRows());
        // WHY: bookmarks ingress rejects (file bytes dropped/pasted/uploaded
        // into `/bookmarks/**`) are dispatched on the operative's host. Surface
        // them as a console warning + a lightweight toast so the user sees the
        // rejection instead of a silent no-op. The toast is minimal (no toast
        // framework dependency) and auto-dismisses.
        this.addEventListener("bookmarks-reject", (ev: Event) => {
            const detail: any = (ev as CustomEvent)?.detail || {};
            const reason = String(detail?.reason || "bookmarks reject");
            const path = String(detail?.path || "");
            const count = Number(detail?.count || 0);
            console.warn(`[bookmarks-reject] ${reason}${path ? ` (path=${path})` : ""}${count ? ` count=${count}` : ""}`);
            this.showBookmarksRejectToast(reason, path, count);
        });
        this.refreshList();
    }

    /**
     * Minimal user-facing notice for bookmarks ingress rejections. Avoids a
     * toast framework dependency; uses a fixed-position element that
     * auto-dismisses after a short timeout. No-op when `document` is absent.
     */
    private showBookmarksRejectToast(reason: string, path: string, count: number): void {
        if (typeof document === "undefined" || !document.body) return;
        try {
            const toast = document.createElement("div");
            toast.setAttribute("part", "bookmarks-reject-toast");
            toast.textContent = `Bookmarks: ${reason}${count ? ` (${count} item${count === 1 ? "" : "s"})` : ""}`;
            toast.style.cssText = [
                "position:fixed",
                "right:16px",
                "bottom:16px",
                "max-width:360px",
                "padding:10px 12px",
                "border-radius:10px",
                "background:rgba(20,20,22,0.92)",
                "color:#f5f5f5",
                "border:1px solid rgba(255,255,255,0.16)",
                "font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
                "z-index:9999",
                "pointer-events:auto",
                "box-shadow:0 6px 24px rgba(0,0,0,0.35)"
            ].join(";");
            (document.body || document.documentElement).appendChild(toast);
            setTimeout(() => {
                try { toast.remove(); } catch { /* ignore */ }
            }, 3500);
        } catch { /* ignore */ }
    }

    private findRowsContainer(): HTMLElement | null {
        if (this.#rowsContainer?.isConnected) return this.#rowsContainer;
        const grids = Array.from(this.shadowRoot?.querySelectorAll?.(".fm-grid") || []) as HTMLElement[];
        const latest = grids.at(-1)?.querySelector<HTMLElement>(".fm-grid-rows") ?? null;
        this.#rowsContainer = latest;
        return latest;
    }

    private syncRows() {
        const rows = this.findRowsContainer();
        const operative = this.operativeInstance;
        if (!rows || !operative) return;
        const rawEntries: any = operative.entries as any;
        const currentEntries =
            Array.isArray(rawEntries) ? rawEntries :
            (Array.isArray(rawEntries?.value) ? rawEntries.value : []);
        const uniqueEntries = new Map<string, FileEntryItem>();
        for (const item of Array.isArray(currentEntries) ? currentEntries : []) {
            if (!item || typeof item !== "object" || item.name == null) continue;
            const key = entryKey(item as FileEntryItem);
            if (!uniqueEntries.has(key)) uniqueEntries.set(key, item as FileEntryItem);
        }

        // WHY: Filesystem enumeration order is not stable across OPFS/FSA backends.
        // Sorting once here keeps visual order and row identity deterministic.
        const safeEntries = sortExplorerEntries(Array.from(uniqueEntries.values()), peekExplorerSort());

        rows.replaceChildren();
        const fragment = document.createDocumentFragment();
        safeEntries.forEach((item, index) => {
            fragment.append(this.makeListElement(item, operative, index + 1));
        });
        rows.append(fragment);
        this.kickRowPaint(rows);
    }

    /** WHY: WebView skips row glyphs after replaceChildren or shell re-slot. */
    private kickRowPaint(rows: HTMLElement): void {
        rows.style.translate = "0";
        void rows.offsetHeight;
        requestAnimationFrame(() => {
            rows.style.removeProperty("translate");
        });
    }

    private makeListElement(item: FileEntryItem, operative: FileOperative, order: number) {
        const op: any = operative as any;
        const kind = entryKind(item);
        const isFile = kind === "file";
        /*
         * Task 5: bookmark URL rows (`/bookmarks/<id>`) carry an http(s) `href`.
         * Render a favicon `<img>` instead of a generic file-type `<ui-icon>` so
         * the bookmark list reads like Chrome's bookmark manager. `onerror`
         * swaps back to the named icon so a failed favicon load never leaves a
         * broken image. OPFS / assets rows (no `href`) keep the existing path.
         */
        const faviconUrl = resolveEntryIcon(item as any);
        const fallbackIcon = iconFor(item);
        // WHY: ui-icon :host used `max-inline-size: 100%` — a collapsed grid track
        // paints a sliver. Pin box + padding on the node so CRX/shell cannot shrink it.
        const iconHostStyle =
            "--ui-icon-size:var(--ui-explorer-icon-size,1.5rem);--ui-icon-padding:0px;inline-size:var(--ui-explorer-icon-size,1.5rem);block-size:var(--ui-explorer-icon-size,1.5rem);min-inline-size:var(--ui-explorer-icon-size,1.5rem);min-block-size:var(--ui-explorer-icon-size,1.5rem);max-inline-size:var(--ui-explorer-icon-size,1.5rem);max-block-size:var(--ui-explorer-icon-size,1.5rem);flex-shrink:0";
        const iconSlot = faviconUrl
            ? H`<img src=${faviconUrl} alt=${fallbackIcon} referrerpolicy="no-referrer" loading="lazy"
                style=${iconHostStyle}
                onerror=${(ev: Event) => {
                    const img = ev.currentTarget as HTMLImageElement;
                    if (!img || img.dataset.fallbackApplied === "1") return;
                    img.dataset.fallbackApplied = "1";
                    const parent = img.parentElement;
                    if (!parent) return;
                    img.remove();
                    parent.append(H`<ui-icon icon=${fallbackIcon} size="1.5rem" style=${iconHostStyle}></ui-icon>` as any);
                }} />`
            : H`<ui-icon icon=${fallbackIcon} size="1.5rem" style=${iconHostStyle} />`;
        const itemEl = H`<div draggable="${isFile}" class="row c2-surface"
            on:click=${(ev: MouseEvent) => requestAnimationFrame(() => op.onRowClick?.(item, ev))}
            on:dblclick=${(ev: MouseEvent) => requestAnimationFrame(() => op.onRowDblClick?.(item, ev))}
            on:dragstart=${(ev: DragEvent) => op.onRowDragStart?.(item, ev)}
            data-id=${item?.name || ""}
            data-kind=${kind}
            data-entry-key=${entryKey(item)}
        >
            <div style="pointer-events:none;background-color:transparent;inline-size:1.5rem;block-size:1.5rem;min-inline-size:1.5rem;min-block-size:1.5rem;max-inline-size:1.5rem;max-block-size:1.5rem;flex-shrink:0;overflow:visible" class="c icon">${iconSlot}</div>
            <div style="pointer-events: none; background-color: transparent;" class="c name" title=${item?.name || ""}><span class="t">${item?.name || ""}</span></div>
            <div style="pointer-events: none; background-color: transparent;" class="c size"><span class="t">${isFile ? formatSize(item?.size) : ""}</span></div>
            <div style="pointer-events: none; background-color: transparent;" class="c date"><span class="t">${isFile ? formatDate(item?.lastModified ?? 0) : ""}</span></div>
            <div style="pointer-events: none; background-color: transparent;" class="c actions">
                <button class="action-btn" title="Copy Path" on:click=${(ev: MouseEvent) => { ev.stopPropagation(); requestAnimationFrame(() => op.onMenuAction?.(item, "copyPath", ev)); }}>
                    <ui-icon icon="copy" />
                </button>
                <button class="action-btn" title="Copy" on:click=${(ev: MouseEvent) => { ev.stopPropagation(); requestAnimationFrame(() => op.onMenuAction?.(item, "copy", ev)); }}>
                    <ui-icon icon="clipboard" />
                </button>
                <button class="action-btn" title="Delete" on:click=${(ev: MouseEvent) => { ev.stopPropagation(); requestAnimationFrame(() => op.onMenuAction?.(item, "delete", ev)); }}>
                    <ui-icon icon="trash" />
                </button>
            </div>
        </div>`;
        bindWith(itemEl, "--order", order, handleStyleChange);
        return itemEl;
    }

    //
    /** WHY: pass CSS text so Glit can refill / shadow-fallback if the constructable sheet emptied. */
    styles = () => fmCss;
    render = function () {
        const self: any = this;
        const fileHeader = H`<div class="fm-grid-header">
            <div class="c icon"><span class="t">@</span></div>
            <div class="c name"><span class="t">Name</span></div>
            <div class="c size"><span class="t">Size</span></div>
            <div class="c date"><span class="t">Modified</span></div>
            <div class="c actions"><span class="t">Actions</span></div>
        </div>`

        //
        const operative = self.operativeInstance;
        if (!operative) return "";

        //
        /* WHY: `will-change: contents` made Android WebView skip painting
         * row text until a later style recalc (icons still drew). */
        const fileRows = H`<div class="fm-grid-rows"></div>`;
        this.#rowsContainer = fileRows as HTMLElement;
        createItemCtxMenu?.(fileRows, operative.onMenuAction.bind(operative), self.entries);
        scheduler?.yield?.()?.then?.(() => {
            self.bindDropHandlers();
            const root = self.shadowRoot;
            const grids = Array.from(root?.querySelectorAll?.(".fm-grid") || []) as HTMLElement[];
            if (grids.length > 1) {
                const latest = grids.at(-1) as HTMLElement;
                for (const extra of grids) {
                    if (extra !== latest) {
                        extra.remove();
                    }
                }
                self.#rowsContainer = latest.querySelector(".fm-grid-rows") as HTMLElement | null;
            }
            self.syncRows();
        });

        //
        const rendered = H`<div class="fm-grid" part="grid">
            ${fileHeader}
            ${fileRows}
        </div>`;

        //
        return rendered;
    }
}

//
export default FileManagerContent;
