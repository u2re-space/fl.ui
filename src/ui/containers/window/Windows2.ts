/*
 * Filename: Windows2.ts
 * FullPath: modules/projects/fl.ui/src/ui/containers/window/Windows2.ts
 * Change date and time: 23.10.00_23.08.2026
 * Reason for changes: Chrome-wire does not re-probe theme; title-button observer only.
 * FIND:win-footer
 * TAG:hang-open
 */
import { defineElement, property, H, numberRef } from "@fest-lib/lure";
import { addEvent } from "@fest-lib/dom";
import { bindStyle, S, preloadStyle } from "@fest-lib/style-lib";
import { UIElement } from "fl-ui/base/UIElement";
import "@fest-lib/icon";
import {
    probeNativeWindowChrome,
    subscribeNativeWindowChrome,
    type NativeWindowChromeProbe
} from "./native-window-chrome";
import {
    restoreThemeColorAfterNativeWindow,
    syncAmbientThemeColor,
    syncThemeColorFromNativeWindow
} from "./native-theme-color";

// @ts-ignore — Vite inline SCSS → adopted stylesheet
import styles from "veela-lib/ui/components/window.scss?inline";

const styled = preloadStyle(styles);

export {
    probeNativeWindowChrome,
    subscribeNativeWindowChrome,
    type NativeWindowChromeProbe,
    type NativeDisplayMode,
    type NativeChromeSubscribeOptions
} from "./native-window-chrome";

/** Phosphor names (duotone registry): minimize / maximize / restore / close. */
const ICON_MINIMIZE = "minus";
const ICON_MAXIMIZE = "corners-out";
const ICON_RESTORE = "corners-in";
const ICON_CLOSE = "x";

const DRAG_MIN = Object.freeze({ w: 240, h: 160 });

export type UiWindowBounds = {
    x: number;
    y: number;
    w: number;
    h: number;
};

/**
 * Draggable window chrome: titlebar + content + footer slots, standard window controls.
 *
 * INVARIANT: when `managed` is set, the host shell owns left/top/width/height/z;
 * chrome emits `window-move` / `window-resize` / `window-focus` / max|min|close intents.
 *
 * INVARIANT (`native-mode`): when WCO is visible, OS owns min/max/close — custom buttons hide;
 * titlebar uses CSS `window-drag` / `app-region` instead of JS pointer-drag.
 */
// @ts-ignore
@defineElement("ui-window")
export class Windows2 extends UIElement {
    @property({ source: "query-shadow", name: ".title-handler" }) titleHandler?: HTMLElement;
    @property({ source: "query-shadow", name: ".content-handler" }) contentHandler?: HTMLElement;
    @property({ source: "query-shadow", name: ".footer-handler" }) footerHandler?: HTMLElement;
    @property({ source: "query-shadow", name: ".window-resizer" }) resizer?: HTMLElement;

    /** Cumulative drag offset in CSS pixels (unmanaged / standalone mode). */
    #ox = numberRef(0);
    #oy = numberRef(0);
    #dragUnbind: (() => void) | null = null;
    #resizeUnbind: (() => void) | null = null;
    #focusUnbind: (() => void) | null = null;
    #controlsUnbind: (() => void) | null = null;
    #controlsMo: MutationObserver | null = null;
    #nativeUnbind: (() => void) | null = null;
    #attrObserver: MutationObserver | null = null;
    #controlsReady = false;
    #wireAttempts = 0;
    #lastChromeActionAt = 0;
    #lastNativeProbe: NativeWindowChromeProbe | null = null;
    #footerSlotUnbind: (() => void) | null = null;
    #lastThemeCover: boolean | null = null;

    // WHY: UIElement defines `render`/`styles` as instance fields; subclass methods would be shadowed.
    styles = function () { return styled; };
    render = function (this: Windows2) {
        return H`<div class="window-container" part="window-container">
            <header class="title-handler" part="title-handler">
                <div class="title-handler-main" part="title">
                    <slot name="title"></slot>
                </div>
                <div class="title-handler-actions" part="actions">
                    <slot name="actions"></slot>
                </div>
                <div class="title-handler-buttons" part="controls" data-no-drag>
                    <button class="title-minimize" type="button" aria-label="Minimize" title="Minimize" data-no-drag data-ui-win-action="minimize">
                        <ui-icon icon=${ICON_MINIMIZE}></ui-icon>
                    </button>
                    <button class="title-maximize" type="button" aria-label="Maximize" title="Maximize" data-no-drag data-ui-win-action="maximize">
                        <ui-icon icon=${ICON_MAXIMIZE}></ui-icon>
                    </button>
                    <button
                        class="title-exit-native"
                        type="button"
                        aria-label="Exit native"
                        title="Exit native"
                        data-no-drag
                        data-ui-win-action="exit-native"
                        hidden
                    >
                        <ui-icon icon=${ICON_RESTORE}></ui-icon>
                    </button>
                    <button class="title-close" type="button" aria-label="Close" title="Close" data-no-drag data-ui-win-action="close">
                        <ui-icon icon=${ICON_CLOSE}></ui-icon>
                    </button>
                </div>
            </header>
            <div class="content-handler" part="content-handler" style="container-type: size;">
                <slot name="content"></slot>
                <slot></slot>
            </div>
            <footer class="footer-handler" part="footer-handler">
                <slot name="footer"></slot>
            </footer>
            <div class="window-resizer" part="resizer" aria-hidden="true" data-no-drag></div>
        </div>`;
    };

    constructor() {
        super();
    }

    /** Shell-driven chrome: position/size come from host CSS, not transform. */
    get managed(): boolean {
        return this.hasAttribute("managed");
    }

    /** Host requested mono/task native chrome (WCO / standalone / fallback full-bleed). */
    get nativeMode(): boolean {
        return this.hasAttribute("native-mode");
    }

    set nativeMode(value: boolean) {
        this.toggleAttribute("native-mode", Boolean(value));
        this.#syncNativeChrome();
    }

    get nativeSurface(): NativeWindowChromeProbe["surface"] {
        return this.#lastNativeProbe?.surface ?? (this.nativeMode ? "fallback" : "off");
    }

    onInitialize() {
        super.onInitialize();
    }

    onRender() {
        super.onRender();
        this.#scheduleChromeWire();
    }

    connectedCallback(): void {
        super.connectedCallback?.();
        this.#scheduleChromeWire();
        this.#bindNativeChrome();
    }

    disconnectedCallback(): void {
        // WHY: elevateModel `appendChild` reparents — sync teardown + 8-frame rewire froze opens.
        scheduler?.yield?.()?.then?.(() => {
            if (this.isConnected) return;
            this.#nativeUnbind?.();
            this.#nativeUnbind = null;
            this.#attrObserver?.disconnect();
            this.#attrObserver = null;
            this.#controlsMo?.disconnect();
            this.#controlsMo = null;
            this.#controlsUnbind?.();
            this.#controlsUnbind = null;
            this.#controlsReady = false;
            this.#wireAttempts = 0;
            this.#focusUnbind?.();
            this.#focusUnbind = null;
            this.#dragUnbind?.();
            this.#dragUnbind = null;
            this.#resizeUnbind?.();
            this.#resizeUnbind = null;
            this.#footerSlotUnbind?.();
            this.#footerSlotUnbind = null;
            this.#lastThemeCover = null;
            super.disconnectedCallback?.();
        });
    }

    #scheduleChromeWire(): void {
        const run = (): void => {
            this.#wireControls();
            this.#wireFocus();
            if (!this.#dragUnbind) this.#wireDrag();
            if (!this.#resizeUnbind) this.#wireResize();
            this.#bindEmptyFooter();
            if (this.#controlsReady) return;
            if (this.#wireAttempts++ < 12) requestAnimationFrame(run);
        };
        scheduler?.yield?.()?.then?.(run);
    }

    /**
     * WHY: `<footer><slot name="footer"></slot></footer>` is never `:empty`, so unused
     * chrome painted a 2.25rem slab under Settings / Explorer.
     */
    #bindEmptyFooter(): void {
        if (this.#footerSlotUnbind) {
            this.#syncEmptyFooter();
            return;
        }
        const slot = this.shadowRoot?.querySelector?.('slot[name="footer"]');
        if (!(slot instanceof HTMLSlotElement)) return;
        const onChange = (): void => this.#syncEmptyFooter();
        slot.addEventListener("slotchange", onChange);
        this.#footerSlotUnbind = () => slot.removeEventListener("slotchange", onChange);
        this.#syncEmptyFooter();
    }

    #syncEmptyFooter(): void {
        const slot = this.shadowRoot?.querySelector?.('slot[name="footer"]');
        const footer = this.shadowRoot?.querySelector?.(".footer-handler");
        if (!(slot instanceof HTMLSlotElement) || !(footer instanceof HTMLElement)) return;
        const assigned = slot.assignedNodes({ flatten: true });
        const empty = !assigned.some((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) return true;
            return node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim());
        });
        footer.toggleAttribute("data-empty", empty);
        footer.hidden = empty;
    }

    #bindNativeChrome(): void {
        if (this.#nativeUnbind) return;
        this.#nativeUnbind = subscribeNativeWindowChrome({
            getRequested: () => this.nativeMode,
            onChange: (probe) => this.#applyNativeProbe(probe)
        });
        if (typeof MutationObserver !== "undefined" && !this.#attrObserver) {
            this.#attrObserver = new MutationObserver((records) => {
                let native = false;
                let maxIcon = false;
                for (const r of records) {
                    if (r.attributeName === "native-mode") native = true;
                    if (
                        r.attributeName === "maximized" ||
                        r.attributeName === "data-desk-max" ||
                        r.attributeName === "data-mobile-max"
                    ) {
                        maxIcon = true;
                    }
                }
                if (native || maxIcon) this.#syncNativeChrome();
                if (maxIcon) this.#syncMaximizeIcon();
            });
            this.#attrObserver.observe(this, {
                attributes: true,
                attributeFilter: ["native-mode", "maximized", "data-desk-max", "data-mobile-max"]
            });
        }
    }

    #syncNativeChrome(): void {
        this.#applyNativeProbe(probeNativeWindowChrome(this.nativeMode));
    }

    #applyNativeProbe(probe: NativeWindowChromeProbe): void {
        const covers =
            this.nativeMode ||
            this.hasAttribute("data-desk-max") ||
            this.hasAttribute("maximized") ||
            this.hasAttribute("data-mobile-max");
        if (
            this.#lastNativeProbe?.surface === probe.surface &&
            this.#lastThemeCover === covers &&
            this.#dragUnbind
        ) {
            this.#lastNativeProbe = probe;
            return;
        }

        this.#lastNativeProbe = probe;
        const host = this as HTMLElement;
        host.toggleAttribute("data-native-wco", probe.surface === "wco");
        host.toggleAttribute("data-native-standalone", probe.surface === "standalone");
        host.toggleAttribute("data-native-fallback", probe.surface === "fallback");
        host.toggleAttribute("data-native-active", probe.surface !== "off");

        this.#syncExitNativeButton(probe.surface);

        if (probe.titlebarRect) {
            host.style.setProperty("--ui-win-titlebar-area-x", `${probe.titlebarRect.x}px`);
            host.style.setProperty("--ui-win-titlebar-area-y", `${probe.titlebarRect.y}px`);
            host.style.setProperty("--ui-win-titlebar-area-width", `${probe.titlebarRect.width}px`);
            host.style.setProperty("--ui-win-titlebar-area-height", `${probe.titlebarRect.height}px`);
        } else {
            host.style.removeProperty("--ui-win-titlebar-area-x");
            host.style.removeProperty("--ui-win-titlebar-area-y");
            host.style.removeProperty("--ui-win-titlebar-area-width");
            host.style.removeProperty("--ui-win-titlebar-area-height");
        }

        // WHY: re-wire drag/resize so native active disables JS pointer drag.
        this.#dragUnbind?.();
        this.#dragUnbind = null;
        this.#resizeUnbind?.();
        this.#resizeUnbind = null;
        this.#wireDrag();
        this.#wireResize();
        this.#syncMaximizeIcon();

        /*
         * WHY: chrome-wire retries this ~20 rAFs. Re-sampling theme-color every frame
         * (canvas + DOM probes) froze the launcher on Settings/Explorer open (`Loading …`).
         */
        if (covers !== this.#lastThemeCover) {
            this.#lastThemeCover = covers;
            if (covers) {
                syncThemeColorFromNativeWindow(this);
            } else {
                restoreThemeColorAfterNativeWindow(this);
                syncAmbientThemeColor();
            }
        }

        this.dispatchEvent(
            new CustomEvent("window-native-change", {
                bubbles: true,
                composed: true,
                detail: probe
            })
        );
    }

    /** Standalone-only control; `hidden` must win over button `display: inline-flex`. */
    #syncExitNativeButton(surface = this.nativeSurface): void {
        const exitBtn = this.shadowRoot?.querySelector(".title-exit-native") as HTMLButtonElement | null;
        if (exitBtn) exitBtn.hidden = surface !== "standalone";
    }

    /**
     * INVARIANT: one glyph on maximize — corners-out (max) or corners-in (restore).
     * NOTE: native fallback stays corners-out (maximize = exit native, not restore-down).
     */
    #syncMaximizeIcon(): void {
        const btn = this.shadowRoot?.querySelector(".title-maximize") as HTMLButtonElement | null;
        const icon = btn?.querySelector("ui-icon") as HTMLElement | null;
        if (!btn || !icon) return;

        const fallbackNative = this.nativeMode && this.nativeSurface === "fallback";
        const restoredLook =
            !fallbackNative &&
            (this.hasAttribute("maximized") ||
                this.hasAttribute("data-desk-max") ||
                this.hasAttribute("data-mobile-max"));

        const name = restoredLook ? ICON_RESTORE : ICON_MAXIMIZE;
        const label = restoredLook ? "Restore" : "Maximize";
        if (icon.getAttribute("icon") !== name) icon.setAttribute("icon", name);
        btn.setAttribute("aria-label", label);
        btn.setAttribute("title", label);
    }

    /** Apply absolute bounds (managed shells / workspace layer). */
    applyBounds(bounds: Partial<UiWindowBounds> & { z?: number }): void {
        const el = this as HTMLElement;
        el.style.position = "absolute";
        if (typeof bounds.x === "number") el.style.left = `${bounds.x}px`;
        if (typeof bounds.y === "number") el.style.top = `${bounds.y}px`;
        if (typeof bounds.w === "number") {
            el.style.width = `${bounds.w}px`;
            el.style.setProperty("--ui-win-width", `${bounds.w}px`);
        }
        if (typeof bounds.h === "number") {
            el.style.height = `${bounds.h}px`;
            el.style.setProperty("--ui-win-height", `${bounds.h}px`);
        }
        if (typeof bounds.z === "number") el.style.zIndex = String(bounds.z);
        el.style.right = "";
        el.style.bottom = "";
        if (this.managed) {
            this.#ox.value = 0;
            this.#oy.value = 0;
            el.style.transform = "";
        }
    }

    setVisible(visible: boolean): void {
        this.toggleAttribute("hidden-window", !visible);
        (this as HTMLElement).style.visibility = visible ? "" : "hidden";
        (this as HTMLElement).style.pointerEvents = visible ? "" : "none";
    }

    get isMaximized(): boolean {
        // WHY: `data-native-active` is full-bleed chrome, not desk maximize — do not conflate.
        return (
            this.hasAttribute("maximized") ||
            this.hasAttribute("data-desk-max") ||
            this.hasAttribute("data-mobile-max")
        );
    }

    get isMinimized(): boolean {
        return this.hasAttribute("minimized");
    }

    /** True when CSS window-drag owns titlebar (WCO / installed standalone). */
    get usesNativeWindowDrag(): boolean {
        const s = this.nativeSurface;
        return s === "wco" || s === "standalone";
    }

    /**
     * Enter/exit native-mode. Managed hosts should listen for `window-native` /
     * `window-exit-native` instead of mutating attrs directly when preferred.
     */
    enterNativeMode(): void {
        if (this.managed) {
            this.#emitChrome("window-native");
            return;
        }
        this.nativeMode = true;
        this.#emitChrome("window-native");
    }

    exitNativeMode(): void {
        if (this.managed) {
            this.#emitChrome("window-exit-native");
            return;
        }
        this.nativeMode = false;
        this.#emitChrome("window-exit-native");
    }

    #emitChrome(name: string, cancelable = false): boolean {
        return this.dispatchEvent(
            new CustomEvent(name, { bubbles: true, composed: true, cancelable })
        );
    }

    /**
     * WHY (managed): only emit intent — environment-shell owns attrs via applyChrome.
     */
    toggleMaximize(): void {
        const restoring = this.isMaximized;
        if (this.managed) {
            this.#emitChrome(restoring ? "window-restore" : "window-maximize");
            return;
        }
        const next = !restoring;
        this.toggleAttribute("maximized", next);
        if (next) this.removeAttribute("minimized");
        this.#syncMaximizeIcon();
        this.#emitChrome(next ? "window-maximize" : "window-restore");
    }

    toggleMinimize(): void {
        if (this.managed) {
            this.#emitChrome(this.isMinimized ? "window-restore" : "window-minimize");
            return;
        }
        const next = !this.isMinimized;
        this.toggleAttribute("minimized", next);
        if (next) this.removeAttribute("maximized");
        this.#emitChrome(next ? "window-minimize" : "window-restore");
    }

    restoreWindow(): void {
        if (this.managed) {
            this.#emitChrome("window-restore");
            return;
        }
        const wasMin = this.isMinimized;
        const wasMax = this.isMaximized;
        this.removeAttribute("minimized");
        this.removeAttribute("maximized");
        if (wasMin || wasMax) this.#emitChrome("window-restore");
    }

    closeWindow(): void {
        // WHY: managed hosts preventDefault (= "I own map/task teardown") but must not leave
        // an orphan node — CWSP-shell previously hid via `visible=false` and never removed.
        this.#emitChrome("window-close", true);
        if (this.isConnected) this.remove();
    }

    #wireFocus(): void {
        if (this.#focusUnbind) return;
        this.#focusUnbind = addEvent(
            this,
            "pointerdown",
            () => {
                this.requestFocus();
            },
            { capture: true, passive: true }
        );
    }

    requestFocus(): void {
        this.dispatchEvent(new CustomEvent("window-focus", { bubbles: true, composed: true }));
    }

    bringToFront(z: number): void {
        const el = this as HTMLElement;
        if (Number.isFinite(z)) el.style.zIndex = String(z);
        el.toggleAttribute("data-focused", true);
    }

    clearFocused(): void {
        (this as HTMLElement).toggleAttribute("data-focused", false);
    }

    /** Resolve control hit from composedPath / data-ui-win-action (ui-icon retargeting). */
    #hitControl(ev: Event): "minimize" | "maximize" | "close" | "exit-native" | null {
        const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
        for (const n of path) {
            if (!(n instanceof Element)) continue;
            const action = n.getAttribute?.("data-ui-win-action");
            if (action === "close" || action === "exit-native" || action === "maximize" || action === "minimize") {
                return action;
            }
            if (n.matches?.(".title-close")) return "close";
            if (n.matches?.(".title-exit-native")) return "exit-native";
            if (n.matches?.(".title-maximize")) return "maximize";
            if (n.matches?.(".title-minimize")) return "minimize";
        }
        const t = ev.target;
        if (t instanceof Element) {
            const el =
                t.closest?.("[data-ui-win-action], .title-close, .title-exit-native, .title-maximize, .title-minimize") ??
                null;
            if (!el) return null;
            const action = el.getAttribute("data-ui-win-action");
            if (action === "close" || action === "exit-native" || action === "maximize" || action === "minimize") {
                return action;
            }
            if (el.classList.contains("title-close")) return "close";
            if (el.classList.contains("title-exit-native")) return "exit-native";
            if (el.classList.contains("title-maximize")) return "maximize";
            if (el.classList.contains("title-minimize")) return "minimize";
        }
        return null;
    }

    /** Debounce pointerup+click (and dual host/button listeners) within one gesture. */
    #consumeChromeAction(): boolean {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - this.#lastChromeActionAt < 280) return false;
        this.#lastChromeActionAt = now;
        return true;
    }

    #runChromeAction(which: "minimize" | "maximize" | "close" | "exit-native"): void {
        if (which === "close") this.closeWindow();
        else if (which === "exit-native") this.exitNativeMode();
        else if (which === "maximize") {
            // WHY: from native fallback, maximize toggles exit; floating desk-max via shell intent.
            if (this.nativeMode && this.nativeSurface === "fallback") this.exitNativeMode();
            else this.toggleMaximize();
        } else this.toggleMinimize();
    }

    #handleControlEvent(ev: Event): boolean {
        const which = this.#hitControl(ev);
        if (!which) return false;
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();
        if (!this.#consumeChromeAction()) return true;
        this.#runChromeAction(which);
        return true;
    }

    /**
     * WHY (radical): H/lure can replace shadow buttons and kill addEventListener bindings.
     * Assign `onclick` / `onpointerup` properties on the live nodes and re-stamp after every
     * shadow mutation. Delegation on shadowRoot + host remains as a safety net.
     */
    #bindControlButtonProps(): void {
        const root = this.shadowRoot;
        if (!root) return;
        const specs: Array<["minimize" | "maximize" | "close" | "exit-native", string]> = [
            ["minimize", ".title-minimize"],
            ["maximize", ".title-maximize"],
            ["close", ".title-close"],
            ["exit-native", ".title-exit-native"]
        ];
        for (const [which, sel] of specs) {
            const btn = root.querySelector(sel) as HTMLButtonElement | null;
            if (!btn) continue;
            btn.setAttribute("data-ui-win-action", which);
            const run = (ev: Event): void => {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation?.();
                if (!this.#consumeChromeAction()) return;
                this.#runChromeAction(which);
            };
            // Property handlers (not addEventListener) — reassigned whenever the node is new.
            btn.onclick = run;
            btn.onpointerup = (ev: PointerEvent) => {
                if (ev.button !== 0) return;
                // WHY: titlebar `touch-action: none` can suppress click synthesis on some engines.
                run(ev);
            };
        }
    }

    #wireControls(): void {
        const root = this.shadowRoot;
        if (!root) return;

        const fromTitle = this.titleHandler;
        const titleBar = (
            fromTitle instanceof HTMLElement
                ? fromTitle
                : (root.querySelector(".title-handler") as HTMLElement | null)
        );
        const buttons = root.querySelector(".title-handler-buttons") as HTMLElement | null;
        if (!titleBar || !buttons) return;

        // Always re-stamp button props (idempotent) — even after first wire, H may swap nodes.
        this.#bindControlButtonProps();

        if (this.#controlsReady) {
            this.#syncExitNativeButton();
            this.#syncMaximizeIcon();
            return;
        }

        const onDelegated = (ev: Event): void => {
            this.#handleControlEvent(ev);
        };
        const onDbl = (ev: MouseEvent): void => {
            if (this.#hitControl(ev)) return;
            const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
            const fromTitle = path.some(
                (n) => n instanceof Element && n.classList?.contains("title-handler")
            );
            if (!fromTitle) return;
            const t = ev.target as HTMLElement | null;
            if (t?.closest?.("button, a, input, textarea, select, [data-no-drag]")) return;
            ev.preventDefault();
            if (!this.#consumeChromeAction()) return;
            this.toggleMaximize();
        };

        // Shadow capture first (path includes live buttons), then host capture (composed).
        const offShadowClick = addEvent(root, "click", onDelegated, { capture: true });
        const offShadowPtr = addEvent(root, "pointerup", onDelegated, { capture: true });
        const offHostClick = addEvent(this, "click", onDelegated, { capture: true });
        const offHostPtr = addEvent(this, "pointerup", onDelegated, { capture: true });
        const offHostDbl = addEvent(this, "dblclick", onDbl, { capture: true });

        if (typeof MutationObserver !== "undefined" && !this.#controlsMo) {
            this.#controlsMo = new MutationObserver(() => {
                // Re-bind after lure/H replaces title chrome nodes.
                this.#bindControlButtonProps();
                this.#syncExitNativeButton();
                this.#syncMaximizeIcon();
            });
            this.#controlsMo.observe(buttons, { childList: true, subtree: true });
        }

        this.#controlsUnbind = () => {
            offShadowClick?.();
            offShadowPtr?.();
            offHostClick?.();
            offHostPtr?.();
            offHostDbl?.();
            this.#controlsMo?.disconnect();
            this.#controlsMo = null;
            this.#controlsUnbind = null;
            this.#controlsReady = false;
        };
        this.#controlsReady = true;
        this.#syncExitNativeButton();
        this.#syncMaximizeIcon();
    }

    #wireDrag(): void {
        const root = this.shadowRoot ?? this;
        // WHY: unresolved Q() proxy is truthy and blocked `shadowRoot.querySelector` fallback —
        // pointerdown bound to the wrong target → drag/resize looked dead.
        const fromProp = this.titleHandler;
        const bar = (
            fromProp instanceof HTMLElement
                ? fromProp
                : (root.querySelector?.(".title-handler") as HTMLElement | null)
        );
        if (!bar || this.#dragUnbind) return;

        // WHY: WCO / standalone — CSS `window-drag` moves the OS window; skip JS drag.
        // NOTE: clearable unbind so a later probe can re-wire JS drag for floating managed windows.
        if (this.usesNativeWindowDrag) {
            this.#dragUnbind = () => {
                this.#dragUnbind = null;
            };
            return;
        }

        if (!this.managed) {
            bindStyle(this, S`transform: translate(${this.#ox}px, ${this.#oy}px)`);
        }

        /*
         * WHY: Immediate `preventDefault` + `setPointerCapture` on pointerdown cancels browser
         * dblclick synthesis. Un-maximize worked (drag skipped while maximized); maximize via
         * titlebar dblclick did not. Arm drag only after a small move threshold.
         */
        const DRAG_THRESHOLD_PX = 4;
        const pointerMap = new Map<
            number,
            {
                sx: number;
                sy: number;
                ox: number;
                oy: number;
                bx: number;
                by: number;
                dragging: boolean;
            }
        >();

        const offDown = addEvent(bar, "pointerdown", (ev: PointerEvent) => {
            if (ev.button !== 0) return;
            // WHY: never start drag from chrome controls (incl. ui-icon inside button).
            if (this.#hitControl(ev)) return;
            const t = ev.target as HTMLElement | null;
            if (t?.closest("button, a, input, textarea, select, [data-no-drag]")) return;
            if (this.isMaximized || this.isMinimized || this.nativeMode) return;

            this.requestFocus();
            const host = this as HTMLElement;
            pointerMap.set(ev.pointerId, {
                sx: ev.clientX,
                sy: ev.clientY,
                ox: this.#ox.value,
                oy: this.#oy.value,
                bx: Number.parseFloat(host.style.left || "0") || 0,
                by: Number.parseFloat(host.style.top || "0") || 0,
                dragging: false
            });

            const offMove = addEvent(document.body, "pointermove", (ev: PointerEvent) => {
                const p = pointerMap.get(ev.pointerId);
                if (!p) return;
                const dx = ev.clientX - p.sx;
                const dy = ev.clientY - p.sy;
                if (!p.dragging) {
                    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                    p.dragging = true;
                    // INVARIANT: only suppress default / capture once drag is real — keeps dblclick.
                    try {
                        ev.preventDefault();
                    } catch {
                        /* ignore */
                    }
                    this.setPointerCapture?.(ev.pointerId);
                }
                if (this.managed) {
                    this.dispatchEvent(
                        new CustomEvent("window-move", {
                            bubbles: true,
                            composed: true,
                            detail: { x: p.bx + dx, y: p.by + dy, dx, dy }
                        })
                    );
                    return;
                }
                this.#ox.value = p.ox + dx;
                this.#oy.value = p.oy + dy;
            });

            const end = (ev: PointerEvent) => {
                if (!pointerMap.has(ev.pointerId)) return;
                const p = pointerMap.get(ev.pointerId);
                pointerMap.delete(ev.pointerId);
                if (p?.dragging) {
                    try {
                        this.releasePointerCapture?.(ev.pointerId);
                    } catch {
                        /* already released */
                    }
                }
                offMove?.();
                offUp?.();
                offCancel?.();
            };

            const offUp = addEvent(document.body, "pointerup", end);
            const offCancel = addEvent(document.body, "pointercancel", end);
        });

        this.#dragUnbind = () => {
            offDown?.();
        };
    }

    #wireResize(): void {
        const root = this.shadowRoot ?? this;
        const fromProp = this.resizer;
        const grip = (
            fromProp instanceof HTMLElement
                ? fromProp
                : (root.querySelector?.(".window-resizer") as HTMLElement | null)
        );
        if (!grip || this.#resizeUnbind) return;

        const pointerMap = new Map<number, { sx: number; sy: number; w: number; h: number }>();

        const offDown = addEvent(grip, "pointerdown", (ev: PointerEvent) => {
            if (ev.button !== 0) return;
            if (this.isMaximized || this.isMinimized || this.nativeMode) return;
            ev.preventDefault();
            ev.stopPropagation();
            this.requestFocus();
            this.setPointerCapture?.(ev.pointerId);
            const rect = (this as HTMLElement).getBoundingClientRect();
            pointerMap.set(ev.pointerId, {
                sx: ev.clientX,
                sy: ev.clientY,
                w: rect.width,
                h: rect.height
            });

            const offMove = addEvent(document.body, "pointermove", (ev: PointerEvent) => {
                const p = pointerMap.get(ev.pointerId);
                if (!p) return;
                const w = Math.max(DRAG_MIN.w, p.w + (ev.clientX - p.sx));
                const h = Math.max(DRAG_MIN.h, p.h + (ev.clientY - p.sy));
                if (this.managed) {
                    this.dispatchEvent(
                        new CustomEvent("window-resize", {
                            bubbles: true,
                            composed: true,
                            detail: { w, h }
                        })
                    );
                    return;
                }
                (this as HTMLElement).style.width = `${w}px`;
                (this as HTMLElement).style.height = `${h}px`;
                (this as HTMLElement).style.setProperty("--ui-win-width", `${w}px`);
                (this as HTMLElement).style.setProperty("--ui-win-height", `${h}px`);
            });

            const end = (ev: PointerEvent) => {
                if (!pointerMap.has(ev.pointerId)) return;
                pointerMap.delete(ev.pointerId);
                try {
                    this.releasePointerCapture?.(ev.pointerId);
                } catch {
                    /* already released */
                }
                offMove?.();
                offUp?.();
                offCancel?.();
            };

            const offUp = addEvent(document.body, "pointerup", end);
            const offCancel = addEvent(document.body, "pointercancel", end);
        });

        this.#resizeUnbind = () => {
            offDown?.();
        };
    }
}

export default Windows2;
