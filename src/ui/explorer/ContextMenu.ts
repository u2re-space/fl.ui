/*
 * Filename: ContextMenu.ts
 * FullPath: modules/projects/fl.ui/src/ui/explorer/ContextMenu.ts
 * FIND:bookmarks
 * Change date and time: 11.10.00_30.08.2026
 * Reason for changes: Share + clipboard copy actions on file / folder / bookmark rows.
 */

import { MOCElement } from "@fest-lib/dom";
import {
    placeOverlay,
    registerTransientOverlay,
    resolveOverlayHost,
    type OverlayPlacementStrategy,
    type PlacementHandle,
} from "@fest-lib/lure";
import type { FileEntryItem } from "./Operative";
import { canReceiveIncomingPath, isBookmarksPath } from "./Operative";
import { isImageLikeEntry, isTextLikeEntry } from "./share-copy";
import { entryKey, entryKind } from "./utils";


type ContextMenuEntry = {
    id: string;
    label: string;
    icon?: string;
    disabled?: boolean;
    danger?: boolean;
    children?: ContextMenuEntry[];
    action: () => void | Promise<void>;
};

type ContextMenuOpenRequest = {
    x: number;
    y: number;
    items: ContextMenuEntry[];
    compact?: boolean;
    anchor?: Element | null;
    placementStrategy?: OverlayPlacementStrategy;
};

const SUBMENU_HOVER_OPEN_MS = 320;
const SUBMENU_HOVER_CLOSE_MS = 220;
const CONTEXT_MENU_LAYER_Z_FALLBACK = "2147483640";
const IMPORTANT_CSS = "important";

let styleMounted = false;
let menuSession = 0;
let menuLayer: HTMLElement | null = null;
let rootMenu: HTMLElement | null = null;
let rootMenuPlacement: PlacementHandle | null = null;
let rootMenuOverlayUnregister: (() => void) | null = null;
let cleanupFns: Array<() => void> = [];

const submenuByDepth = new Map<number, HTMLElement>();
const submenuAnchorByDepth = new Map<number, HTMLButtonElement>();
const submenuPlacementByDepth = new Map<number, PlacementHandle>();
const submenuOpenTimers = new Map<number, ReturnType<typeof setTimeout>>();
const submenuCloseTimers = new Map<number, ReturnType<typeof setTimeout>>();

const SUBMENU_FALLBACKS: Parameters<typeof placeOverlay>[1]["fallbacks"] = [
    "left-start",
    "right-end",
    "left-end",
    "bottom-start",
    "top-start",
];

/**
 * WHY: Chromium CSS Anchor (`strategy: auto`) only flips — it does not keep the
 * submenu inside the visual viewport. Force the JS solver + a post-layout
 * measure so the first paint (icons/fonts) cannot leave a 0×0 clamp.
 */
const placeMenuOverlay = (
    menu: HTMLElement,
    options: Parameters<typeof placeOverlay>[1],
): PlacementHandle => {
    const handle = placeOverlay(menu, { ...options, strategy: "js" });
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
            handle.update?.();
        });
    }
    return handle;
};

/**
 * WHY: Before Settings opens, `html[data-theme]` may lag OS prefers-color-scheme.
 * Stamp the same pin QS/Theme uses so light panels never keep dark-default white ink.
 */
const resolveContextMenuTheme = (): "light" | "dark" => {
    const root = document.documentElement;
    const pinned = String(root.getAttribute("data-theme") || "").trim().toLowerCase();
    if (pinned === "light" || pinned === "dark") return pinned;
    const scheme = String(root.getAttribute("data-scheme") || "").trim().toLowerCase();
    if (scheme === "light" || scheme === "dark") return scheme;
    try {
        const stored = String(localStorage.getItem("rs-appearance-theme") || "").trim().toLowerCase();
        if (stored === "light" || stored === "dark") return stored;
    } catch {
        /* private mode */
    }
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
};

/**
 * WHY: Explorer menus can be mounted beside host-shell controls that apply
 * broad `button`, `ul`, and `ui-icon` rules. Inline geometry stays important;
 * INVARIANT: do not stamp slate/hex background/color — wallpaper `--base-color` must tint the panel.
 */
const stampContextMenuPanel = (menu: HTMLElement, compact: boolean): void => {
    menu.style.setProperty("position", "fixed", IMPORTANT_CSS);
    menu.style.setProperty("box-sizing", "border-box", IMPORTANT_CSS);
    menu.style.setProperty("min-width", compact ? "188px" : "220px", IMPORTANT_CSS);
    menu.style.setProperty("max-width", "min(320px, calc(100vw - 24px))", IMPORTANT_CSS);
    menu.style.setProperty("padding", compact ? "0.3rem" : "0.4rem", IMPORTANT_CSS);
    menu.style.setProperty("border-radius", "14px", IMPORTANT_CSS);
    menu.style.setProperty("pointer-events", "auto", IMPORTANT_CSS);
    /*
     * WHY: inline `backdrop-filter: none !important` would override the stylesheet `blur(10px) !important`
     * (inline !important beats stylesheet !important). Mirror explorer-view: stamp the glass blur inline
     * so the speed-dial context menu shows the same backdrop blur as the explorer unified menu.
     */
    menu.style.setProperty("backdrop-filter", "blur(10px)", IMPORTANT_CSS);
    menu.style.setProperty("-webkit-backdrop-filter", "blur(10px)", IMPORTANT_CSS);
    menu.style.removeProperty("border");
    menu.style.removeProperty("background");
    menu.style.removeProperty("color");
    menu.style.removeProperty("box-shadow");
    const theme = resolveContextMenuTheme();
    menu.dataset.theme = theme;
    menu.style.setProperty("color-scheme", theme === "light" ? "light only" : "dark only", IMPORTANT_CSS);
};

const stampContextMenuList = (list: HTMLUListElement): void => {
    list.style.setProperty("list-style", "none", IMPORTANT_CSS);
    list.style.setProperty("list-style-type", "none", IMPORTANT_CSS);
    list.style.setProperty("margin", "0", IMPORTANT_CSS);
    list.style.setProperty("padding", "0", IMPORTANT_CSS);
    list.style.setProperty("display", "flex", IMPORTANT_CSS);
    list.style.setProperty("flex-direction", "column", IMPORTANT_CSS);
    list.style.setProperty("align-items", "stretch", IMPORTANT_CSS);
    list.style.setProperty("gap", "0.2rem", IMPORTANT_CSS);
    list.style.setProperty("width", "100%", IMPORTANT_CSS);
    list.style.setProperty("box-sizing", "border-box", IMPORTANT_CSS);
};

const stampContextMenuItem = (button: HTMLButtonElement, danger: boolean): void => {
    button.style.setProperty("appearance", "none", IMPORTANT_CSS);
    button.style.setProperty("-webkit-appearance", "none", IMPORTANT_CSS);
    button.style.setProperty("box-sizing", "border-box", IMPORTANT_CSS);
    button.style.setProperty("width", "100%", IMPORTANT_CSS);
    button.style.setProperty("max-width", "100%", IMPORTANT_CSS);
    button.style.setProperty("margin", "0", IMPORTANT_CSS);
    button.style.setProperty("display", "grid", IMPORTANT_CSS);
    button.style.setProperty("grid-template-columns", "1.375rem minmax(0, 1fr) auto", IMPORTANT_CSS);
    button.style.setProperty("align-items", "center", IMPORTANT_CSS);
    button.style.setProperty("justify-items", "start", IMPORTANT_CSS);
    button.style.setProperty("gap", "0.55rem", IMPORTANT_CSS);
    button.style.setProperty("border", "none", IMPORTANT_CSS);
    button.style.setProperty("border-radius", "10px", IMPORTANT_CSS);
    button.style.setProperty("padding", "0.5rem 0.6rem", IMPORTANT_CSS);
    button.style.setProperty("min-height", "2.35rem", IMPORTANT_CSS);
    button.style.setProperty("font", "inherit", IMPORTANT_CSS);
    button.style.setProperty("font-size", "0.8125rem", IMPORTANT_CSS);
    button.style.setProperty("line-height", "1.25", IMPORTANT_CSS);
    button.style.setProperty("text-align", "start", IMPORTANT_CSS);
    button.style.setProperty("cursor", "pointer", IMPORTANT_CSS);
    /* WHY: leave background to stylesheet hover tint from wallpaper primary. */
    button.style.removeProperty("background");
    button.style.removeProperty("background-color");
    if (!danger) {
        button.style.setProperty("color", "inherit", IMPORTANT_CSS);
    } else {
        const dangerInk = resolveContextMenuTheme() === "light" ? "#9f1239" : "#fecaca";
        button.style.setProperty("color", dangerInk, IMPORTANT_CSS);
        button.style.setProperty("--cw-menu-fg", dangerInk, IMPORTANT_CSS);
    }
};

const ensureStyle = (): void => {
    /*
     * WHY: Always refresh textContent — HMR / early opens must not keep a stale slate sheet
     * while `styleMounted` already flipped true in a prior module instance.
     */
    let style = document.getElementById("cw-unified-context-menu-style") as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = "cw-unified-context-menu-style";
        document.head.appendChild(style);
    }
    styleMounted = true;
    style.textContent = `
        .cw-context-menu-layer {
            position: fixed;
            inset: 0;
            z-index: var(--cw-context-menu-layer-z, ${CONTEXT_MENU_LAYER_Z_FALLBACK});
            pointer-events: none;
        }

        .cw-context-menu {
            /* WHY: Menu often mounts outside .wf-demo-root — use :root wallpaper seeds. */
            --cw-menu-seed: var(--base-color, var(--color-primary, #5a7fff));
            --cw-menu-fg: --u2-color-mod(var(--cw-menu-seed), 100);
            --cw-menu-bg: --u2-color-mod(var(--cw-menu-seed), 880);
            --cw-menu-border: color-mix(in oklab, --u2-color-mod(var(--cw-menu-seed), 100) 14%, transparent);
            position: fixed;
            box-sizing: border-box;
            min-width: 220px;
            max-width: min(320px, calc(100vw - 24px));
            padding: 0.4rem;
            border-radius: 14px;
            color-scheme: dark;
            font-family: var(--cw-context-menu-font, ui-sans-serif, system-ui, sans-serif);
            border: 1px solid var(--cw-menu-border);
            background: color-mix(in oklab, var(--color-surface-container, var(--cw-menu-bg)) 94%, transparent);
            color: var(--cw-menu-fg);
            /*
             * WHY: !important — unlayered button rules / token-fallback sheets shipped by some hosts
             * override the panel shadow otherwise; mirror the explorer-view unified menu so the
             * speed-dial context menu keeps visible elevation + glass blur.
             */
            box-shadow:
                var(--elev-3, 0 14px 36px rgba(0, 0, 0, 0.45)),
                0 0 0 1px color-mix(in oklab, --u2-color-mod(var(--cw-menu-seed), 100) 8%, transparent) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
            pointer-events: auto;
            user-select: none;
            /* WHY: nested Actions/Open-in menus are taller than the remaining
             * viewport; CSS Anchor flip does not clamp, so the panel must scroll. */
            max-height: min(80dvh, calc(100vh - 16px));
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
        }

        html[data-theme="light"] .cw-context-menu,
        .cw-context-menu[data-theme="light"] {
            color-scheme: light only;
            --cw-menu-fg: --u2-color-mod(var(--cw-menu-seed), 900);
            --cw-menu-bg: --u2-color-mod(var(--cw-menu-seed), 160);
            --cw-menu-border: color-mix(in oklab, --u2-color-mod(var(--cw-menu-seed), 900) 14%, transparent);
            border-color: var(--cw-menu-border);
            background: color-mix(in oklab, var(--color-surface-container, var(--cw-menu-bg)) 96%, transparent);
            color: var(--cw-menu-fg);
            box-shadow: var(--elev-2, 0 10px 28px rgba(15, 23, 42, 0.16)) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
        }

        html[data-theme="dark"] .cw-context-menu,
        .cw-context-menu[data-theme="dark"] {
            color-scheme: dark only;
            --cw-menu-fg: --u2-color-mod(var(--cw-menu-seed), 100);
            --cw-menu-bg: --u2-color-mod(var(--cw-menu-seed), 880);
            --cw-menu-border: color-mix(in oklab, --u2-color-mod(var(--cw-menu-seed), 100) 14%, transparent);
            border-color: var(--cw-menu-border);
            background: color-mix(in oklab, var(--color-surface-container, var(--cw-menu-bg)) 94%, transparent);
            color: var(--cw-menu-fg);
            box-shadow: var(--elev-3, 0 14px 36px rgba(0, 0, 0, 0.45)) !important;
            backdrop-filter: blur(10px) !important;
            -webkit-backdrop-filter: blur(10px) !important;
        }

        @media (prefers-color-scheme: light) {
            html:not([data-theme="dark"]) .cw-context-menu:not([data-theme="dark"]) {
                color-scheme: light only;
                --cw-menu-fg: --u2-color-mod(var(--cw-menu-seed), 900);
                --cw-menu-bg: --u2-color-mod(var(--cw-menu-seed), 160);
                --cw-menu-border: color-mix(in oklab, --u2-color-mod(var(--cw-menu-seed), 900) 14%, transparent);
                border-color: var(--cw-menu-border);
                background: color-mix(in oklab, var(--color-surface-container, var(--cw-menu-bg)) 96%, transparent);
                color: var(--cw-menu-fg);
                box-shadow: var(--elev-2, 0 10px 28px rgba(15, 23, 42, 0.16)) !important;
                backdrop-filter: blur(10px) !important;
                -webkit-backdrop-filter: blur(10px) !important;
            }
        }

        .cw-context-menu.cw-context-menu--compact {
            min-width: 188px;
            padding: 0.3rem;
        }

        .cw-context-menu__list {
            list-style: none !important;
            list-style-type: none !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.2rem;
            width: 100%;
            box-sizing: border-box;
            text-align: left;
        }

        .cw-context-menu__list > li {
            list-style: none !important;
            list-style-type: none !important;
            display: block !important;
            width: 100%;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box;
        }

        button.cw-context-menu__item,
        .cw-context-menu button.cw-context-menu__item {
            appearance: none !important;
            -webkit-appearance: none !important;
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            display: grid !important;
            grid-template-columns: 1.375rem minmax(0, 1fr) auto !important;
            align-items: center !important;
            justify-items: start !important;
            gap: 0.55rem !important;
            border: none !important;
            border-radius: 10px !important;
            padding: 0.5rem 0.6rem !important;
            min-height: 2.35rem !important;
            font: inherit !important;
            font-size: 0.8125rem !important;
            line-height: 1.25 !important;
            text-align: start !important;
            cursor: pointer !important;
            background: transparent !important;
            color: inherit !important;
            box-shadow: none !important;
        }

        .cw-context-menu__item > * {
            pointer-events: none;
        }

        button.cw-context-menu__item:hover,
        .cw-context-menu button.cw-context-menu__item:hover,
        button.cw-context-menu__item:focus-visible,
        .cw-context-menu button.cw-context-menu__item:focus-visible {
            outline: none !important;
            background: color-mix(in oklab, var(--color-primary, --u2-color-mod(var(--cw-menu-seed), 550)) 16%, transparent) !important;
        }

        .cw-context-menu__item[disabled] {
            opacity: 0.45;
            cursor: default;
        }

        .cw-context-menu__item--danger {
            color: #fecaca !important;
        }

        html[data-theme="light"] .cw-context-menu__item--danger,
        .cw-context-menu[data-theme="light"] .cw-context-menu__item--danger {
            color: #9f1239 !important;
        }

        .cw-context-menu__icon {
            justify-self: center;
            inline-size: 1.375rem;
            block-size: 1.375rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: var(--cw-menu-fg, inherit);
        }

        .cw-context-menu__icon ui-icon {
            --icon-size: 1.125rem;
            --icon-color: var(--cw-menu-fg, currentColor);
            inline-size: 1.125rem !important;
            block-size: 1.125rem !important;
            min-inline-size: 1.125rem !important;
            min-block-size: 1.125rem !important;
            --icon-padding: 0px !important;
            color: var(--cw-menu-fg, inherit) !important;
            pointer-events: none;
        }

        .cw-context-menu__label {
            justify-self: stretch;
            text-align: start !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-inline-size: 0;
            color: var(--cw-menu-fg, inherit);
        }

        .cw-context-menu__chevron {
            justify-self: end;
            opacity: 0.72;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: var(--cw-menu-fg, inherit);
        }

        .cw-context-menu__chevron ui-icon {
            --icon-size: 0.85rem;
            --icon-color: var(--cw-menu-fg, currentColor);
            pointer-events: none;
        }
    `;
};

const clearCleanup = (): void => {
    for (const fn of cleanupFns) {
        try {
            fn();
        } catch {
            // ignore
        }
    }
    cleanupFns = [];
};

const clearTimersFromDepth = (depth: number): void => {
    for (const [key, timer] of Array.from(submenuOpenTimers.entries())) {
        if (key >= depth) {
            clearTimeout(timer);
            submenuOpenTimers.delete(key);
        }
    }
    for (const [key, timer] of Array.from(submenuCloseTimers.entries())) {
        if (key >= depth) {
            clearTimeout(timer);
            submenuCloseTimers.delete(key);
        }
    }
};

const closeSubmenusFromDepth = (depth: number): void => {
    clearTimersFromDepth(depth);
    for (const [key, submenu] of Array.from(submenuByDepth.entries())) {
        if (key >= depth) {
            submenuPlacementByDepth.get(key)?.dispose();
            submenuPlacementByDepth.delete(key);
            submenu.remove();
            submenuByDepth.delete(key);
            submenuAnchorByDepth.delete(key);
        }
    }
};

const cancelScheduledCloseFromDepth = (depth: number): void => {
    for (const [key, timer] of Array.from(submenuCloseTimers.entries())) {
        if (key >= depth) {
            clearTimeout(timer);
            submenuCloseTimers.delete(key);
        }
    }
};

const buildMenuElement = (
    entries: ContextMenuEntry[],
    compact: boolean,
    depth: number,
    session: number,
    placementStrategy: OverlayPlacementStrategy,
): HTMLElement => {
    const menu = document.createElement("div");
    menu.className = `cw-context-menu${compact ? " cw-context-menu--compact" : ""}`;
    menu.setAttribute("role", "menu");
    menu.dataset.menuDepth = String(depth);
    menu.style.zIndex = String(depth + 1);

    const list = document.createElement("ul");
    list.className = "cw-context-menu__list";
    stampContextMenuList(list);
    menu.appendChild(list);

    const openSubmenu = (item: ContextMenuEntry, anchorButton: HTMLButtonElement, nextDepth: number): void => {
        if (session !== menuSession || !rootMenu?.isConnected || !menuLayer?.isConnected) return;
        closeSubmenusFromDepth(nextDepth);
        if (!item.children?.length) return;

        const submenu = buildMenuElement(item.children, compact, nextDepth, session, placementStrategy);
        submenu.classList.add("cw-context-menu--submenu");
        menuLayer.appendChild(submenu);
        submenuByDepth.set(nextDepth, submenu);
        submenuAnchorByDepth.set(nextDepth, anchorButton);
        submenuPlacementByDepth.set(nextDepth, placeMenuOverlay(submenu, {
            origin: { type: "element", element: anchorButton },
            placement: "right-start",
            fallbacks: SUBMENU_FALLBACKS,
            strategy: "js",
        }));
    };

    const scheduleOpenSubmenu = (item: ContextMenuEntry, anchorButton: HTMLButtonElement, nextDepth: number): void => {
        const existingOpen = submenuOpenTimers.get(nextDepth);
        if (existingOpen) clearTimeout(existingOpen);
        cancelScheduledCloseFromDepth(nextDepth);
        const timer = setTimeout(() => {
            submenuOpenTimers.delete(nextDepth);
            openSubmenu(item, anchorButton, nextDepth);
        }, SUBMENU_HOVER_OPEN_MS);
        submenuOpenTimers.set(nextDepth, timer);
    };

    const scheduleCloseSubmenuFromDepth = (nextDepth: number): void => {
        const existingClose = submenuCloseTimers.get(nextDepth);
        if (existingClose) clearTimeout(existingClose);
        const timer = setTimeout(() => {
            submenuCloseTimers.delete(nextDepth);
            closeSubmenusFromDepth(nextDepth);
        }, SUBMENU_HOVER_CLOSE_MS);
        submenuCloseTimers.set(nextDepth, timer);
    };

    for (const item of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `cw-context-menu__item${item.danger ? " cw-context-menu__item--danger" : ""}`;
        button.setAttribute("role", "menuitem");
        button.disabled = Boolean(item.disabled);
        stampContextMenuItem(button, Boolean(item.danger));

        const hasChildren = Boolean(item.children?.length);
        button.innerHTML = `
            <span class="cw-context-menu__icon">${item.icon ? `<ui-icon icon="${item.icon}"></ui-icon>` : ""}</span>
            <span class="cw-context-menu__label">${item.label}</span>
            <span class="cw-context-menu__chevron">${hasChildren ? `<ui-icon icon="caret-right"></ui-icon>` : ""}</span>
        `;

        if (hasChildren) {
            const nextDepth = depth + 1;
            button.setAttribute("aria-haspopup", "menu");
            button.addEventListener("pointerenter", () => scheduleOpenSubmenu(item, button, nextDepth));
            button.addEventListener("pointerleave", () => scheduleCloseSubmenuFromDepth(nextDepth));
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (session !== menuSession || !rootMenu?.isConnected) return;
                cancelScheduledCloseFromDepth(nextDepth);
                const existing = submenuByDepth.get(nextDepth);
                const activeAnchor = submenuAnchorByDepth.get(nextDepth);
                if (existing?.isConnected && activeAnchor === button) {
                    closeSubmenusFromDepth(nextDepth);
                    return;
                }
                openSubmenu(item, button, nextDepth);
            });
        } else {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (session !== menuSession || !rootMenu?.isConnected) return;
                closeUnifiedContextMenu();
                if (item.disabled) return;
                await item.action();
            });
        }

        const li = document.createElement("li");
        li.appendChild(button);
        list.appendChild(li);
    }

    stampContextMenuPanel(menu, compact);
    menu.addEventListener("pointerenter", () => cancelScheduledCloseFromDepth(depth));
    menu.addEventListener("pointerleave", () => {
        if (depth > 0) {
            const existingClose = submenuCloseTimers.get(depth);
            if (existingClose) clearTimeout(existingClose);
            const timer = setTimeout(() => {
                submenuCloseTimers.delete(depth);
                closeSubmenusFromDepth(depth);
            }, SUBMENU_HOVER_CLOSE_MS);
            submenuCloseTimers.set(depth, timer);
        }
    });

    return menu;
};

export const closeUnifiedContextMenu = (): void => {
    clearCleanup();
    clearTimersFromDepth(0);
    rootMenuOverlayUnregister?.();
    rootMenuOverlayUnregister = null;
    rootMenuPlacement?.dispose();
    rootMenuPlacement = null;
    closeSubmenusFromDepth(1);
    submenuByDepth.clear();
    submenuAnchorByDepth.clear();
    submenuPlacementByDepth.clear();
    rootMenu?.remove();
    rootMenu = null;
    menuLayer?.remove();
    menuLayer = null;
    menuSession += 1;
};

export const openUnifiedContextMenu = (request: ContextMenuOpenRequest): void => {
    const entries = (request.items || []).filter((item) => item && item.id && item.label);
    if (!entries.length) {
        closeUnifiedContextMenu();
        return;
    }

    ensureStyle();
    closeUnifiedContextMenu();
    const session = menuSession;

    const overlayHost = resolveOverlayHost() ?? document.body;

    const layer = document.createElement("div");
    layer.className = "cw-context-menu-layer";
    menuLayer = layer;
    overlayHost.appendChild(layer);

    const submenuPlacementStrategy = request.placementStrategy ?? "auto";
    const menu = buildMenuElement(entries, Boolean(request.compact), 0, session, submenuPlacementStrategy);
    rootMenu = menu;
    layer.appendChild(menu);
    rootMenuPlacement = placeMenuOverlay(menu, {
        origin: { type: "point", x: request.x, y: request.y },
        placement: "bottom-start",
        gap: 0,
        strategy: "js",
    });
    rootMenuOverlayUnregister = registerTransientOverlay({
        id: `context-menu-${session}`,
        kind: "context-menu",
        element: layer,
        isActive: () => menuSession === session && menuLayer === layer && layer.isConnected,
        close: () => {
            closeUnifiedContextMenu();
            return true;
        },
    });

    const onPointerDown = (event: Event) => {
        if (session !== menuSession || !menuLayer?.isConnected) return;
        const target = event.target as Node | null;
        if (target && menuLayer.contains(target)) return;
        closeUnifiedContextMenu();
    };

    const onMenuInternalClick = (event: Event) => {
        if (session !== menuSession || !rootMenu?.isConnected) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const parentItem = target.closest?.(".cw-context-menu__item") as HTMLElement | null;
        if (!parentItem) {
            closeSubmenusFromDepth(1);
            return;
        }
        const hasChildren = parentItem.getAttribute("aria-haspopup") === "menu";
        if (!hasChildren) {
            closeSubmenusFromDepth(1);
        }
    };

    const onEscape = (event: KeyboardEvent) => {
        if (session !== menuSession) return;
        if (event.key === "Escape") closeUnifiedContextMenu();
    };

    const close = () => closeUnifiedContextMenu();

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("contextmenu", onPointerDown, { capture: true });
    document.addEventListener("keydown", onEscape);
    menu.addEventListener("click", onMenuInternalClick, { capture: true });
    window.addEventListener("resize", close, { passive: true });
    window.addEventListener("blur", close, { passive: true });

    cleanupFns.push(() => document.removeEventListener("pointerdown", onPointerDown, { capture: true } as EventListenerOptions));
    cleanupFns.push(() => document.removeEventListener("contextmenu", onPointerDown, { capture: true } as EventListenerOptions));
    cleanupFns.push(() => document.removeEventListener("keydown", onEscape));
    cleanupFns.push(() => menu.removeEventListener("click", onMenuInternalClick, { capture: true } as EventListenerOptions));
    cleanupFns.push(() => window.removeEventListener("resize", close));
    cleanupFns.push(() => window.removeEventListener("blur", close));
};

export type { ContextMenuEntry, ContextMenuOpenRequest };

//
const hideInAppViewerActions = (): boolean => {
    try {
        const root = document.documentElement;
        return root?.dataset?.cwspSku === "explorer" && root?.dataset?.cwspNativeShell === "capacitor";
    } catch {
        return false;
    }
};

const makeFileActionOps = () => {
    return [
        { id: "open", label: "Open", icon: "function" },
        ...(!hideInAppViewerActions()
            ? [
                  { id: "view", label: "View", icon: "eye" },
                  { id: "view-base", label: "View (Base tab)", icon: "arrow-square-out" }
              ]
            : []),
        { id: "share", label: "Share…", icon: "share-network" },
        { id: "share-document", label: "Share to Document", icon: "file-text" },
        { id: "share-transfer", label: "Share to Transfer", icon: "paper-plane-tilt" },
        { id: "share-process", label: "Share to Process", icon: "lightning" },
        { id: "send-transfer", label: "Send to CWSP Transfer", icon: "paper-plane-tilt" },
        { id: "attach-workcenter", label: "Attach to Work Center", icon: "lightning" },
        { id: "attach-workcenter-queued", label: "Queue attach (pending)", icon: "clock-counter-clockwise" },
        { id: "attach-workcenter-headless", label: "Queue attach (headless)", icon: "wave-sine" },
        { id: "pin-home", label: "Pin to Home Screen", icon: "push-pin-simple" },
        { id: "download", label: "Download", icon: "download" }
    ];
};

//
const makeFileSystemOps = () => {
    return [
        { id: "delete", label: "Delete", icon: "trash" },
        { id: "rename", label: "Rename", icon: "pencil" },
        { id: "copy-base64", label: "Copy as Base64 URL", icon: "code" },
        { id: "copy-text", label: "Copy as text", icon: "text-t" },
        { id: "copy-image", label: "Copy as image", icon: "image" },
        { id: "copy-real-path", label: "Copy real path", icon: "map-pin" },
        { id: "copy-blob-url", label: "Copy as Blob URL", icon: "link" },
        { id: "copyPath", label: "Copy Path", icon: "copy" },
        { id: "movePath", label: "Move Path", icon: "hand-withdraw" }
    ];
};

const makeDirectoryOps = () => {
    const allowed = new Set([
        "open", "download", "delete", "rename", "copyPath", "movePath", "share",
        "share-document", "share-transfer", "share-process", "copy-real-path"
    ]);
    return [...makeFileActionOps(), ...makeFileSystemOps()].filter((item) => allowed.has(item.id));
};

const makeBookmarkFileOps = () => [
    { id: "open", label: "Open", icon: "arrow-square-out" },
    { id: "share", label: "Share…", icon: "share-network" },
    { id: "edit-bookmark", label: "Edit bookmark…", icon: "pencil" },
    { id: "delete", label: "Delete", icon: "trash" },
    { id: "copy-real-path", label: "Copy real path", icon: "map-pin" },
    { id: "copyPath", label: "Copy Path", icon: "copy" },
    { id: "movePath", label: "Move", icon: "hand-withdraw" }
];

const makeBookmarkDirOps = () => [
    { id: "open", label: "Open", icon: "folder-open" },
    { id: "edit-bookmark", label: "Rename folder…", icon: "pencil" },
    { id: "delete", label: "Delete folder", icon: "trash" },
    { id: "copyPath", label: "Copy Path", icon: "copy" },
    { id: "movePath", label: "Move", icon: "hand-withdraw" }
];

const makeEmptyOps = (path: string) => {
    if (!canReceiveIncomingPath(path)) return [];
    if (isBookmarksPath(path)) {
        return [
            { id: "new-bookmark", label: "New bookmark…", icon: "bookmark-simple" },
            { id: "new-folder", label: "New folder…", icon: "folder-plus" },
            { id: "paste", label: "Paste", icon: "clipboard" }
        ];
    }
    return [{ id: "paste", label: "Paste", icon: "clipboard" }];
};

const getExplorerOperative = (fileManager: HTMLElement): any =>
    ((fileManager.getRootNode?.() as ShadowRoot | null)?.host as any)?.operativeInstance ?? null;

//
export const createItemCtxMenu = (
    fileManager: HTMLElement,
    onMenuAction: (item: FileEntryItem | null | undefined, actionId: string, ev: MouseEvent) => Promise<void>,
    entries: { value: FileEntryItem[] }
) => {
    const onContextMenu = (event: Event): void => {
        const ev = event as MouseEvent;

        const row = Array.from(ev.composedPath?.() || [])
            .find((element: any) => element?.classList?.contains?.("row")) as HTMLElement | undefined
            ?? MOCElement(ev.target as HTMLElement | null, ".row");
        const rowKey = row?.getAttribute("data-entry-key");
        const rowName = row?.getAttribute("data-id");
        const item = ((entries?.value ?? entries) as FileEntryItem[]).find((entry) =>
            rowKey ? entryKey(entry) === rowKey : entry?.name === rowName
        ) ?? null;

        const operative = getExplorerOperative(fileManager);
        const currentPath = String(operative?.path || "/");
        const bookmarkItem = Boolean(item && (isBookmarksPath(item.path) || isBookmarksPath(currentPath)));
        const baseItems = item
            ? bookmarkItem
                ? entryKind(item) === "directory" ? makeBookmarkDirOps() : makeBookmarkFileOps()
                : entryKind(item) === "directory" ? makeDirectoryOps() : [...makeFileActionOps(), ...makeFileSystemOps()]
            : makeEmptyOps(currentPath);
        if (baseItems.length === 0) return;

        ev.preventDefault();
        ev.stopPropagation();

        const filtered = baseItems.filter((menuItem) => {
            if (menuItem.id === "copy-text") return isTextLikeEntry(item, item?.path || currentPath);
            if (menuItem.id === "copy-image") return isImageLikeEntry(item, item?.path || currentPath);
            return true;
        });

        const menuItems = filtered.map((menuItem: any) => ({
            ...menuItem,
            danger: menuItem.id === "delete",
            action: () => onMenuAction?.(item, menuItem.id, ev)
        }));

        openUnifiedContextMenu({
            x: ev.clientX,
            y: ev.clientY,
            items: menuItems,
            anchor: fileManager
        });
    };

    fileManager.addEventListener("contextmenu", onContextMenu);
    return () => fileManager.removeEventListener("contextmenu", onContextMenu);
};
