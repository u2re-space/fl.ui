/*
 * Filename: SpeedDial.ts
 * FullPath: modules/projects/fl.ui/src/ui/speed-dial/SpeedDial.ts
 * Change date and time: 08.48.00_24.08.2026
 * Reason for changes: Tile chrome + ui-icon resource stamp at create; no light-DOM img.
 * FIND:pin-shortcut
 */

import { observe, numberRef, propRef, stringRef, affected } from "@fest-lib/object";
import { E, H, orientRef, M, provide, asProvidedFile, handleIncomingEntries } from "@fest-lib/lure";
import { pointerAnchorRef } from "@fest-lib/lure";
import { bindPointerInteraction } from "./pointer-interaction";
import {
    logicalToVisualCell,
    logicalToVisualSpan,
    normalizeOrient,
    pointToLogicalCell,
    visualLayout,
    type GridCell,
    type GridLayout,
    type Orient
} from "./layout";
/* WHY: use local toast + fl-ui alias — Vite preserveSymlinks resolves via home-view/ts symlink, so ../../misc breaks. */
import { showSuccess, showError } from "./toast";
import {
    setAppWallpaperFromBlob,
    resolveAppWallpaperUrl,
    getWallpaperStoragePointer,
    WALLPAPER_IDB_MARKER
} from "@fest-lib/image";
import { openUnifiedContextMenu, type ContextMenuEntry } from "fl-ui/explorer/ContextMenu";
import { resolveSpeedDialBookmarkIconUrl } from "../navigation/app-menu/bookmarks-menu";
import {
    speedDialMeta,
    speedDialItems,
    createEmptySpeedDialItem,
    addSpeedDialItem,
    upsertSpeedDialItem,
    removeSpeedDialItem,
    markSpeedDialUserEditBeforeHydrate,
    emitSpeedDialMutation,
    persistSpeedDialItems,
    persistSpeedDialMeta,
    persistSpeedDialIconBlob,
    resolveSpeedDialIconUrl,
    findSpeedDialItem,
    getSpeedDialMeta,
    ensureSpeedDialMeta,
    NAVIGATION_SHORTCUTS,
    wallpaperState,
    persistWallpaper,
    gridLayoutState,
    createSpeedDialItemFromClipboard,
    copySpeedDialItemToClipboard,
    addClonedSpeedDialItem,
    looksLikeSpeedDialShortcutJson,
    parseSpeedDialItemFromJSON,
    parseSpeedDialItemFromURL,
    parseSpeedDialItemFromSmartText,
    parseSpeedDialItemFromVirtualPath,
    isSpeedDialVirtualPath,
    resolveItemOpenLinkTarget,
    normalizeOpenLinkTarget,
    defaultOpenLinkTargetForHref,
    getDefaultTileShape,
    applyItemIconScaleToElement,
    applyIconScaleToPaintedNodes,
    tileIconFetchSize,
    mirrorSpeedDialItems,
    mirrorPathState,
    isMirrorMode,
    getSpeedDialMirrorPath,
    setSpeedDialMirrorPath,
    refreshSpeedDialMirror,
    createWidgetSpeedDialItem,
    getItemSpan,
    setItemSpan,
    type SpeedDialItem
} from "./launcher-state";
import { isInFocus, MOCElement, updateVP, ensureVirtualKeyboardOverlay } from "@fest-lib/dom";
import { openShortcutEditor } from "./ShortcutEditor";
import { mountCoreRail } from "./core-rail";
import { mountChromeRail } from "./chrome-rail";
import { applyTilesLockedAttr, isTilesLocked, TILES_LOCKED_EVENT } from "./tiles-lock";
import { setSpeedDialViewOpener, getSpeedDialViewOpener } from "./view-opener";
import {
    bootWorkspacePages,
    bindWorkspacePageHotkeys,
    cloneSpeedDialItemToWorkspace,
    getActiveWorkspaceId,
    listWorkspacePages,
    switchWorkspaceByDelta,
    switchWorkspacePage,
    WORKSPACE_PAGE_EVENT
} from "./workspace-pages";
import {
    bindWidgetResize,
    createWidgetNode,
    decorateWidgetHost,
    disposeWidgetNode,
    getSpeedDialWidgetKind,
    hideAndroidWidgetHosts,
    openWidgetPicker,
    releaseAndroidWidget,
    rememberWidgetHost,
    reuseWidgetHost,
    stripStaleWidgetMetaFromShortcuts,
    syncAndroidWidgetHosts
} from "./widgets";
// WHY: home-view `src/ts` is a symlink into speed-dial; Vite preserveSymlinks
// cannot resolve `../navigation/overlay-back` from that view path.
import { installLauncherBackStack } from "#fl-ui/navigation/overlay-back";
import {
    getSpeedDialActionRegistry,
    getSpeedDialActionLabels,
    getSpeedDialActionIcons,
    nativeStorageVirtualPath,
    getCachedLauncherIconObjectUrl,
    getCachedIconResourceObjectUrl,
    isLauncherAppSpeedDialItem,
    getLauncherAppTileCacheKey,
    getLauncherShortcutRef,
    applyLauncherIconToUiIcon,
    ensureLauncherIconObjectUrl,
    hydrateLauncherAppTileIcon,
    isAndroidIconRef,
    resolveIconResourceUrl
} from "./action-registry";
import {
    createTileUiIconElement,
    defaultIconScaleForDisplay,
    inferIconDisplay,
    normalizeIconDisplay,
    normalizeTileShape,
    schedulePlateGlyphInk,
    syncShapelessIconShadow,
    type IconDisplayMode
} from "./tile-icon";
import { isLauncherSku } from "../navigation/app-menu/AppMenu";
// WHY (final review #1/#5): use the `fl-ui/explorer/path-router` alias so this
// file resolves the canonical PathRouter module from any hardlinked copy
// (e.g. `modules/views/home-view/src/ts/SpeedDial.ts`), avoiding a broken
// relative `../explorer/…` path and dual registry registration.
import { listVirtualRootEntriesFromRouter, resolveFsBackend } from "#fl-ui/explorer/path-router";
let ctxMenuBound = false;
/** Document-level paste/drop once — SpeedDial mount (not only createCtxMenu). */
let homeTransferListenersBound = false;
let persistItemsTimer: ReturnType<typeof setTimeout> | null = null;

/** Lazy-init: top-level `observe` + `pointerAnchorRef` ran during chunk eval and hit TDZ vs `com-app` (see vite-chunk-placement). */
let layoutSingleton: ReturnType<typeof observe<[number, number]>> | null = null;

function getLayout(): ReturnType<typeof observe<[number, number]>> {
    if (!layoutSingleton) {
        layoutSingleton = observe([gridLayoutState.columns ?? 4, gridLayoutState.rows ?? 8]);
        affected(gridLayoutState, () => {
            layoutSingleton![0] = gridLayoutState.columns ?? 4;
            layoutSingleton![1] = gridLayoutState.rows ?? 8;
        });
    }
    return layoutSingleton;
}

const getScreenOrient = (): Orient => {
    const type = String(globalThis.screen?.orientation?.type || "");
    if (type.includes("landscape")) return type.endsWith("secondary") ? 3 : 1;
    return type.endsWith("secondary") ? 2 : 0;
};

const getRootOrient = (root?: HTMLElement | null): Orient => {
    return normalizeOrient(root?.getAttribute("orient") ?? getScreenOrient());
};

const getGridLayout = (): GridLayout => [
    Number(gridLayoutState.columns) || 4,
    Number(gridLayoutState.rows) || 8
];

const readCellAxis = (value: unknown): number => {
    let cur: unknown = value;
    if (cur && typeof cur === "object" && "value" in (cur as object)) {
        cur = (cur as { value: unknown }).value;
    }
    const n = Number(cur);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const getItemCell = (item: SpeedDialItem): GridCell => [
    readCellAxis(item.cell?.[0]),
    readCellAxis(item.cell?.[1])
];

const currentHomeRoot = (): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    return document.getElementById("home") || document.querySelector(".speed-dial-root");
};

/* WHY: lure applies `style=` after `ref=` and can wipe `--cell-*`. First paint
 * must keep identity vars — missing `--cell-column` invalidates the !important
 * rule and captions auto-flow onto neighboring tiles. `--cell-x:0` is a real cell. */
const labelLayerStyle = (item: { cell?: unknown }): string => {
    const logical: GridCell = [
        readCellAxis((item as SpeedDialItem)?.cell?.[0]),
        readCellAxis((item as SpeedDialItem)?.cell?.[1])
    ];
    const visual = logicalToVisualCell(logical, getGridLayout(), getRootOrient(currentHomeRoot()));
    const col = visual[0] + 1;
    const row = visual[1] + 1;
    return [
        `--cell-x:${logical[0]}`,
        `--cell-y:${logical[1]}`,
        `--p-cell-x:${logical[0]}`,
        `--p-cell-y:${logical[1]}`,
        `--cell-column:${col}`,
        `--cell-row:${row}`,
        `grid-column:${col} / span 1`,
        `grid-row:${row} / span 1`
    ].join(";");
};

/**
 * WHY: `createShapedTileShadow` + `observeDisconnect` removes the under when M()
 * reparents the tile. Local sibling — no lure attach/destroy.
 * INVARIANT: M() maps 1 item → 1 node. Do not return under+icon as a fragment.
 */
const createShapedUnder = (item: { id: string }, host: HTMLElement): HTMLElement => {
    const under = document.createElement("div");
    under.className = "ui-ws-item-icon-under underlying-shadow-container";
    under.setAttribute("aria-hidden", "true");
    under.dataset.id = String(item.id || "");
    under.dataset.layer = "shadows";
    const geo = document.createElement("div");
    geo.className = "underlying-shadow-geometry shaped";
    under.append(geo);
    const shape = host.getAttribute("data-shape") || "";
    under.setAttribute("data-shape", shape);
    geo.setAttribute("data-shape", shape);
    return under;
};

const shouldHideShapedUnder = (icon: HTMLElement): boolean => {
    const shape = icon.getAttribute("data-shape") || "";
    return (
        shape === "shapeless" ||
        shape === "none" ||
        icon.classList.contains("sd-widget-host") ||
        Boolean(icon.dataset.widget)
    );
};

const findShapedUnder = (icon: HTMLElement): HTMLElement | null => {
    const id = icon.dataset.id;
    const parent = icon.parentElement;
    if (!id || !parent) return null;
    for (const child of parent.children) {
        if (
            child instanceof HTMLElement &&
            child.classList.contains("ui-ws-item-icon-under") &&
            child.dataset.id === id
        ) {
            return child;
        }
    }
    return null;
};

/** WHY: attach after the icon is in the grid — H`${under}${icon}` crashed Capacitor on pin/add. */
const ensureShapedUnderSibling = (icon: HTMLElement, item: { id: string }): void => {
    try {
        if (icon.dataset.layer !== "icons") return;
        if (shouldHideShapedUnder(icon)) {
            findShapedUnder(icon)?.remove();
            return;
        }
        if (!icon.parentElement) return;
        let under = findShapedUnder(icon);
        if (!under) {
            under = createShapedUnder(item, icon);
            icon.before(under);
        } else if (under.nextElementSibling !== icon) {
            icon.before(under);
        }
        bindUnderDisconnect(icon, under);
        stampShapedUnderCell(icon);
    } catch {
        /* pin/add must not take down Capacitor WebView */
    }
};

/*
 * WHY: under is not an M() child. When M() removes/reparents the tile, the
 * sibling shadow stays. Same params as lure UnderlyingShadow.attachToDOM.
 */
const bindUnderDisconnect = (icon: HTMLElement, under: HTMLElement): void => {
    if (under.dataset.disconnectBound === "1") return;
    const parent = icon.parentElement;
    if (!parent) return;
    under.dataset.disconnectBound = "1";
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
                if (node === icon || (node instanceof Node && node.contains?.(icon))) {
                    under.remove();
                    observer.disconnect();
                    return;
                }
            }
        }
    });
    observer.observe(parent, { childList: true, subtree: true });
};

const pruneOrphanUnders = (scope: ParentNode | null | undefined): void => {
    if (!scope?.querySelectorAll) return;
    const grids = scope.querySelectorAll<HTMLElement>(".speed-dial-grid[data-grid-layer='icons']");
    const roots: ParentNode[] = grids.length ? [...grids] : [scope];
    for (const grid of roots) {
        const live = new Map<string, HTMLElement>();
        grid.querySelectorAll<HTMLElement>(':scope > [data-speed-dial-item][data-layer="icons"]').forEach((el) => {
            if (el.dataset.id && isLiveSpeedDialNode(el)) live.set(el.dataset.id, el);
        });
        grid.querySelectorAll<HTMLElement>(":scope > .ui-ws-item-icon-under").forEach((under) => {
            const icon = live.get(under.dataset.id || "");
            if (!icon || shouldHideShapedUnder(icon)) under.remove();
        });
    }
};

const bindIconGridShadowJanitor = (root: HTMLElement): void => {
    root.querySelectorAll<HTMLElement>(".speed-dial-grid[data-grid-layer='icons']").forEach((grid) => {
        if (grid.dataset.shadowMo === "1") return;
        grid.dataset.shadowMo = "1";
        const sweep = (): void => pruneOrphanUnders(grid);
        const observer = new MutationObserver(sweep);
        observer.observe(grid, { childList: true, subtree: true });
        sweep();
    });
};

const syncWidgetsAfterGridChange = (root?: HTMLElement | null): void => {
    const host = root || currentHomeRoot();
    if (!host) return;
    pruneOrphanUnders(host);
    const liveAndroid = host.querySelector(
        '[data-speed-dial-item][data-widget="android"][data-layer="icons"]'
    );
    if (!liveAndroid) hideAndroidWidgetHosts();
    else syncAndroidWidgetHosts(host);
};

const isLiveSpeedDialNode = (node: Element): boolean =>
    !node.closest(".speed-dial-grid--turn-ghost");

const usedGridLine = (el: HTMLElement, axis: "column" | "row"): string => {
    const varName = axis === "column" ? "--cell-column" : "--cell-row";
    const fromVar = el.style.getPropertyValue(varName).trim();
    /* WHY: do not treat computed `auto` as identity — that is neighbor packing. */
    if (fromVar && fromVar !== "auto") return fromVar;
    const fromData = (axis === "column" ? el.dataset.cellColumn : el.dataset.cellRow) || "";
    return fromData && fromData !== "auto" ? fromData : "";
};

const stampItemGridLine = (
    el: HTMLElement,
    visualCell: GridCell,
    _span: readonly [number, number] = [1, 1]
): void => {
    const col = visualCell[0] + 1;
    const row = visualCell[1] + 1;
    el.dataset.cellColumn = String(col);
    el.dataset.cellRow = String(row);
    el.style.setProperty("--cell-column", String(col));
    el.style.setProperty("--cell-row", String(row));
    if (el.dataset.layer !== "labels") return;
    /* WHY: labels still pin 1×1 — widgets use `--cs-grid-*` like icon tiles. */
    el.style.setProperty("grid-column", `${col} / span 1`, "important");
    el.style.setProperty("grid-row", `${row} / span 1`, "important");
};

/** WHY: under-glow is a grid sibling — CSS-anchor + `grid-column:unset` left it 0×0 on WebView. */
const stampShapedUnderCell = (icon: HTMLElement): void => {
    if (icon.dataset.layer !== "icons") return;
    const id = icon.dataset.id;
    const parent = icon.parentElement;
    if (!id || !parent) return;
    const col = usedGridLine(icon, "column");
    const row = usedGridLine(icon, "row");
    if (!col && !row) return;
    /* WHY: do not getComputedStyle here — forced layout mid-M() insert crashed Capacitor. */
    const tile = icon.style.getPropertyValue("--tile-size").trim();
    const shape = icon.getAttribute("data-shape") || "";
    parent.querySelectorAll<HTMLElement>(":scope > .ui-ws-item-icon-under").forEach((under) => {
        if (under.dataset.id !== id) return;
        under.setAttribute("data-shape", shape);
        const geo = under.querySelector<HTMLElement>(".underlying-shadow-geometry");
        if (geo) geo.setAttribute("data-shape", shape);
        if (col) {
            under.style.setProperty("--cell-column", col);
            under.style.setProperty("grid-column", `${col} / span 1`, "important");
            under.dataset.cellColumn = col;
        }
        if (row) {
            under.style.setProperty("--cell-row", row);
            under.style.setProperty("grid-row", `${row} / span 1`, "important");
            under.dataset.cellRow = row;
        }
        const x = icon.style.getPropertyValue("--cell-x");
        const y = icon.style.getPropertyValue("--cell-y");
        if (x) under.style.setProperty("--cell-x", x);
        if (y) under.style.setProperty("--cell-y", y);
        if (tile) under.style.setProperty("--tile-size", tile);
    });
};

const applyVisualCell = (el: HTMLElement, item: SpeedDialItem, root?: HTMLElement | null): void => {
    const orient = getRootOrient(root);
    const layout = getGridLayout();
    const logicalCell = getItemCell(item);
    const visualCell = logicalToVisualCell(logicalCell, layout, orient);
    el.dataset.cellX = String(logicalCell[0]);
    el.dataset.cellY = String(logicalCell[1]);
    // WHY: `.ui-launcher-grid` places via `--cell-x/y` + `--orient`; SpeedDial.scss
    // also uses 1-based `--cell-column`. Keep both in lockstep with persisted cells.
    el.style.setProperty("--cell-x", String(logicalCell[0]));
    el.style.setProperty("--cell-y", String(logicalCell[1]));
    el.style.setProperty("--p-cell-x", String(logicalCell[0]));
    el.style.setProperty("--p-cell-y", String(logicalCell[1]));
    const [spanCols, spanRows] = getItemSpan(item.id);
    const [spanX, spanY] = logicalToVisualSpan([spanCols, spanRows], orient);
    const [visCols, visRows] = visualLayout(layout, orient);
    const fitX = Math.max(1, Math.min(spanX, visCols - visualCell[0]));
    const fitY = Math.max(1, Math.min(spanY, visRows - visualCell[1]));
    el.style.setProperty("--cell-span-x", String(fitX));
    el.style.setProperty("--cell-span-y", String(fitY));
    stampItemGridLine(el, visualCell, [fitX, fitY]);
    if (el.dataset.layer === "labels") el.removeAttribute("data-spanned");
    else el.toggleAttribute("data-spanned", fitX > 1 || fitY > 1);
    const widgetKind = getSpeedDialWidgetKind(item);
    if (widgetKind) el.setAttribute("data-widget", widgetKind);
    else el.removeAttribute("data-widget");
    if (el.dataset.layer === "labels") {
        /* INVARIANT: captions stay under the plate. Measuring wrap height vs dock
         * flipped long titles (`Edge`, `Messages`) to `above` and onto the icon. */
        el.dataset.labelPlacement = "below";
    }
    if (el.dataset.layer === "icons") {
        stampTileHostAttrs(el, item);
        ensureShapedUnderSibling(el, item);
    }
};

const scheduleLabelPlacementSync = (root: HTMLElement): void => {
    if (root.dataset.labelPlacementFrame === "pending") return;
    root.dataset.labelPlacementFrame = "pending";
    const sync = (): void => {
        delete root.dataset.labelPlacementFrame;
        const icons = new Map<string, HTMLElement>();
        root.querySelectorAll<HTMLElement>('[data-speed-dial-item][data-layer="icons"]').forEach((node) => {
            if (!isLiveSpeedDialNode(node) || !node.dataset.id) return;
            icons.set(node.dataset.id, node);
        });
        root.querySelectorAll<HTMLElement>('[data-speed-dial-item][data-layer="labels"]').forEach((node) => {
            if (!isLiveSpeedDialNode(node) || !node.dataset.id) return;
            const item = findSpeedDialItem(node.dataset.id);
            if (item) applyVisualCell(node, item, root);
            const icon = icons.get(node.dataset.id);
            if (!icon) return;
            const col = usedGridLine(icon, "column");
            const row = usedGridLine(icon, "row");
            /* WHY: copy only stamped lines. Computed auto from a missing `--cell-column`
             * would slide this caption onto the next packed neighbor. */
            if (col) {
                node.style.setProperty("--cell-column", col);
                node.style.setProperty("grid-column", `${col} / span 1`, "important");
                node.dataset.cellColumn = col;
            }
            if (row) {
                node.style.setProperty("--cell-row", row);
                node.style.setProperty("grid-row", `${row} / span 1`, "important");
                node.dataset.cellRow = row;
            }
            ensureShapedUnderSibling(icon, item || { id: icon.dataset.id || "" });
        });
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(sync);
    } else {
        globalThis.setTimeout(sync, 0);
    }
};

const syncGridLayout = (root: HTMLElement): void => {
    const logicalLayout = getGridLayout();
    const orient = getRootOrient(root);
    const [columns, rows] = visualLayout(logicalLayout, orient);

    root.dataset.orient = String(orient);
    root.style.setProperty("--orient", String(orient));
    root.style.setProperty("--layout-c", String(logicalLayout[0]));
    root.style.setProperty("--layout-r", String(logicalLayout[1]));
    root.querySelectorAll<HTMLElement>(".speed-dial-grid").forEach((grid) => {
        // INVARIANT: `.ui-launcher-grid` template is `repeat(var(--cs-layout-c))`,
        // derived from logical `--layout-c/r` + `--orient`. `--grid-columns` is the
        // visual count for SpeedDial.scss. Both must follow Workspace settings.
        grid.style.setProperty("--layout-c", String(logicalLayout[0]));
        grid.style.setProperty("--layout-r", String(logicalLayout[1]));
        grid.style.setProperty("--grid-columns", String(columns));
        grid.style.setProperty("--grid-rows", String(rows));
        grid.dataset.gridColumns = String(logicalLayout[0]);
        grid.dataset.gridRows = String(logicalLayout[1]);
    });
    root.querySelectorAll<HTMLElement>("[data-speed-dial-item]").forEach((node) => {
        if (!isLiveSpeedDialNode(node)) return;
        const item = findSpeedDialItem(node.dataset.id);
        if (item) applyVisualCell(node, item, root);
    });
    scheduleLabelPlacementSync(root);
};

/** Capacitor / coarse pointer: swipe up on empty Speed Dial → App Menu. */
const SWIPE_APP_MENU_MIN_DY = 72;
const SWIPE_APP_MENU_MAX_DX_RATIO = 0.75;
const SWIPE_WORKSPACE_MIN_DX = 72;

const isNativeCapacitorOrCoarse = (): boolean => {
    try {
        const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        if (typeof c?.isNativePlatform === "function" && c.isNativePlatform()) return true;
    } catch {
        /* ignore */
    }
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
};

const tryOpenLauncherAppMenu = (): void => {
    const api = (globalThis as { __CWSP_LAUNCHER_HOME__?: { openAppMenu?: () => void } })
        .__CWSP_LAUNCHER_HOME__;
    if (typeof api?.openAppMenu === "function") {
        api.openAppMenu();
        return;
    }
    const hooks = (
        globalThis as { __CWSP_LAUNCHER_HOME_HOOKS_V1__?: { openAppMenu?: () => void } }
    ).__CWSP_LAUNCHER_HOME_HOOKS_V1__;
    hooks?.openAppMenu?.();
};

const isEmptySpeedDialSurface = (root: HTMLElement, target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return target === root;
    if (!root.contains(target)) return false;
    return !target.closest(
        "[data-speed-dial-item], .ui-ws-item, dialog, .cw-context-menu-layer, .env-shell-app-menu, .speed-dial-editor, .speed-dial-core-rail, .speed-dial-chrome-rail"
    );
};

const isLauncherChromeHit = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    !!target.closest(
        "dialog, .cw-context-menu-layer, .env-shell-app-menu, .speed-dial-editor, .sd-icon-picker, .speed-dial-core-rail, .speed-dial-chrome-rail, .speed-dial-workspace-pager, input, textarea, select, .sd-widget__search"
    );

/** WHY: pinned tiles skip drag — workspace / app-menu swipes may start on icons too. */
const canStartDesktopSwipe = (root: HTMLElement, target: EventTarget | null): boolean => {
    if (isLauncherChromeHit(target)) return false;
    if (isTilesLocked()) {
        if (!(target instanceof Node)) return target === root;
        return root === target || root.contains(target);
    }
    return isEmptySpeedDialSurface(root, target);
};

const suppressTileClickAfterSwipe = (target: EventTarget | null): void => {
    const tile =
        target instanceof Element ? target.closest<HTMLElement>("[data-speed-dial-item]") : null;
    if (!tile) return;
    tile.dataset.interactionState = "onRelax";
    window.setTimeout(() => {
        if (tile.dataset.interactionState === "onRelax") tile.dataset.interactionState = "onHover";
    }, 80);
};

const mountWorkspacePager = (root: HTMLElement): void => {
    if (root.querySelector(".speed-dial-workspace-pager")) return;
    const pager = document.createElement("nav");
    pager.className = "speed-dial-workspace-pager";
    pager.setAttribute("aria-label", "Workspaces");
    const paint = (): void => {
        const pages = listWorkspacePages();
        const active = getActiveWorkspaceId();
        pager.replaceChildren();
        for (const page of pages) {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "speed-dial-workspace-pager__dot";
            dot.title = page.label;
            dot.setAttribute("aria-label", page.label);
            dot.toggleAttribute("data-active", page.id === active);
            dot.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                switchWorkspacePage(page.id);
            });
            pager.append(dot);
        }
    };
    paint();
    window.addEventListener(WORKSPACE_PAGE_EVENT, paint);
    root.append(pager);
};

const bindEmptySpaceSwipeOpenAppMenu = (root: HTMLElement): void => {
    if (root.dataset.swipeAppMenuBound === "1") return;
    if (!isNativeCapacitorOrCoarse()) return;
    root.dataset.swipeAppMenuBound = "1";

    let tracking = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;

    root.addEventListener(
        "pointerdown",
        (ev: PointerEvent) => {
            if (ev.pointerType === "mouse") return;
            if (!canStartDesktopSwipe(root, ev.target)) return;
            if (document.querySelector(".env-shell-app-menu[data-open]")) return;
            tracking = true;
            pointerId = ev.pointerId;
            startX = ev.clientX;
            startY = ev.clientY;
        },
        { passive: true }
    );

    const endTrack = (ev: PointerEvent): void => {
        if (!tracking || ev.pointerId !== pointerId) return;
        tracking = false;
        pointerId = -1;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) >= SWIPE_WORKSPACE_MIN_DX && Math.abs(dx) > Math.abs(dy) * 1.1) {
            suppressTileClickAfterSwipe(ev.target);
            switchWorkspaceByDelta(dx < 0 ? 1 : -1);
            return;
        }
        if (dy > -SWIPE_APP_MENU_MIN_DY) return;
        if (Math.abs(dx) > Math.abs(dy) * SWIPE_APP_MENU_MAX_DX_RATIO) return;
        suppressTileClickAfterSwipe(ev.target);
        tryOpenLauncherAppMenu();
    };

    root.addEventListener("pointerup", endTrack, { passive: true });
    root.addEventListener(
        "pointercancel",
        (ev: PointerEvent) => {
            if (ev.pointerId === pointerId) {
                tracking = false;
                pointerId = -1;
            }
        },
        { passive: true }
    );
};

const bindRootOrientation = (root: HTMLElement): void => {
    if (root.dataset.orientObserverBound === "true") {
        syncGridLayout(root);
        return;
    }
    root.dataset.orientObserverBound = "true";
    // WHY: Ctrl+V targets the focused node; keep #home focusable after a click/tap on the desktop.
    if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
    if (root.dataset.focusOnPointerBound !== "1") {
        root.dataset.focusOnPointerBound = "1";
        root.addEventListener(
            "pointerdown",
            () => {
                try {
                    root.focus({ preventScroll: true });
                } catch {
                    try {
                        root.focus();
                    } catch {
                        /* ignore */
                    }
                }
            },
            { capture: true }
        );
    }
    bindEmptySpaceSwipeOpenAppMenu(root);
    applyTilesLockedAttr(root);
    if (root.dataset.tilesLockBound !== "1") {
        root.dataset.tilesLockBound = "1";
        window.addEventListener(TILES_LOCKED_EVENT, () => applyTilesLockedAttr(root));
    }
    mountWorkspacePager(root);
    bindIconGridShadowJanitor(root);
    queueMicrotask(() => bindIconGridShadowJanitor(root));
    const observer = new MutationObserver((records) => {
        if (records.some((record) => record.attributeName === "orient")) {
            syncGridLayout(root);
        }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["orient"] });
    const screenOrientation = globalThis.screen?.orientation;
    const onScreenOrientationChange = (): void => {
        if (!root.hasAttribute("orient")) syncGridLayout(root);
    };
    screenOrientation?.addEventListener?.("change", onScreenOrientationChange);
    affected(gridLayoutState, () => syncGridLayout(root));
    syncGridLayout(root);
    queueMicrotask(() => syncGridLayout(root));
    if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(() => refreshRootCells(root));
    }
};

const refreshRootCells = (root: HTMLElement): void => {
    pruneOrphanUnders(root);
    root.querySelectorAll<HTMLElement>("[data-speed-dial-item]").forEach((node) => {
        if (!isLiveSpeedDialNode(node)) return;
        const item = findSpeedDialItem(node.dataset.id);
        if (item) applyVisualCell(node, item, root);
    });
    scheduleLabelPlacementSync(root);
};

const scheduleRootCellRefresh = (): void => {
    const run = (): void => {
        const home = currentHomeRoot();
        if (home) refreshRootCells(home);
    };
    queueMicrotask(run);
    if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(run);
    }
};

type PointerAnchorPair = ReturnType<typeof pointerAnchorRef>;
type NumberRefPair = [ReturnType<typeof numberRef>, ReturnType<typeof numberRef>];
let coordinateRefSingleton: PointerAnchorPair | NumberRefPair | null = null;

function getCoordinateRef(): PointerAnchorPair | NumberRefPair {
    if (!coordinateRefSingleton) {
        coordinateRefSingleton =
            typeof document !== "undefined" ? pointerAnchorRef() : [numberRef(0), numberRef(0)];
    }
    return coordinateRefSingleton;
}

const schedulePersistItems = () => {
    if (persistItemsTimer) clearTimeout(persistItemsTimer);
    persistItemsTimer = setTimeout(() => {
        persistItemsTimer = null;
        markSpeedDialUserEditBeforeHydrate();
        persistSpeedDialItems();
    }, 80);
};
const resolveItemAction = (item: SpeedDialItem, override?: string) => {
    if (override) return override;
    const entry = getSpeedDialMeta(item.id);
    const action = entry?.action || item?.action || "open-view";
    /* WHY: older tiles kept open-view after Open-in Document — that launched an empty APK. */
    if (
        action === "open-view" &&
        nativeStorageVirtualPath(String(entry?.path || (item as { path?: string }).path || entry?.href || ""))
    ) {
        return "open-path";
    }
    return action;
};

const BASE_ACTION_OPTIONS = [
    { value: "open-view", label: "Open view" },
    { value: "open-link", label: "Open link" },
    { value: "open-path", label: "Open path" },
    { value: "copy-link", label: "Copy link" },
    { value: "copy-state-desc", label: "Copy state + desc" },
    { value: "widget", label: "Widget" }
];

/** Launcher SKU exposes Android app launch tiles via dynamic launcher-bridge import. */
const getActionOptions = () => {
    const options = [...BASE_ACTION_OPTIONS];
    if (isLauncherSku()) {
        options.push({ value: "launch-app", label: "Launch app" });
    }
    return options;
};
const DEFAULT_WALLPAPER_SRC = "/assets/wallpaper.jpg";
const WALLPAPER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif"]);

const getRefValue = (ref: any, fallback = "") => {
    if (ref && typeof ref === "object" && "value" in ref) return ref.value ?? fallback;
    return ref ?? fallback;
};

/** blob: object URLs die across reloads — never treat them as durable Icon resource. */
const isDurableIconResourceUrl = (raw: unknown): boolean => {
    const u = String(raw || "").trim();
    if (!u) return false;
    if (u.startsWith("blob:")) return false;
    return true;
};

const durableIconUrl = (raw: unknown): string => {
    const u = String(raw || "").trim();
    return isDurableIconResourceUrl(u) ? u : "";
};

type TileIconModel = {
    display: ReturnType<typeof inferIconDisplay>;
    shape: string;
    iconScale: string;
    fallbackIcon: string;
    customUrl: string;
    resourceUrl: string;
    launchApp: boolean;
    shortcutRef: ReturnType<typeof getLauncherShortcutRef>;
    cacheKey: string;
    fetchSize: number;
    cachedAndroid: string;
};

const readTileIconModel = (item: SpeedDialItem): TileIconModel => {
    const launchApp = isLauncherAppSpeedDialItem(item);
    const shortcutRef = getLauncherShortcutRef(item);
    const cacheKey = launchApp ? getLauncherAppTileCacheKey(item) : "";
    const meta = getSpeedDialMeta(item.id) || {};
    const iconUrl = getRefValue((meta as { iconUrl?: unknown }).iconUrl, "");
    const iconDisplay = getRefValue((meta as { iconDisplay?: unknown }).iconDisplay, "");
    const iconScale = getRefValue((meta as { iconScale?: unknown }).iconScale, "");
    const href = getRefValue((meta as { href?: unknown }).href, "");
    const entityType = getRefValue((meta as { entityType?: unknown }).entityType, "");
    const bookmarkId = getRefValue((meta as { bookmarkId?: unknown }).bookmarkId, "");
    if (String(iconUrl || "").startsWith("blob:") && meta && "iconUrl" in meta) {
        (meta as { iconUrl?: string }).iconUrl = "";
    }
    const fetchSize = tileIconFetchSize(iconScale);
    const cachedLauncherIcon = cacheKey ? getCachedLauncherIconObjectUrl(cacheKey, fetchSize) : "";
    const bookmarkIconUrl = resolveSpeedDialBookmarkIconUrl({
        iconUrl: String(iconUrl || "").startsWith("blob:") ? "" : iconUrl,
        href,
        entityType,
        bookmarkId
    });
    const customUrl = durableIconUrl(
        resolveSpeedDialIconUrl(item.id, String(iconUrl || "").startsWith("blob:") ? "" : iconUrl)
    );
    const cachedAndroid =
        customUrl && isAndroidIconRef(customUrl)
            ? getCachedIconResourceObjectUrl(customUrl, fetchSize)
            : "";
    const resourceUrl = String(
        cachedAndroid || (isAndroidIconRef(customUrl) ? "" : customUrl) || cachedLauncherIcon || bookmarkIconUrl || ""
    ).trim();
    const display = inferIconDisplay({
        iconDisplay,
        iconUrl: resourceUrl || customUrl,
        isLauncherApp: launchApp,
        isBookmarkFavicon: Boolean(bookmarkIconUrl)
    });
    return {
        display,
        shape: normalizeTileShape(getRefValue((meta as { shape?: unknown }).shape, ""), getDefaultTileShape()),
        iconScale,
        fallbackIcon: String(getRefValue(item.icon, "link") || "link"),
        customUrl,
        resourceUrl,
        launchApp,
        shortcutRef,
        cacheKey,
        fetchSize,
        cachedAndroid
    };
};

/** INVARIANT: host attrs come from meta before the first paint / under-shadow. */
const stampTileHostAttrs = (el: HTMLElement, item: SpeedDialItem, model?: TileIconModel): TileIconModel => {
    const next = model || readTileIconModel(item);
    if (getSpeedDialWidgetKind(item)) {
        el.setAttribute("data-shape", "none");
        el.removeAttribute("data-icon-display");
        return next;
    }
    el.setAttribute("data-shape", next.shape);
    el.setAttribute("data-icon-display", next.display);
    applyItemIconScaleToElement(el, defaultIconScaleForDisplay(next.display, next.iconScale));
    return next;
};

const bindTileIconResource = (
    el: HTMLElement,
    iconNode: HTMLElement,
    item: SpeedDialItem,
    model: TileIconModel,
    onReady?: () => void
): void => {
    const mode = model.display === "glyph" ? null : model.display;
    if (!mode) return;
    const apply = (url: string): void => {
        if (!url || !iconNode.isConnected) return;
        if (el.getAttribute("data-icon-display") === "glyph") return;
        iconNode.setAttribute("resource", url);
        applyLauncherIconToUiIcon(iconNode, url, mode);
        onReady?.();
    };
    if (model.resourceUrl) {
        apply(model.resourceUrl);
        if (isAndroidIconRef(model.customUrl) && !model.cachedAndroid) {
            void resolveIconResourceUrl(model.customUrl, model.fetchSize).then(apply);
        }
        return;
    }
    if (isAndroidIconRef(model.customUrl)) {
        void resolveIconResourceUrl(model.customUrl, model.fetchSize).then(apply);
        return;
    }
    if (model.launchApp && model.cacheKey) {
        void ensureLauncherIconObjectUrl(model.cacheKey, model.fetchSize).then(apply);
        return;
    }
    if (model.shortcutRef) {
        void hydrateLauncherAppTileIcon(el, {
            id: item.id,
            action: item.action,
            iconDisplay: mode
        }).then(() => onReady?.());
    }
};

/**
 * Rebuild icon host for a SpeedDial tile from current item + meta.
 * WHY: ShortcutEditor saves iconDisplay/iconUrl/shape on meta in-place; M() does not
 * recreate the icon child unless the list entry is replaced — so Save looked like a no-op.
 */
const paintSpeedDialTileIcon = (el: HTMLElement, item: SpeedDialItem): void => {
    if (!el || el.dataset.layer === "labels") return;
    /* WHY: widgets own their face — a glyph clock here stacks analog hands on digital time. */
    if (el.classList.contains("sd-widget-host") || el.dataset.widget || getSpeedDialWidgetKind(item)) {
        el.querySelectorAll(
            "ui-icon, .ui-ws-item-icon-native, img[data-launcher-icon], .ui-ws-item-icon-img, .ui-ws-item-icon-mask"
        ).forEach((node) => node.remove());
        return;
    }

    const model = stampTileHostAttrs(el, item);
    el.querySelectorAll(
        "ui-icon, .ui-ws-item-icon-native, img[data-launcher-icon], .ui-ws-item-icon-img, .ui-ws-item-icon-mask, .sd-icon-silhouette"
    ).forEach((node) => node.remove());

    const finishPaint = (): void => {
        applyIconScaleToPaintedNodes(el);
        syncShapelessIconShadow(el);
        schedulePlateGlyphInk(el);
    };

    const pendingShortcut =
        model.display !== "glyph" &&
        Boolean(model.shortcutRef) &&
        !model.resourceUrl &&
        !isAndroidIconRef(model.customUrl);
    const iconNode = createTileUiIconElement({
        display: pendingShortcut ? "glyph" : model.display,
        glyph: model.fallbackIcon,
        resourceUrl: pendingShortcut ? undefined : model.resourceUrl || undefined,
        launcher: model.launchApp || Boolean(model.shortcutRef),
        className: "ui-ws-item-icon-native"
    });
    el.prepend(iconNode);
    finishPaint();
    bindTileIconResource(el, iconNode, item, model, () => {
        if (el.isConnected) finishPaint();
    });
};

const bindSpeedDialTileIconChrome = (el: HTMLElement, item: SpeedDialItem): void => {
    if (el.classList.contains("sd-widget-host") || el.dataset.widget || getSpeedDialWidgetKind(item)) return;
    if (el.dataset.iconChromeBound === "1") return;
    el.dataset.iconChromeBound = "1";
    const meta = ensureSpeedDialMeta(item.id);
    const sync = (): void => {
        if (!el.isConnected) return;
        paintSpeedDialTileIcon(el, item);
    };
    affected(meta, "iconDisplay", sync);
    affected(meta, "iconUrl", sync);
    affected(meta, "shape", sync);
    affected(meta, "iconScale", sync);
    /* Workspace grid.iconScale change — re-fetch hi-res bitmaps for auto tiles. */
    el.addEventListener("cwsp:icon-bitmap-refresh", sync);
    const iconRef = (item as { icon?: unknown }).icon;
    if (iconRef && typeof iconRef === "object") {
        affected(iconRef, "value", sync);
    } else {
        affected(item, "icon", sync);
    }
};

const buildDescriptor = (item: SpeedDialItem) => {
    const meta = getSpeedDialMeta(item.id);
    return {
        label: getRefValue(item?.label),
        type: meta?.view || "speed-dial",
        DIR: "/",
        href: meta?.href,
        view: meta?.view,
        packageName: meta?.packageName,
        action: resolveItemAction(item)
    };
};

const bindCell = (el: HTMLElement, args: any): void => {
    const item = args?.item as SpeedDialItem | undefined;
    if (!item) return;
    const sync = (): void => {
        const mounted = el.closest<HTMLElement>(".speed-dial-root")
            || el.ownerDocument?.getElementById("home");
        applyVisualCell(el, item, mounted);
    };
    sync();
    /* WHY: lure writes `style=` after `ref=` and would drop `--cell-*` (incl. 0,0). */
    queueMicrotask(sync);
    if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(sync);
    }
    affected([item.cell, 0], sync);
    affected([item.cell, 1], sync);
    /* WHY: chrome.storage reloadInto may replace the cell array; axis listeners would go stale. */
    affected(item, "cell", sync);
    const meta = getSpeedDialMeta(item.id);
    if (meta) {
        affected([meta, "spanCols"], sync);
        affected([meta, "spanRows"], sync);
    }
};

//
let lastItemOpenKey = "";
let lastItemOpenAt = 0;
let lastFocusedSpeedDialId = "";

const runItemAction = (
    item: SpeedDialItem,
    actionId?: string,
    extras: { event?: Event; initiator?: HTMLElement; openLinkTarget?: string } = {},
    makeView?: any
) => {
    const resolvedAction = resolveItemAction(item, actionId);
    const openKey = `${item?.id || ""}::${resolvedAction}::${extras?.openLinkTarget || ""}`;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    // WHY: `ref=` can re-run attachItemNode and stack duplicate click listeners → double open.
    if (openKey && openKey === lastItemOpenKey && now - lastItemOpenAt < 400) {
        return;
    }
    lastItemOpenKey = openKey;
    lastItemOpenAt = now;

    if (resolvedAction === "widget" || getSpeedDialWidgetKind(item)) return;

    const action = getSpeedDialActionRegistry().get(resolvedAction);
    if (!action) { showError("Action is unavailable"); return; }
    const context = {
        id: item.id,
        items: speedDialItems,
        meta: speedDialMeta,
        action: resolvedAction,
        viewMaker: makeView,
        ...(extras?.openLinkTarget ? { openLinkTarget: extras.openLinkTarget } : {})
    };
    try {
        action(context as any, item, extras?.initiator);
    } catch (error) {
        console.warn(error);
        showError("Failed to run action");
    }
};

const attachItemNode = (item: SpeedDialItem, el?: HTMLElement | null, interactive = true, makeView?: any) => {
    if (!el) return;
    const args = { layout: getLayout(), items: speedDialItems, item, meta: speedDialMeta };
    const root = el.closest<HTMLElement>(".speed-dial-root")
        || el.ownerDocument?.getElementById("home");
    el.dataset.id = item.id;
    el.dataset.speedDialItem = "true";
    if (el.dataset.layer === "icons") stampTileHostAttrs(el, item);
    if (interactive) {
        el.addEventListener("pointerdown", () => {
            lastFocusedSpeedDialId = item.id;
        });
        el.addEventListener("dragstart", (ev)=>ev.preventDefault());
        bindSpeedDialTileIconChrome(el, item);
        const isShortcut = Boolean(getLauncherShortcutRef(item));
        if (
            isShortcut ||
            resolveItemAction(item) === "launch-app" ||
            resolveItemAction(item) === "launch-shortcut"
        ) {
            const meta = getSpeedDialMeta(item.id);
            const display = String(
                getRefValue((meta as { iconDisplay?: unknown } | null)?.iconDisplay, "") ||
                    el.getAttribute("data-icon-display") ||
                    ""
            )
                .trim()
                .toLowerCase();
            const customUrl = durableIconUrl(
                resolveSpeedDialIconUrl(
                    item.id,
                    getRefValue((meta as { iconUrl?: unknown } | null)?.iconUrl, "")
                )
            );
            /* WHY: user glyph/shape must survive reload — do not refetch Files icon over it. */
            if (
                display !== "glyph" &&
                display !== "phosphor" &&
                display !== "name" &&
                !customUrl
            ) {
                void hydrateLauncherAppTileIcon(el, {
                    id: item.id,
                    action: item.action,
                    iconDisplay: isShortcut ? "colored" : display,
                    iconUrl: customUrl
                });
            }
        }
        if (!el.dataset.dragGuardBound) {
            el.dataset.dragGuardBound = "1";
            el.addEventListener("m-dragsettled", () => {
                schedulePersistItems();
            });
        }
        // INVARIANT: bind click/dblclick once per node — M()/ref re-entry must not stack handlers.
        if (!el.dataset.itemActionBound) {
            el.dataset.itemActionBound = "1";
            el.addEventListener("click", (ev)=>{
                ev?.preventDefault?.();
                ev?.stopPropagation?.();
                const interactionState = String((el as HTMLElement)?.dataset?.interactionState || "");
                const blockedByInteraction = interactionState === "onGrab" || interactionState === "onMoving" || interactionState === "onRelax";
                if (!blockedByInteraction && !MOCElement(ev?.target as any, '[data-interaction-state="onMoving"],[data-interaction-state="onGrab"],[data-interaction-state="onRelax"]')) {
                    runItemAction(item, undefined, { event: ev, initiator: el }, getSpeedDialViewOpener() || makeView);
                }
            });
            el.addEventListener("dblclick", (ev)=>{
                ev?.preventDefault?.();
                ev?.stopPropagation?.();
                openItemEditor(item);
            });
        }
    }

    if (!interactive || el.dataset.layer === "labels") {
        el.dataset.layer = "labels";
        el.style.pointerEvents = "none";
        if (el.dataset.cellBound !== "true") {
            el.dataset.cellBound = "true";
            bindCell(el, args);
        } else {
            applyVisualCell(el, item, root);
        }
    }
    if (el.dataset.layer === "icons") {
        const dragItem = { id: item.id, cell: getItemCell(item) };
        const bindDrag = (mountedRoot: HTMLElement | null): void => {
            if (!mountedRoot || el.dataset.pointerInteractionBound === "true") return;
            el.dataset.pointerInteractionBound = "true";
            bindPointerInteraction(el, {
                root: mountedRoot,
                item: dragItem,
                items: speedDialItems as unknown as Array<{ id: string; cell: GridCell }>,
                getLayout: getGridLayout,
                getOrient: () => getRootOrient(mountedRoot),
                getSpan: (id) => getItemSpan(id),
                onCommitCell: (cell) => {
                    dragItem.cell = [...cell];
                    item.cell[0] = cell[0];
                    item.cell[1] = cell[1];
                    refreshRootCells(mountedRoot);
                    /* WHY: workspace snapshot used to keep the pre-drag cell and reset on reload. */
                    markSpeedDialUserEditBeforeHydrate();
                    persistSpeedDialItems();
                    emitSpeedDialMutation("update", item.id);
                },
                onSettled: () => {
                    requestAnimationFrame(() => syncAndroidWidgetHosts(mountedRoot));
                }
            });
        };
        bindDrag(root);
        if (!root || el.dataset.pointerInteractionBound !== "true") {
            const retryDrag = (): void => bindDrag(
                el.closest<HTMLElement>(".speed-dial-root")
                || el.ownerDocument?.getElementById("home")
            );
            queueMicrotask(retryDrag);
            if (typeof globalThis.requestAnimationFrame === "function") {
                globalThis.requestAnimationFrame(retryDrag);
            }
        }
        const widgetKind = getSpeedDialWidgetKind(item);
        if (widgetKind) {
            decorateWidgetHost(el, widgetKind);
            bindWidgetResize(el, item, {
                refresh: () => {
                    const mounted =
                        el.closest<HTMLElement>(".speed-dial-root") ||
                        el.ownerDocument?.getElementById("home") ||
                        root;
                    if (mounted) refreshRootCells(mounted);
                    requestAnimationFrame(() => syncAndroidWidgetHosts(mounted));
                }
            });
        }
        if (el.dataset.cellBound !== "true") {
            el.dataset.cellBound = "true";
            bindCell(el, args);
        } else {
            applyVisualCell(el, item, root);
        }
        ensureShapedUnderSibling(el, item);
        if (!shouldHideShapedUnder(el) && !findShapedUnder(el)) {
            queueMicrotask(() => ensureShapedUnderSibling(el, item));
            if (typeof globalThis.requestAnimationFrame === "function") {
                globalThis.requestAnimationFrame(() => ensureShapedUnderSibling(el, item));
            }
        }
    }
};

const resolveCellFromGrid = (
    grid: HTMLElement | null,
    coordinate: [number, number] | null | undefined
): GridCell => {
    if (!grid || !coordinate) return [0, 0];
    const rect = grid.getBoundingClientRect();
    const styles = getComputedStyle(grid);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const size: [number, number] = [
        Math.max(1, rect.width - paddingLeft - paddingRight),
        Math.max(1, rect.height - paddingTop - paddingBottom)
    ];
    const point: [number, number] = [
        coordinate[0] - rect.left - paddingLeft,
        coordinate[1] - rect.top - paddingTop
    ];
    return pointToLogicalCell(point, size, getGridLayout(), getRootOrient(grid.closest(".speed-dial-root")));
};

const deriveCellFromEvent = (ev?: MouseEvent): GridCell => {
    const grid = document.querySelector<HTMLElement>('#home .speed-dial-grid[data-grid-layer="icons"]')
        || document.querySelector<HTMLElement>("#home .speed-dial-grid:last-of-type")
        || document.querySelector<HTMLElement>("#home .speed-dial-grid");
    return resolveCellFromGrid(grid, ev ? [ev.clientX, ev.clientY] : null);
};

const deriveCellFromCoordinate = (coordinate: [number, number]): GridCell => {
    const grid = document.querySelector<HTMLElement>('#home .speed-dial-grid[data-grid-layer="icons"]')
        || document.querySelector<HTMLElement>("#home .speed-dial-grid:last-of-type")
        || document.querySelector<HTMLElement>("#home .speed-dial-grid");
    return resolveCellFromGrid(grid, coordinate);
};

const deriveCellFromAnchor = (): GridCell => {
    const ref = getCoordinateRef();
    return deriveCellFromCoordinate([ref[0].value, ref[1].value]);
};

const looksLikeImageFile = (file?: File | null): boolean => {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    if (type.startsWith("image/")) return true;
    const name = String(file.name || "").trim().toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
    return WALLPAPER_EXTENSIONS.has(ext);
};

/** Prefer `files`, then DataTransferItemList (clipboard paste often only populates `items`). */
const extractImageFileFromTransfer = (dt: DataTransfer | null | undefined): File | null => {
    if (!dt) return null;
    for (const file of Array.from(dt.files || [])) {
        if (looksLikeImageFile(file)) return file;
    }
    const items = dt.items;
    if (!items?.length) return null;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || item.kind !== "file") continue;
        const type = String(item.type || "").toLowerCase();
        if (type && !type.startsWith("image/")) continue;
        const file = item.getAsFile?.();
        if (looksLikeImageFile(file)) return file;
    }
    return null;
};

const applyWallpaperFromImageFile = (file: File): void => {
    void setAppWallpaperFromBlob(file)
        .then(() => {
            wallpaperState.src = getWallpaperStoragePointer() || WALLPAPER_IDB_MARKER;
            persistWallpaper();
            showSuccess("Wallpaper updated");
        })
        .catch((err) => {
            console.warn(err);
            showError("Failed to set wallpaper");
        });
};

/** Async Clipboard API fallback when paste event has empty `clipboardData` image slots. */
const readImageFileFromClipboardApi = async (): Promise<File | null> => {
    try {
        const read = navigator.clipboard?.read;
        if (typeof read !== "function") return null;
        const items = await read.call(navigator.clipboard);
        for (const item of items || []) {
            const type = item.types?.find?.((t) => String(t).toLowerCase().startsWith("image/"));
            if (!type) continue;
            const blob = await item.getType(type);
            if (!blob) continue;
            const ext = type.includes("jpeg") || type.includes("jpg") ? "jpg" : type.includes("webp") ? "webp" : "png";
            return new File([blob], `wallpaper-${Date.now()}.${ext}`, { type: blob.type || type });
        }
    } catch (e) {
        console.warn("[speed-dial] clipboard.read image failed", e);
    }
    return null;
};

const parseUrlFromHtml = (html?: string | null): string | null => {
    const source = String(html || "").trim();
    if (!source) return null;
    const hrefMatch = source.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = String(hrefMatch?.[1] || "").trim();
    if (!href) return null;
    // WHY: relative hrefs resolve to the shell origin and create bogus tiles; require absolute http(s).
    if (!/^https?:\/\//i.test(href) && !href.startsWith("//")) return null;
    return href;
};

/** Bare host or host/path without scheme (github.com, www.youtube.com/watch?v=1). */
const BARE_HOST_PATTERN =
    /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i;

/**
 * Normalize a pasted/dropped URL candidate to an absolute http(s) URL.
 * WHY: users paste bare domains from messengers ("github.com") without scheme;
 * relative hrefs would resolve against the shell origin and produce junk tiles.
 * Returns the canonical href string, or null when not a usable http(s) URL.
 */
const normalizePasteUrl = (text: string): string | null => {
    let value = String(text || "").trim();
    if (!value) return null;
    // COMPAT: some apps wrap URLs in angle brackets (<https://…>).
    if (value.startsWith("<") && value.endsWith(">")) {
        value = value.slice(1, -1).trim();
    }
    try {
        const parsed = new URL(value);
        if (/^https?:$/i.test(parsed.protocol)) return parsed.href;
        /* tel / mailto / tg / calendar content — keep absolute for smart parse. */
        if (/^(tel|mailto|tg|telegram|content):$/i.test(parsed.protocol)) return parsed.href;
        return null;
    } catch {
        /* not an absolute URL — try bare-domain scheme fixup below */
    }
    if (!/\s/.test(value) && BARE_HOST_PATTERN.test(value)) {
        try {
            const parsed = new URL(`https://${value.replace(/^\/+/, "")}`);
            if (/^https?:$/i.test(parsed.protocol)) return parsed.href;
        } catch {
            /* ignore */
        }
    }
    return null;
};

/**
 * Flatten transfer payloads into URL candidates.
 * WHY: `text/uri-list` is often multiline with `#` comments (Mozilla / bookmark drags);
 * treating the whole blob as one string makes normalizePasteUrl return null.
 */
const extractUrlCandidatesFromTransfer = (transfer: DataTransfer): string[] => {
    const out: string[] = [];
    const pushBlob = (raw: string) => {
        for (const line of String(raw || "").split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            out.push(trimmed);
        }
    };
    pushBlob(transfer.getData("text/uri-list") || "");
    // COMPAT: Firefox bookmark / link drag (`url\ntitle`).
    const moz = String(transfer.getData("text/x-moz-url") || "").trim();
    if (moz) {
        const first = moz.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("#"));
        if (first) out.push(first.trim());
    }
    pushBlob(transfer.getData("text/plain") || "");
    return out;
};

const parseShortcutFromTransfer = (transfer: DataTransfer | null | undefined, suggestedCell: GridCell): SpeedDialItem | null => {
    if (!transfer) return null;
    const plain = String(transfer.getData("text/plain") || "").trim();
    const html = String(transfer.getData("text/html") || "").trim();
    const jsonMime = String(transfer.getData("application/json") || "").trim();
    /* WHY: pretty shortcut JSON contains href lines — parse the envelope before URL scraping. */
    if (looksLikeSpeedDialShortcutJson(plain)) {
        const item = parseSpeedDialItemFromJSON(plain, suggestedCell);
        if (item) return item;
    }
    if (looksLikeSpeedDialShortcutJson(jsonMime)) {
        const item = parseSpeedDialItemFromJSON(jsonMime, suggestedCell);
        if (item) return item;
    }
    // WHY: prefer the Explorer JSON envelope (bookmark title + href/path) over
    // a hostname-only `open-link` tile built from uri-list.
    if (jsonMime) {
        const item = parseSpeedDialItemFromJSON(jsonMime, suggestedCell);
        if (item) return item;
    }
    // WHY: prefer uri-list / moz-url / plain lines over HTML — HTML often carries relative chrome links.
    for (const candidate of extractUrlCandidatesFromTransfer(transfer)) {
        const normalized = normalizePasteUrl(candidate);
        if (normalized) {
            const item = parseSpeedDialItemFromURL(normalized, suggestedCell);
            if (item) return item;
            continue;
        }
        if (isSpeedDialVirtualPath(candidate)) {
            const item = parseSpeedDialItemFromVirtualPath(candidate, suggestedCell);
            if (item) return item;
        }
        if (looksLikeJsonObjectForDrop(candidate)) {
            const item = parseSpeedDialItemFromJSON(candidate, suggestedCell);
            if (item) return item;
        }
    }
    // Fallback: anchor href from HTML (only absolute http(s) per parseUrlFromHtml).
    const href = parseUrlFromHtml(html);
    if (href) {
        const normalized = normalizePasteUrl(href);
        if (normalized) {
            const item = parseSpeedDialItemFromURL(normalized, suggestedCell);
            if (item) return item;
        }
    }
    // Last resort: shortcut JSON envelope, virtual path, or smart tel/mailto/telegram/date.
    if (plain) {
        const item = parseSpeedDialItemFromJSON(plain, suggestedCell);
        if (item) return item;
        if (isSpeedDialVirtualPath(plain)) {
            return parseSpeedDialItemFromVirtualPath(plain, suggestedCell);
        }
        const smart = parseSpeedDialItemFromSmartText(plain, suggestedCell);
        if (smart) return smart;
    }
    return null;
};

const looksLikeJsonObjectForDrop = (raw: string): boolean => {
    const t = String(raw || "").trim();
    return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
};

/** True when the event is on the launcher desktop (not a nested window/editor). */
const isEditablePasteTarget = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return !!el.closest?.(
        'input, textarea, select, [contenteditable="true"], [role="textbox"], .speed-dial-editor, ui-modal, dialog'
    );
};

const resolveDeepActiveElement = (): HTMLElement | null => {
    let active = document.activeElement as HTMLElement | null;
    while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement as HTMLElement;
    }
    return active;
};

const isHomeWorkspaceSurface = (event: Event): boolean => {
    const current = event.currentTarget as HTMLElement | null;
    if (current?.id === "home" || current?.classList?.contains("speed-dial-root")) return true;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.("#home, .speed-dial-root")) return true;
    // Capture listeners on `document` — currentTarget is document; walk composedPath instead.
    if (typeof event.composedPath === "function") {
        for (const node of event.composedPath()) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.id === "home" || node.classList.contains("speed-dial-root")) return true;
        }
    }
    /*
     * WHY: Ctrl+V paste targets body/document, not #home. Accept when the home
     * desktop is mounted/visible and focus is not inside an unrelated editor.
     */
    if (event instanceof ClipboardEvent) {
        const home = document.getElementById("home");
        if (!home?.isConnected) return false;
        try {
            if (home.checkVisibility && !home.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) {
                return false;
            }
        } catch {
            /* ignore */
        }
        const deep = resolveDeepActiveElement();
        if (isEditablePasteTarget(deep) && !home.contains(deep)) return false;
        if (home.matches(":hover") || home.contains(deep) || deep === home) return true;
        // Visible launcher with no conflicting editable focus → paste creates a link tile.
        if (!deep || deep === document.body || deep === document.documentElement) return true;
        // Focus elsewhere in the shell chrome (taskbar etc.) still allows desktop paste.
        if (!isEditablePasteTarget(deep)) return true;
        return false;
    }
    return (
        isInFocus(target, "#home") ||
        isInFocus(
            target,
            "#home:is(:hover, :focus, :focus-visible), #home:has(:hover, :focus, :focus-visible)",
            "child"
        )
    );
};

const copySpeedDialItemAction = (item: SpeedDialItem) => async (): Promise<void> => {
    try {
        await copySpeedDialItemToClipboard(item);
        showSuccess("Shortcut copied");
    } catch (e) {
        console.warn(e);
        showError("Failed to copy shortcut");
    }
};

const pasteSpeedDialItemAction = (suggestedCell: GridCell) => async (): Promise<void> => {
    try {
        const speedDialItem = await createSpeedDialItemFromClipboard(suggestedCell);
        if (!speedDialItem) {
            showError("Clipboard does not contain a valid URL or shortcut JSON");
            return;
        }
        addSpeedDialItem(speedDialItem);
        persistSpeedDialItems();
        persistSpeedDialMeta();
        showSuccess("Shortcut created from clipboard");
    } catch (e) {
        console.warn(e);
        const msg = String((e as Error)?.message || e || "");
        if (/empty/i.test(msg)) {
            showError("Clipboard is empty");
        } else if (/unavailable|denied|failed|permission/i.test(msg)) {
            showError("Could not read clipboard on this device");
        } else {
            showError("Failed to paste shortcut");
        }
    }
};

const cloneToOtherSidesEntries = (item: SpeedDialItem): ContextMenuEntry[] =>
    listWorkspacePages()
        .filter((page) => page.id !== getActiveWorkspaceId())
        .map((page) => ({
            id: `clone-to-${page.id}`,
            label: page.label,
            icon: "copy",
            action: () => {
                if (cloneSpeedDialItemToWorkspace(item, page.id)) {
                    showSuccess(`Copied to ${page.label}`);
                    return;
                }
                showError(`Could not copy to ${page.label}`);
            }
        }));

const createMenuEntryForAction = (actionId: string, item: SpeedDialItem, fallbackLabel: string = "", makeView?: any) => {
    const descriptor = buildDescriptor(item) as any;
    return {
        id: actionId,
        label: getSpeedDialActionLabels().get(actionId)?.(descriptor) || fallbackLabel,
        icon: getSpeedDialActionIcons().get(actionId) || "command",
        action: (initiator: HTMLElement, _menuItem: any, ev: MouseEvent)=>runItemAction(item, actionId, { event: ev, initiator }, makeView)
    };
};

//
export function makeWallpaper() {
    const oRef = orientRef();
    const srcRef = stringRef(DEFAULT_WALLPAPER_SRC);
    const applySrc = (paintUrl: string): void => {
        srcRef.value = paintUrl || DEFAULT_WALLPAPER_SRC;
    };
    /* WHY: custom wallpapers are IDB-backed (`idb:rs-wallpaper`); blob:/data: URLs must not be persisted to localStorage. */
    affected([wallpaperState, "src"], (s) => {
        const raw = String(s?.src || (typeof s == "string" ? s : "") || "").trim();
        if (!raw || raw === WALLPAPER_IDB_MARKER || raw.startsWith("idb:") || raw.startsWith("blob:")) {
            void resolveAppWallpaperUrl().then(applySrc).catch(() => applySrc(DEFAULT_WALLPAPER_SRC));
            return;
        }
        if (raw.startsWith("/") && !raw.startsWith("/user")) {
            /* Asset / app path — paint directly; also try OPFS under /user for user copies. */
            applySrc(raw);
            void provide("/user" + raw)
                ?.then?.((got) => {
                    const file = asProvidedFile(got);
                    if (file) applySrc(URL.createObjectURL(file));
                })
                ?.catch?.(() => { /* keep asset path */ });
            return;
        }
        void provide(raw.startsWith("/user") ? raw : "/user" + raw)
            ?.then?.((got) => {
                const file = asProvidedFile(got);
                if (file) applySrc(URL.createObjectURL(file));
            })
            ?.catch?.(() => {
                void resolveAppWallpaperUrl().then(applySrc).catch(() => applySrc(DEFAULT_WALLPAPER_SRC));
            });
    });
    const CE = H`<canvas slot="backdrop" style="position: fixed; pointer-events: none; min-inline-size: 0px; min-block-size: 0px; inline-size: stretch; block-size: stretch; max-block-size: stretch; max-inline-size: stretch; transform: none; scale: 1; inset: 0; pointer-events: none;" data-orient=${oRef} is="ui-canvas" data-src=${srcRef}></canvas>`;
    return CE;
}

//
const pickWallpaper = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            /* WHY: persist bytes to IDB; localStorage only holds the marker pointer. */
            await setAppWallpaperFromBlob(file);
            wallpaperState.src = getWallpaperStoragePointer() || WALLPAPER_IDB_MARKER;
            persistWallpaper();
            showSuccess("Wallpaper updated");
        } catch (e) {
            console.warn(e);
            showError("Failed to set wallpaper");
        }
    };
    input.click();
};

//
const handleSpeedDialPaste = async (event: ClipboardEvent, suggestedCell?: GridCell) => {
    if (!isHomeWorkspaceSurface(event)) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
        const targetCell = suggestedCell ?? deriveCellFromAnchor();
        const fromClipboardData = parseShortcutFromTransfer(event.clipboardData, targetCell);
        const item = fromClipboardData || await createSpeedDialItemFromClipboard(targetCell);
        if (!item) {
            return false;
        }

        addSpeedDialItem(item);
        persistSpeedDialItems();
        persistSpeedDialMeta();
        showSuccess("Shortcut created from clipboard");
        return true;
    } catch (e) {
        console.warn("Failed to paste speed dial item:", e);
        return false;
    }
};

//
const handleWallpaperDropOrPaste = (event: DragEvent | ClipboardEvent) => {
    if (!isHomeWorkspaceSurface(event)) return;

    const isPaste = event instanceof ClipboardEvent;
    const targetEl = event.target as HTMLElement | null;
    const droppedOnItem = !!targetEl?.closest?.("[data-speed-dial-item]");
    // WHY: place the new tile under the pointer for drops; paste uses last pointer anchor.
    const suggestedCell =
        !isPaste && event instanceof DragEvent
            ? deriveCellFromEvent(event)
            : deriveCellFromAnchor();
    const dataTransfer = isPaste ? (event as ClipboardEvent).clipboardData : (event as DragEvent).dataTransfer;

    /*
     * INVARIANT: image paste/drop on empty desktop → wallpaper; http(s) → open-link tile.
     * WHY: prior paste path returned after URL miss and never reached image handling;
     * clipboard screenshots usually live in `items`, not `files`.
     */
    const imageFile = !droppedOnItem ? extractImageFileFromTransfer(dataTransfer) : null;
    if (imageFile) {
        event.preventDefault();
        event.stopPropagation();
        /*
         * WHY: CWSP-shell Open & share may send the photo to the viewer instead of wallpaper.
         * Host listens for `cwsp:shell-image-open` and preventDefault when it owns the file.
         */
        const policyEv = new CustomEvent("cwsp:shell-image-open", {
            bubbles: true,
            cancelable: true,
            detail: { file: imageFile, source: isPaste ? "paste" : "drop" }
        });
        try {
            window.dispatchEvent(policyEv);
        } catch {
            /* ignore */
        }
        if (!policyEv.defaultPrevented) applyWallpaperFromImageFile(imageFile);
        // Best-effort OPFS mirror (non-blocking); IDB is the source of truth for paint.
        queueMicrotask(() => {
            try {
                handleIncomingEntries(dataTransfer, "/images/wallpaper/", null, (file) => {
                    if (!looksLikeImageFile(file)) return;
                });
            } catch (e) {
                console.warn(e);
            }
        });
        return;
    }

    const parsed = parseShortcutFromTransfer(dataTransfer, suggestedCell);
    if (parsed) {
        event.preventDefault();
        event.stopPropagation();
        /*
         * Task 5: when SpeedDial is mirroring a `/bookmarks/…` path, a dropped
         * http(s) URL should land in the live Chrome Bookmarks tree (via the
         * registered bookmarks FsBackend `createUrl`) instead of becoming a
         * curated link tile. WHY: the mirror grid is a view of the bookmarks
         * store; creating a curated tile for a URL the user expected to appear
         * in their Chrome bookmark manager would silently split the source of
         * truth. We resolve the URL from the just-created item's meta (set by
         * `parseSpeedDialItemFromURL` via `ensureSpeedDialMeta`), then call
         * `createUrl` and refresh the mirror listing. The transient curated
         * item is discarded (it was never `addSpeedDialItem`-ed).
         *
         * COMPAT: outside CRX, or when the bookmarks backend is not registered,
         * or the mirror path is not under `/bookmarks/`, we fall through to the
         * existing curated-tile creation so the drop still does something
         * useful. This keeps the shell origin (no `chrome.bookmarks`) working.
         */
        const mirrorPath = getSpeedDialMirrorPath();
        if (mirrorPath && mirrorPath.startsWith("/bookmarks/")) {
            const backend = resolveFsBackend(mirrorPath);
            if (backend?.createUrl) {
                const meta = getSpeedDialMeta(parsed.id);
                const dropHref = String(meta?.href || "");
                if (/^https?:\/\//i.test(dropHref)) {
                    const title = String(getRefValue(parsed.label, dropHref)) || dropHref;
                    void Promise.resolve(backend.createUrl(mirrorPath, title, dropHref))
                        .then(() => refreshSpeedDialMirror())
                        .then(() => showSuccess("Bookmark created from dropped link"))
                        .catch((e) => {
                            console.warn(e);
                            showError("Failed to create bookmark");
                        });
                    return;
                }
            }
        }
        addSpeedDialItem(parsed);
        persistSpeedDialItems();
        persistSpeedDialMeta();
        showSuccess(isPaste ? "Shortcut created from pasted link" : "Shortcut created from dropped link");
        return;
    }

    if (isPaste) {
        // Clipboard API image fallback (some hosts omit image from clipboardData).
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
            if (!droppedOnItem) {
                const apiImage = await readImageFileFromClipboardApi();
                if (apiImage) {
                    const policyEv = new CustomEvent("cwsp:shell-image-open", {
                        bubbles: true,
                        cancelable: true,
                        detail: { file: apiImage, source: "paste" }
                    });
                    try {
                        window.dispatchEvent(policyEv);
                    } catch {
                        /* ignore */
                    }
                    if (!policyEv.defaultPrevented) applyWallpaperFromImageFile(apiImage);
                    return;
                }
            }
            await handleSpeedDialPaste(event as ClipboardEvent, suggestedCell);
        })();
    }
};

const acceptHomeLinkDragOver = (ev: DragEvent) => {
    if (!isHomeWorkspaceSurface(ev)) return;
    // WHY: must preventDefault so browser allows drop of Files / uri-list onto the desktop.
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
};

/** Install once: document paste/drop so Ctrl+V works without #home focus. */
const ensureHomeTransferListeners = (): void => {
    if (homeTransferListenersBound || typeof document === "undefined") return;
    homeTransferListenersBound = true;
    document.addEventListener(
        "paste",
        (event: ClipboardEvent) => {
            void handleWallpaperDropOrPaste(event);
        },
        true
    );
    document.addEventListener(
        "keydown",
        (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (event.key !== "c" && event.key !== "C") return;
            if (isEditablePasteTarget(resolveDeepActiveElement())) return;
            const home = document.getElementById("home");
            if (!home?.isConnected) return;
            const item = findSpeedDialItem(lastFocusedSpeedDialId);
            if (!item) return;
            event.preventDefault();
            void copySpeedDialItemAction(item)();
        },
        true
    );
    document.addEventListener(
        "dragover",
        (event: DragEvent) => {
            const home = document.getElementById("home");
            if (!home) return;
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            if (!path.includes(home) && !home.contains(event.target as Node)) return;
            acceptHomeLinkDragOver(event);
        },
        true
    );
    document.addEventListener(
        "drop",
        (event: DragEvent) => {
            const home = document.getElementById("home");
            if (!home) return;
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            if (!path.includes(home) && !home.contains(event.target as Node)) return;
            handleWallpaperDropOrPaste(event);
        },
        true
    );
};


//
// Mirror mode rendering (Task 3).
//
/*
 * WHY: mirror tiles are display-only — they are not in `speedDialItems` /
 * `speedDialMeta`, so the curated drag/edit handlers do not apply. Clicking a
 * mirror tile runs its action (`open-path` or `open-link`) directly through
 * the action registry with a context carrying the tile's path/href.
 */
const runMirrorItemAction = (item: any, makeView?: any): void => {
    if (!item) return;
    const actionId = String(item.action || "open-path");
    const handler = getSpeedDialActionRegistry().get(actionId);
    if (!handler) {
        showError("Action is unavailable");
        return;
    }
    const context = {
        id: item.id,
        items: mirrorSpeedDialItems,
        meta: speedDialMeta,
        action: actionId,
        viewMaker: makeView,
        path: item.path
    };
    try {
        void handler(context as any, item);
    } catch (error) {
        console.warn(error);
        showError("Failed to run action");
    }
};

/*
 * WHY: mirror render helpers live at module scope (outside `SpeedDial`), so
 * they cannot close over the `makeView` parameter. Resolve the opener lazily
 * on click instead — hosts register it via `setSpeedDialViewOpener` before
 * the grid mounts.
 */
const resolveMirrorOpener = (makeView?: any) => makeView || getSpeedDialViewOpener();

const attachMirrorItemNode = (item: any, el?: HTMLElement | null, makeView?: any): void => {
    if (!el) return;
    const root = el.closest<HTMLElement>(".speed-dial-root") || el.ownerDocument?.getElementById("home");
    el.dataset.id = item.id;
    el.dataset.speedDialItem = "true";
    el.dataset.mirrorItem = "true";
    const sync = (): void => {
        const orient = getRootOrient(root);
        const layout = getGridLayout();
        const logicalCell: GridCell = [readCellAxis(item.cell?.[0]), readCellAxis(item.cell?.[1])];
        const visualCell = logicalToVisualCell(logicalCell, layout, orient);
        el.style.setProperty("--cell-x", String(logicalCell[0]));
        el.style.setProperty("--cell-y", String(logicalCell[1]));
        el.style.setProperty("--cell-column", String(visualCell[0] + 1));
        el.style.setProperty("--cell-row", String(visualCell[1] + 1));
        el.dataset.cellColumn = String(visualCell[0] + 1);
        el.dataset.cellRow = String(visualCell[1] + 1);
        if (el.dataset.layer === "labels") {
            el.style.setProperty("grid-column", `${visualCell[0] + 1} / span 1`, "important");
            el.style.setProperty("grid-row", `${visualCell[1] + 1} / span 1`, "important");
        }
    };
    sync();
    if (el.dataset.layer === "icons") ensureShapedUnderSibling(el, item);
    if (!el.dataset.mirrorActionBound) {
        el.dataset.mirrorActionBound = "1";
        el.addEventListener("click", (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            runMirrorItemAction(item, resolveMirrorOpener(makeView));
        });
    }
};

const renderMirrorIconItem = (item: any, makeView?: any) => {
    const iconUrl = String(item?.iconUrl || "");
    const fallbackIcon = String(item?.icon || "link");
    const display = inferIconDisplay({
        iconDisplay: item?.iconDisplay,
        iconUrl,
        isBookmarkFavicon: Boolean(iconUrl)
    });
    const iconNode =
        display === "glyph" || !iconUrl
            ? H`<ui-icon icon=${fallbackIcon}></ui-icon>`
            : createTileUiIconElement({
                  display,
                  glyph: fallbackIcon,
                  resourceUrl: iconUrl,
                  className: "ui-ws-item-icon-native"
              });
    return H`<div data-shape="squircle" data-id=${item.id} class="ui-ws-item ui-ws-item-icon shaped" data-speed-dial-item data-layer="icons" data-mirror-item ref=${(el: HTMLElement) => attachMirrorItemNode(item, el, makeView)}>
        ${iconNode}
    </div>`;
};

const renderMirrorLabelItem = (item: any, makeView?: any) => {
    const labelRef = item?.label;
    return H`<div data-id=${item.id} class="ui-ws-item ui-ws-item-label" data-speed-dial-item data-layer="labels" data-mirror-item style=${labelLayerStyle(item)} ref=${(el: HTMLElement) => attachMirrorItemNode(item, el, makeView)}>
        <span>${labelRef ?? ""}</span>
    </div>`;
};

export function SpeedDial(makeView: any) {
    getLayout();
    getCoordinateRef();
    ensureVirtualKeyboardOverlay();
    updateVP();
    /*
     * WHY: HomeView often registers the opener first, then mounts via OrientDesktop without
     * re-passing makeView. Do not wipe a live opener with null — only replace when given a function.
     */
    if (typeof makeView === "function") {
        setSpeedDialViewOpener(makeView);
    }
    ensureHomeTransferListeners();
    // WHY: fetch the mirror listing once SpeedDial mounts so mirror tiles
    // appear alongside curated ones when mirror mode was persisted last boot.
    void refreshSpeedDialMirror();
    stripStaleWidgetMetaFromShortcuts();
    bootWorkspacePages();
    installLauncherBackStack();
    bindWorkspacePageHotkeys();
    const hostEvents = globalThis as { __CWSP_SD_HOST_EVENTS_V1__?: boolean };
    if (!hostEvents.__CWSP_SD_HOST_EVENTS_V1__) {
        hostEvents.__CWSP_SD_HOST_EVENTS_V1__ = true;
        queueMicrotask(() => syncWidgetsAfterGridChange());
        window.addEventListener(WORKSPACE_PAGE_EVENT, () => {
            hideAndroidWidgetHosts();
            scheduleRootCellRefresh();
            requestAnimationFrame(() => syncWidgetsAfterGridChange());
        });
        if (typeof ResizeObserver === "function") {
            const ro = new ResizeObserver(() => syncAndroidWidgetHosts());
            queueMicrotask(() => {
                const home = document.getElementById("home");
                if (home) ro.observe(home);
            });
        }
        window.addEventListener("resize", () => syncAndroidWidgetHosts());
        document.addEventListener("env-app-menu-open", () => hideAndroidWidgetHosts());
        document.addEventListener("env-app-menu-close", () => syncWidgetsAfterGridChange());
    }
    const columnsRef = propRef(gridLayoutState, "columns", 4);
    const rowsRef = propRef(gridLayoutState, "rows", 8);
    const shapeRef = propRef(gridLayoutState, "shape", "square");

    const tileShapeForItem = (item: SpeedDialItem): ReturnType<typeof propRef> => {
        return propRef(getSpeedDialMeta(item.id) || {}, "shape", getDefaultTileShape());
    };

    //
    const renderIconItem = (item: SpeedDialItem)=>{
        const widgetKind = getSpeedDialWidgetKind(item);
        if (widgetKind) {
            const cached = reuseWidgetHost(item.id, widgetKind);
            if (cached) return cached;
            const widget = createWidgetNode(widgetKind, item);
            /* INVARIANT: widgets are shapeless — no tile plate, clip, or under-shadow.
             * Do not stamp JS `grid-column` — placement is `--cell-x` → `--cs-grid-*` like icons. */
            const host = H`<div data-shape="none" data-id=${item.id} class="ui-ws-item ui-ws-item-icon sd-widget-host" data-speed-dial-item data-layer="icons" data-widget=${widgetKind} ref=${(el) => attachItemNode(item, el as HTMLElement, true, makeView)}>
                ${widget}
            </div>`;
            rememberWidgetHost(item.id, widgetKind, host as HTMLElement);
            return host;
        }
        const model = readTileIconModel(item);
        const pendingShortcut =
            model.display !== "glyph" &&
            Boolean(model.shortcutRef) &&
            !model.resourceUrl &&
            !isAndroidIconRef(model.customUrl);
        const iconNode = createTileUiIconElement({
            display: pendingShortcut ? "glyph" : model.display,
            glyph: model.fallbackIcon,
            resourceUrl: pendingShortcut ? undefined : model.resourceUrl || undefined,
            launcher: model.launchApp || Boolean(model.shortcutRef),
            className: "ui-ws-item-icon-native"
        });
        return H`<div data-shape=${tileShapeForItem(item)} data-id=${item.id} class="ui-ws-item ui-ws-item-icon shaped" data-speed-dial-item data-layer="icons" data-icon-display=${model.display} ref=${(el) => {
            const host = el as HTMLElement;
            stampTileHostAttrs(host, item, model);
            attachItemNode(item, host, true, makeView);
            if (iconNode instanceof HTMLElement) {
                bindTileIconResource(host, iconNode, item, model);
            }
        }}>
            ${iconNode}
        </div>`;
    };

    const renderLabelItem = (item: SpeedDialItem) => {
        const labelRef = (item as any)?.label;
        const widgetKind = getSpeedDialWidgetKind(item);
        return H`<div data-id=${item.id} class="ui-ws-item ui-ws-item-label" data-speed-dial-item data-layer="labels" data-widget=${widgetKind || undefined} style=${labelLayerStyle(item)} ref=${(el) => attachItemNode(item, el as HTMLElement, false, makeView)}>
            <span>${labelRef ?? ""}</span>
        </div>`;
    };

    const box = H`<div slot="underlay" style="pointer-events: auto; position: relative; contain: none; overflow: visible; display: grid;" id="home" class="speed-dial-root" tabindex="-1" ref=${(el: HTMLElement) => {
        bindRootOrientation(el);
        mountCoreRail(el);
        mountChromeRail(el);
    }} on:dragover=${(ev: DragEvent) => acceptHomeLinkDragOver(ev)} on:drop=${(ev: DragEvent) => handleWallpaperDropOrPaste(ev)} on:paste=${(ev: ClipboardEvent) => void handleWallpaperDropOrPaste(ev)} prop:onPaste=${async (ev: ClipboardEvent) => await handleWallpaperDropOrPaste(ev)}>
        <div class="speed-dial-grid speed-dial-label-layer speed-dial-grid--labels ui-launcher-grid" data-layer="items" data-grid-layer="labels" data-grid-columns=${columnsRef} data-grid-rows=${rowsRef} data-grid-shape=${shapeRef}>
            ${M(speedDialItems, renderLabelItem)}
            ${M(mirrorSpeedDialItems, renderMirrorLabelItem)}
        </div>
        <div class="speed-dial-grid speed-dial-icon-layer speed-dial-grid--icons ui-launcher-grid" data-layer="items" data-grid-layer="icons" data-grid-columns=${columnsRef} data-grid-rows=${rowsRef} data-grid-shape=${shapeRef}>
            ${M(speedDialItems, renderIconItem)}
            ${M(mirrorSpeedDialItems, renderMirrorIconItem)}
        </div>
    </div>`;

    const itemsAffected = globalThis as { __CWSP_SD_ITEMS_AFFECTED_V1__?: boolean };
    if (!itemsAffected.__CWSP_SD_ITEMS_AFFECTED_V1__) {
        itemsAffected.__CWSP_SD_ITEMS_AFFECTED_V1__ = true;
        affected(speedDialItems, (_items, _index, prev, operation) => {
            if (operation === "remove" || operation === "delete") {
                const id = String(prev?.id || "").trim();
                if (id) {
                    disposeWidgetNode(id);
                    document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((node) => {
                        if (!(node instanceof HTMLElement)) return;
                        if (
                            node.classList.contains("ui-ws-item-icon-under") ||
                            node.dataset.layer === "shadows"
                        ) {
                            node.remove();
                            return;
                        }
                        if (!findSpeedDialItem(id) && node.hasAttribute("data-speed-dial-item")) {
                            node.remove();
                        }
                    });
                }
                const home = currentHomeRoot();
                pruneOrphanUnders(home);
                requestAnimationFrame(() => syncWidgetsAfterGridChange(home));
            }
            scheduleRootCellRefresh();
        });
    }

    //
    return box;
}

//
const openItemEditor = (item?: SpeedDialItem, opts?: {
    suggestedCell?: GridCell;
    seed?: Partial<{ label: string; icon: string; action: string; view: string; href: string; description: string }>;
})=>{
    const workingItem = item ?? createEmptySpeedDialItem(opts?.suggestedCell ?? deriveCellFromAnchor());
    const isNew = !item;
    const workingMeta = ensureSpeedDialMeta(workingItem.id);
    const seed = opts?.seed || {};
    if (isNew && seed?.action) {
        workingItem.action = seed.action;
        workingMeta.action = seed.action;
    }
    if (isNew && seed?.label) {
        workingItem.label.value = seed.label;
    }
    if (isNew && seed?.icon) {
        workingItem.icon.value = seed.icon;
    }
    if (isNew && seed?.view) {
        workingMeta.view = seed.view;
    }
    if (isNew && seed?.href) {
        workingMeta.href = seed.href;
    }
    if (isNew && seed?.description) {
        workingMeta.description = seed.description;
    }
    const draft = {
        label: String(getRefValue(workingItem.label, "New shortcut") ?? "New shortcut"),
        icon: String(getRefValue(workingItem.icon, "sparkle") ?? "sparkle"),
        action: String(resolveItemAction(workingItem) || "open-view"),
        href: String(workingMeta?.href || ""),
        view: String(workingMeta?.view || ""),
        description: String(workingMeta?.description || ""),
        shape: String(workingMeta?.shape || getDefaultTileShape()),
        iconDisplay: String(
            normalizeIconDisplay(workingMeta?.iconDisplay) ||
                inferIconDisplay({
                    iconDisplay: workingMeta?.iconDisplay,
                    iconUrl: workingMeta?.iconUrl,
                    isLauncherApp: isLauncherAppSpeedDialItem(workingItem)
                })
        ),
        // Never prefill ephemeral blob: cache URLs into the editor (they die on reload).
        iconUrl: durableIconUrl(resolveSpeedDialIconUrl(workingItem.id, workingMeta?.iconUrl)),
        iconScale: String(workingMeta?.iconScale || "auto"),
        openLinkTarget: resolveItemOpenLinkTarget(workingMeta),
        packageName: String(workingMeta?.packageName || workingMeta?.iconCacheKey || ""),
        widgetKind: String(workingMeta?.widgetKind || getSpeedDialWidgetKind(workingItem) || "clock"),
        spanCols: getItemSpan(workingItem.id)[0],
        spanRows: getItemSpan(workingItem.id)[1],
        clockFormat: String(workingMeta?.clockFormat || "24h"),
        searchUrl: String(workingMeta?.searchUrl || "")
    };

    openShortcutEditor({
        mode: isNew ? "create" : "edit",
        initial: {
            label: draft.label,
            icon: draft.icon,
            action: draft.action,
            href: draft.href,
            view: draft.view,
            description: draft.description,
            shape: draft.shape,
            iconDisplay: draft.iconDisplay as IconDisplayMode,
            iconUrl: draft.iconUrl,
            iconScale: draft.iconScale,
            openLinkTarget: draft.openLinkTarget || defaultOpenLinkTargetForHref(draft.href),
            packageName: draft.packageName,
            widgetKind: draft.widgetKind,
            spanCols: draft.spanCols,
            spanRows: draft.spanRows,
            clockFormat: draft.clockFormat,
            searchUrl: draft.searchUrl
        },
        actionOptions: getActionOptions(),
        viewOptions: [...NAVIGATION_SHORTCUTS].map((shortcut: { view: string; label: string; icon: string }) => ({
            value: String(shortcut.view || ""),
            label: String(shortcut.label || shortcut.view || "")
        })),
        registerForBackNavigation: true,
        isViewAction: (value) => value === "open-view",
        /* WHY: windowed view tiles may also carry an Open-link URL (hash / deep link). */
        isHrefAction: (value) =>
            value === "open-link" || value === "copy-link" || value === "open-view" || value === "open-path",
        isWidgetAction: (value) => value === "widget",
        onSave: (next) => {
            workingItem.label.value = next.label;
            workingItem.icon.value = next.icon || "sparkle";
            workingItem.action = next.action || "open-view";
            workingMeta.action = workingItem.action;
            workingMeta.view = next.view;
            workingMeta.href = next.href;
            {
                const href = String(next.href || "").trim();
                const nativePath = /^\/(?:sdcard|saf)(?:\/|$)/i.test(href)
                    ? href
                    : href.replace(/^(?:\/storage\/emulated\/0|\/mnt\/sdcard)(?=\/|$)/i, "/sdcard");
                if (/^\/(?:sdcard|saf)(?:\/|$)/i.test(nativePath)) {
                    workingMeta.path = nativePath;
                    (workingItem as SpeedDialItem & { path?: string }).path = nativePath;
                    if (!workingItem.action || workingItem.action === "open-view") {
                        workingItem.action = "open-path";
                        workingMeta.action = "open-path";
                    }
                } else if (workingItem.action === "open-path" && href) {
                    workingMeta.path = href;
                    (workingItem as SpeedDialItem & { path?: string }).path = href;
                }
            }
            workingMeta.description = next.description;
            workingMeta.shape = next.shape;
            workingMeta.iconDisplay = normalizeIconDisplay(next.iconDisplay) || "glyph";
            {
                const scale = String(next.iconScale || "auto").trim().toLowerCase();
                workingMeta.iconScale =
                    !scale || scale === "auto" || scale === "default" || scale === "inherit"
                        ? "auto"
                        : scale;
            }
            {
                // WHY: blob: object URLs are session-only — persisting them blanks tiles after reload.
                const rawUrl = String(next.iconUrl || "").trim();
                workingMeta.iconUrl =
                    workingMeta.iconDisplay === "glyph" || !isDurableIconResourceUrl(rawUrl)
                        ? ""
                        : /^data:/i.test(rawUrl)
                          ? persistSpeedDialIconBlob(workingItem.id, rawUrl)
                          : rawUrl;
            }
            workingMeta.openLinkTarget = normalizeOpenLinkTarget(next.openLinkTarget);
            if (workingItem.action === "widget") {
                const kind = String(next.widgetKind || "").toLowerCase();
                const nextKind =
                    kind === "search" || kind === "android" || kind === "clock" ? kind : "clock";
                if (String(workingMeta.widgetKind || "") !== nextKind) {
                    disposeWidgetNode(workingItem.id);
                }
                workingMeta.widgetKind = nextKind;
                setItemSpan(workingItem.id, [
                    Math.max(1, Math.min(8, Number(next.spanCols) || 1)),
                    Math.max(1, Math.min(8, Number(next.spanRows) || 1))
                ]);
                workingMeta.clockFormat = String(next.clockFormat || "24h").toLowerCase() === "12h" ? "12h" : "24h";
                workingMeta.searchUrl = String(next.searchUrl || "").trim();
                workingMeta.action = "widget";
            } else {
                disposeWidgetNode(workingItem.id);
                delete workingMeta.widgetKind;
                workingMeta.spanCols = 1;
                workingMeta.spanRows = 1;
            }
            if (isNew) {
                addSpeedDialItem(workingItem);
            } else {
                upsertSpeedDialItem(workingItem);
            }
            persistSpeedDialItems();
            persistSpeedDialMeta();
            {
                const home = document.getElementById("home");
                if (home) refreshRootCells(home);
                requestAnimationFrame(() => syncAndroidWidgetHosts(home));
            }
            // Force chrome paint — upsert may keep the same item ref so M() won't rebuild icons/labels.
            const idSel = CSS.escape(String(workingItem.id));
            document
                .querySelectorAll<HTMLElement>(
                    `[data-speed-dial-item][data-id="${idSel}"][data-layer="icons"]`
                )
                .forEach((tile) => paintSpeedDialTileIcon(tile, workingItem));
            const labelText = String(next.label || "").trim();
            document
                .querySelectorAll<HTMLElement>(
                    `[data-speed-dial-item][data-id="${idSel}"][data-layer="labels"] span`
                )
                .forEach((span) => {
                    span.textContent = labelText;
                });
            showSuccess(isNew ? "Shortcut created" : "Shortcut updated");
        },
        onDelete: isNew
            ? undefined
            : () => {
                releaseAndroidWidget(workingItem);
                disposeWidgetNode(workingItem.id);
                removeSpeedDialItem(workingItem.id);
                persistSpeedDialItems();
                persistSpeedDialMeta();
                showSuccess("Shortcut removed");
            }
    });
};

export function createCtxMenu(makeView?: any) {
    getLayout();
    getCoordinateRef();
    if (typeof makeView === "function") {
        setSpeedDialViewOpener(makeView);
    }
    if (!ctxMenuBound) {
        ctxMenuBound = true;
        ensureHomeTransferListeners();
        document.addEventListener("contextmenu", (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            /* WHY: accept SpeedDial root / home-view host — not only `#home` (host id may be `home-view`). */
            const homeRoot =
                target?.closest?.("#home, .speed-dial-root, .env-home-workspace, [data-view='home']") ||
                null;
            if (!homeRoot) return;
            event.preventDefault();
            const targetEl = target?.closest?.("[data-speed-dial-item]");
            const itemId = targetEl?.getAttribute?.("data-id");
            const item = findSpeedDialItem(itemId);
            if (item?.id) lastFocusedSpeedDialId = item.id;
            const guessedCell = deriveCellFromEvent(event) ?? deriveCellFromAnchor();
            const otherSides = item ? cloneToOtherSidesEntries(item) : [];
            const toLeaf = (entry: any): ContextMenuEntry => ({
                id: String(entry?.id || "menu-action"),
                label: String(entry?.label || "Action"),
                icon: String(entry?.icon || "command"),
                action: () => entry?.action?.(targetEl as HTMLElement, entry, event)
            });
            const openViewTask = (view: string, params: Record<string, string> = {}) => {
                const opener = getSpeedDialViewOpener() || makeView;
                if (opener) {
                    opener(view, { ...params, newTask: "1" });
                    return;
                }
                getSpeedDialActionRegistry().get(`open-view-${view}`)?.({ id: "", items: speedDialItems, meta: speedDialMeta }, {});
            };

            const menuItems: ContextMenuEntry[] = item
                ? [
                    {
                        id: "open",
                        label: "Open",
                        icon: "play",
                        action: () => runItemAction(item, undefined, { event, initiator: targetEl as HTMLElement }, getSpeedDialViewOpener() || makeView)
                    },
                    {
                        id: "copy-shortcut",
                        label: "Copy shortcut",
                        icon: "copy",
                        action: copySpeedDialItemAction(item)
                    },
                    {
                        id: "paste-shortcut",
                        label: "Paste shortcut",
                        icon: "clipboard",
                        action: pasteSpeedDialItemAction(guessedCell)
                    },
                    {
                        id: "actions",
                        label: "Actions",
                        icon: "dots-three",
                        action: () => {},
                        children: [
                            toLeaf(createMenuEntryForAction(resolveItemAction(item) || "open-view", item, "Run action", getSpeedDialViewOpener() || makeView)),
                            ...(getSpeedDialMeta(item.id)?.href ? [
                                toLeaf(createMenuEntryForAction("open-link", item, "Open link", getSpeedDialViewOpener() || makeView)),
                                {
                                    id: "open-in-app",
                                    label: "Open in app…",
                                    icon: "arrow-square-out",
                                    action: () =>
                                        runItemAction(
                                            item,
                                            "open-link",
                                            {
                                                event,
                                                initiator: targetEl as HTMLElement,
                                                openLinkTarget: "external-app"
                                            },
                                            getSpeedDialViewOpener() || makeView
                                        )
                                },
                                toLeaf(createMenuEntryForAction("copy-link", item, "Copy link", getSpeedDialViewOpener() || makeView))
                            ] : []),
                            toLeaf(createMenuEntryForAction("copy-state-desc", item, "Copy shortcut", getSpeedDialViewOpener() || makeView))
                        ]
                    },
                    {
                        id: "open-in",
                        label: "Open In New",
                        icon: "app-window",
                        action: () => {},
                        children: [
                            {
                                id: "open-in-regular-window",
                                label: "Regular window",
                                icon: "app-window",
                                action: () => {
                                    const targetView = String(getSpeedDialMeta(item.id)?.view || "viewer");
                                    openViewTask(targetView, { windowType: "regular" });
                                }
                            },
                            {
                                id: "open-in-tabbed-window",
                                label: "Tabbed window",
                                icon: "rows-plus-bottom",
                                action: () => {
                                    const targetView = String(getSpeedDialMeta(item.id)?.view || "viewer");
                                    openViewTask(targetView, { windowType: "tabbed" });
                                }
                            }
                        ]
                    },
                    {
                        id: "manage",
                        label: "Manage",
                        icon: "wrench",
                        action: () => {},
                        children: [
                            { id: "edit", label: "Edit Properties", icon: "pencil-simple-line", action: ()=>openItemEditor(item) },
                            {
                                id: "duplicate",
                                label: "Duplicate here",
                                icon: "copy",
                                action: () => {
                                    if (addClonedSpeedDialItem(item)) {
                                        showSuccess("Shortcut duplicated");
                                        return;
                                    }
                                    showError("Could not duplicate shortcut");
                                }
                            },
                            ...(otherSides.length
                                ? [{
                                    id: "copy-to-side",
                                    label: "Copy to side",
                                    icon: "squares-four",
                                    action: () => {},
                                    children: otherSides
                                }]
                                : []),
                            {
                                id: "remove",
                                label: "Remove",
                                icon: "trash",
                                danger: true,
                                action: ()=>{
                                    releaseAndroidWidget(item);
                                    disposeWidgetNode(item.id);
                                    removeSpeedDialItem(item.id);
                                    persistSpeedDialItems();
                                    persistSpeedDialMeta();
                                    showSuccess("Shortcut removed");
                                }
                            }
                        ]
                    }
                ]
                : [
                    {
                        id: "new",
                        label: "New",
                        icon: "plus",
                        action: () => {},
                        children: [
                            {
                                id: "create-shortcut",
                                label: "Create shortcut",
                                icon: "plus",
                                action: ()=>{
                                    openItemEditor(undefined, { suggestedCell: guessedCell });
                                }
                            },
                            {
                                id: "create-link-shortcut",
                                label: "Create link shortcut",
                                icon: "link",
                                action: ()=>{
                                    openItemEditor(undefined, {
                                        suggestedCell: guessedCell,
                                        seed: {
                                            action: "open-link",
                                            icon: "link",
                                            label: "New link",
                                            href: "",
                                            description: ""
                                        }
                                    });
                                }
                            },
                            {
                                id: "add-widget",
                                label: "Add widget",
                                icon: "squares-four",
                                action: async () => {
                                    const pick = await openWidgetPicker();
                                    if (!pick) return;
                                    if (pick.kind === "android") {
                                        addSpeedDialItem(
                                            createWidgetSpeedDialItem("android", guessedCell, {
                                                widgetKind: "android",
                                                description: pick.bound.label,
                                                androidWidgetId: pick.bound.widgetId,
                                                androidProvider: pick.bound.provider,
                                                spanCols: pick.bound.spanCols,
                                                spanRows: pick.bound.spanRows,
                                                iconUrl: pick.bound.preview,
                                                iconDisplay: "colored"
                                            })
                                        );
                                    } else {
                                        addSpeedDialItem(createWidgetSpeedDialItem(pick.kind, guessedCell));
                                    }
                                    persistSpeedDialItems();
                                    persistSpeedDialMeta();
                                    requestAnimationFrame(() => syncAndroidWidgetHosts());
                                    showSuccess("Widget added");
                                }
                            },
                            {
                                id: "paste-shortcut",
                                label: "Paste shortcut",
                                icon: "clipboard",
                                action: pasteSpeedDialItemAction(guessedCell)
                            }
                        ]
                    },
                    {
                        id: "paste-shortcut-root",
                        label: "Paste shortcut",
                        icon: "clipboard",
                        action: pasteSpeedDialItemAction(guessedCell)
                    },
                    {
                        id: "open",
                        label: "Open",
                        icon: "squares-four",
                        action: () => {},
                        children: [
                            { id: "open-explorer", label: "Explorer", icon: "books", action: ()=>{
                                getSpeedDialActionRegistry().get("open-view-explorer")?.({ id: "", items: speedDialItems, meta: speedDialMeta, viewMaker: getSpeedDialViewOpener() || makeView }, {});
                            } },
                            { id: "open-settings", label: "Settings", icon: "gear-six", action: ()=>{
                                getSpeedDialActionRegistry().get("open-view-settings")?.({ id: "", items: speedDialItems, meta: speedDialMeta, viewMaker: getSpeedDialViewOpener() || makeView }, {});
                            } },
                            {
                                id: "open-window-type",
                                label: "New Window",
                                icon: "app-window",
                                action: () => {},
                                children: [
                                    {
                                        id: "open-viewer-regular",
                                        label: "Viewer (regular)",
                                        icon: "article",
                                        action: () => openViewTask("viewer", { windowType: "regular" })
                                    },
                                    {
                                        id: "open-viewer-tabbed",
                                        label: "Viewer (tabbed)",
                                        icon: "rows-plus-bottom",
                                        action: () => openViewTask("viewer", { windowType: "tabbed" })
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        id: "wallpaper",
                        label: "Wallpaper",
                        icon: "image",
                        action: () => {},
                        children: [
                            { id: "change-wallpaper", label: "Change wallpaper", icon: "image", action: pickWallpaper }
                        ]
                    },
                    {
                        id: "speed-dial-source",
                        label: "Speed dial source",
                        icon: "squares-four",
                        action: () => {},
                        children: [
                            {
                                id: "source-curated",
                                label: "Curated",
                                icon: "star",
                                action: () => {
                                    if (isMirrorMode()) {
                                        setSpeedDialMirrorPath(null);
                                        showSuccess("Switched to curated speed dial");
                                    }
                                }
                            },
                            {
                                id: "source-mirror",
                                label: "Mirror path…",
                                icon: "folders",
                                action: () => {
                                    /*
                                     * WHY: minimal picker — list registered PathRouter roots
                                     * (e.g. `/user/`, `/bookmarks/` in CRX) as quick targets plus a
                                     * "Custom path…" entry that prompts for an arbitrary virtual
                                     * path. A full Explorer picker callback is a follow-up; this
                                     * keeps Task 3 self-contained and testable without IPC.
                                     *
                                     * Task 5: the submenu now surfaces the current mirror path as a
                                     * read-only header entry (when set) so the user can see which
                                     * path is active before choosing to change or clear it.
                                     */
                                    const roots = listVirtualRootEntriesFromRouter().map((e) => `/${e.name}/`);
                                    const current = getSpeedDialMirrorPath() || "";
                                    const quick = roots.length
                                        ? roots.map((r) => ({
                                            id: `mirror-root-${r}`,
                                            label: r,
                                            icon: "folder",
                                            action: () => {
                                                setSpeedDialMirrorPath(r);
                                                showSuccess(`Mirror source: ${r}`);
                                            }
                                        }))
                                        : [];
                                    openUnifiedContextMenu({
                                        x: event.clientX + 4,
                                        y: event.clientY + 4,
                                        items: [
                                            ...(current ? [{
                                                id: "mirror-current",
                                                label: `Current: ${current}`,
                                                icon: "info",
                                                action: () => {}
                                            }] : []),
                                            ...quick,
                                            {
                                                id: "mirror-custom",
                                                label: "Custom path…",
                                                icon: "pencil-simple-line",
                                                action: () => {
                                                    const entered = String(
                                                        (typeof globalThis !== "undefined" && typeof globalThis.prompt === "function")
                                                            ? globalThis.prompt("Mirror speed dial path", current || "/user/")
                                                            : current || "/user/"
                                                    ).trim();
                                                    if (!entered) return;
                                                    setSpeedDialMirrorPath(entered);
                                                    showSuccess(`Mirror source: ${entered}`);
                                                }
                                            },
                                            ...(current ? [{
                                                id: "mirror-clear",
                                                label: "Clear (back to curated)",
                                                icon: "x",
                                                danger: true,
                                                action: () => {
                                                    setSpeedDialMirrorPath(null);
                                                    showSuccess("Switched to curated speed dial");
                                                }
                                            }] : [])
                                        ],
                                        compact: true
                                    });
                                }
                            }
                        ]
                    }
                ];

            openUnifiedContextMenu({
                x: event.clientX,
                y: event.clientY,
                items: menuItems,
                compact: true
            });
        }, { capture: true });
    }

    return H`<div data-home-ctx-menu style="display:none;"></div>` as HTMLElement;
}
