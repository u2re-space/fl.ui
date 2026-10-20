/*
 * Filename: AppMenu.ts
 * FullPath: modules/projects/fl.ui/src/ui/navigation/app-menu/AppMenu.ts
 * FIND:app-menu
 * FIND:bookmarks
 * Change date and time: 22.50.00_29.08.2026
 * Reason for changes: CRX bookmarks — create / edit / delete in Start menu; sort controls unchanged.
 */
/**
 * WHY: `.env-shell-app-menu` slide-over host for launcher SKU.
 * Avoids a static import of subsystem `launcher-bridge` (fl.ui ↔ subsystem cycle) — hosts
 * resolve `com/routing/native/launcher-bridge` at runtime, or register via {@link setLauncherBridgeForAppMenu}.
 */
import { preloadStyle } from "@fest-lib/style-lib";
import "@fest-lib/icon";
import {
    buildLauncherAppDragEnvelope,
    isClientPointOverSpeedDial,
    pinLauncherAppEntry,
    resolveSpeedDialCellFromClientPoint,
    applyItemIconScaleToElement,
    applyIconScaleToPaintedNodes,
    tileIconFetchSize,
    type LauncherAppPinPayload
} from "fl-ui/speed-dial/launcher-state";
import { showError, showSuccess } from "fl-ui/speed-dial/toast";
import {
    isLauncherLaunchSpecEmpty,
    resolveAppLaunchSpec,
    type LauncherLaunchSpec
} from "fl-ui/speed-dial/app-launch";
import {
    confirmUninstall,
    openAppInfoDialog,
    openAppLaunchEditor,
    openBookmarkFieldsDialog,
    openBookmarkInfoDialog,
    openBookmarkLaunchEditor,
    refreshWhenVisible,
    type LauncherAppInfo
} from "./app-actions";
import {
    applyLauncherIconToUiIcon,
    ensureLauncherIconObjectUrl,
    getCachedIconResourceObjectUrl,
    getCachedLauncherIconObjectUrl,
    isAndroidIconRef,
    resolveIconResourceUrl
} from "fl-ui/speed-dial/action-registry";
import { openUnifiedContextMenu } from "fl-ui/explorer/ContextMenu";
import {
    createTileUiIconElement,
    defaultIconScaleForDisplay,
    inferIconDisplay,
    normalizeIconDisplay,
    normalizeTileShape,
    syncShapelessIconShadow,
    type IconDisplayMode
} from "fl-ui/speed-dial/tile-icon";
import {
    appMenuChromeKeyForBookmark,
    appMenuChromeKeyForPackage,
    getAppMenuTileChrome,
    openAppMenuTileChromeEditor,
    type AppMenuTileChrome
} from "./tile-chrome";
import {
    applyBookmarkIconToPlate,
    createChromeBookmarksMenuApi,
    forgetBookmarkFromLists,
    hasBookmarksMenuApi,
    isBookmarkFaviconResourceUrl,
    isBookmarkPinnedToStart,
    placeBookmarkOnDesktop,
    pinBookmarkToStart,
    pushRecentBookmark,
    readPinnedBookmarks,
    readRecentBookmarks,
    resolveBookmarkDesktopIconUrl,
    resolveBookmarksMenuApi,
    setBookmarksMenuApi,
    unpinBookmarkFromStart,
    type BookmarkMenuEntry,
    type BookmarksMenuApi,
} from "./bookmarks-menu";
import {
    APP_MENU_SORT_EVENT,
    APP_MENU_SORT_OPTIONS,
    defaultDirForAppSort,
    hydrateAppColorKeys,
    peekAppMenuSort,
    sortLauncherApps,
    writeAppMenuSort,
    type AppMenuSortBy
} from "fl-ui/navigation/app-menu/app-sort";

// @ts-ignore — Vite inline SCSS → adopted stylesheet
import styles from "veela-lib/ui/components/app-menu.scss?inline";

export {
    setBookmarksMenuApi,
    createChromeBookmarksMenuApi,
    hasBookmarksMenuApi,
    type BookmarkMenuEntry,
    type BookmarksMenuApi,
};

const styled = preloadStyle(styles);
let documentStylesApplied = false;

const LONG_PRESS_MS = 420;
const PRE_DRAG_MOVE_PX = 10;

export type LauncherAppEntry = LauncherAppPinPayload & {
    firstInstallTime?: number;
    lastUpdateTime?: number;
    category?: string;
    installer?: string;
    system?: boolean;
};

export type LauncherBridgeApi = {
    launcherIsDefault: () => Promise<boolean>;
    launcherRequestDefault: () => Promise<boolean>;
    launcherList: (query?: string) => Promise<LauncherAppEntry[]>;
    launcherLaunch: (pkg: string, component?: string, launch?: LauncherLaunchSpec) => Promise<boolean>;
    launcherAppInfo?: (pkg: string) => Promise<LauncherAppInfo | null>;
    launcherOpenAppInfo?: (pkg: string) => Promise<boolean>;
    launcherUninstall?: (pkg: string) => Promise<boolean>;
    launcherIcon: (
        cacheKey: string,
        size?: number,
        variant?: string,
        pack?: string,
        drawable?: string
    ) => Promise<string>;
    launcherIconVariants?: (
        cacheKey: string
    ) => Promise<Array<{ id: string; label: string; available: boolean }>>;
    launcherIconPacks?: () => Promise<
        Array<{ packageName: string; label: string; iconCacheKey?: string }>
    >;
    launcherIconPackIcons?: (
        pack: string,
        query?: string,
        limit?: number
    ) => Promise<Array<{ drawable: string; label: string }>>;
};

let registeredLauncherBridge: LauncherBridgeApi | null = null;

/** Host may inject launcher IPC when `com/routing/native/launcher-bridge` is unavailable to fl.ui. */
export function setLauncherBridgeForAppMenu(api: LauncherBridgeApi | null): void {
    registeredLauncherBridge = api;
}

/** Re-export for hosts/tests — same envelope as {@link buildLauncherAppDragEnvelope}. */
export { buildLauncherAppDragEnvelope };

/** Matches {@code BootLoader} + launcher design spec. */
export function isLauncherSku(): boolean {
    return (
        document.documentElement.dataset.cwspShellRole === "launcher" ||
        (globalThis as { __RS_SHELL_ROLE__?: string }).__RS_SHELL_ROLE__ === "launcher"
    );
}

/** App Menu mounts for Android launcher SKU or CRX bookmarks Start. */
export function isAppMenuEnabled(): boolean {
    return isLauncherSku() || hasBookmarksMenuApi();
}

export type AppMenuMode = "launcher" | "bookmarks";

export function resolveAppMenuMode(): AppMenuMode | null {
    if (isLauncherSku()) return "launcher";
    if (hasBookmarksMenuApi()) return "bookmarks";
    return null;
}

async function resolveLauncherBridge(): Promise<LauncherBridgeApi | null> {
    if (registeredLauncherBridge) return registeredLauncherBridge;
    try {
        const mod = (await import("com/routing/native/launcher-bridge")) as LauncherBridgeApi;
        return mod;
    } catch {
        return null;
    }
}

function ensureDocumentStyles(): void {
    if (documentStylesApplied) return;
    documentStylesApplied = true;
    try {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, styled];
    } catch {
        /* adoptedStyleSheets unsupported — env-shell SCSS bridge covers layout */
    }
}

function resolveAppMenuHost(): HTMLElement {
    return (
        document.querySelector<HTMLElement>(".env-shell-root") ||
        document.querySelector<HTMLElement>("env-shell-container") ||
        document.querySelector<HTMLElement>(".env-shell-chrome")?.parentElement ||
        document.body
    );
}

type TileDragHooks = {
    /** After a successful pin/place — close menu / refresh. Do NOT use for gesture begin. */
    onPinned?: () => void;
    onStartPinsChanged?: () => void;
    onAppsChanged?: () => void;
};

function createDragGhost(iconPlate: HTMLElement, label: string): HTMLElement {
    const ghost = document.createElement("div");
    ghost.className = "env-shell-app-menu__drag-ghost";
    ghost.setAttribute("aria-hidden", "true");

    const ghostIcon = iconPlate.cloneNode(true) as HTMLElement;
    ghostIcon.className = "env-shell-app-menu__drag-ghost-icon ui-ws-item-icon shaped";
    ghostIcon.setAttribute(
        "data-shape",
        normalizeTileShape(iconPlate.getAttribute("data-shape"), "circle")
    );

    const ghostLabel = document.createElement("span");
    ghostLabel.className = "env-shell-app-menu__drag-ghost-label";
    ghostLabel.textContent = label;

    ghost.append(ghostIcon, ghostLabel);
    return ghost;
}

const APP_MENU_DEFAULT_SHAPE = "circle";

function paintAppMenuIconPlate(
    iconPlate: HTMLElement,
    opts: {
        chrome: AppMenuTileChrome;
        fallbackGlyph?: string;
        resourceUrl?: string;
        launcher?: boolean;
    }
): void {
    const shape = normalizeTileShape(opts.chrome.shape, APP_MENU_DEFAULT_SHAPE);
    iconPlate.setAttribute("data-shape", shape);
    iconPlate.classList.add("ui-ws-item-icon", "shaped");

    const resourceRaw =
        String(opts.chrome.iconUrl || "").trim() || String(opts.resourceUrl || "").trim();
    const fetchSize = tileIconFetchSize(opts.chrome.iconScale);
    const cachedAndroid = isAndroidIconRef(resourceRaw)
        ? getCachedIconResourceObjectUrl(resourceRaw, fetchSize)
        : "";
    const resource = String(
        cachedAndroid || (isAndroidIconRef(resourceRaw) ? "" : resourceRaw) || ""
    ).trim();
    const display =
        normalizeIconDisplay(opts.chrome.iconDisplay) ||
        inferIconDisplay({
            iconDisplay: opts.chrome.iconDisplay,
            iconUrl: resource || resourceRaw,
            isLauncherApp: Boolean(opts.launcher),
            isBookmarkFavicon: Boolean(resource || resourceRaw) && !opts.launcher
        });
    iconPlate.setAttribute("data-icon-display", display);
    applyItemIconScaleToElement(iconPlate, defaultIconScaleForDisplay(display, opts.chrome.iconScale));
    iconPlate.replaceChildren();
    const finishPaint = (): void => {
        applyIconScaleToPaintedNodes(iconPlate);
        syncShapelessIconShadow(iconPlate);
    };

    if (display === "glyph") {
        const glyph =
            String(opts.chrome.icon || opts.fallbackGlyph || "device-mobile").trim() || "device-mobile";
        const icon = document.createElement("ui-icon");
        icon.setAttribute("icon", glyph);
        icon.setAttribute("icon-style", "duotone");
        icon.setAttribute("aria-hidden", "true");
        iconPlate.append(icon);
        finishPaint();
        return;
    }

    // Capacitor-friendly colored path — light-DOM <img>, no fetch/CORS.
    if (display === "colored") {
        const img = document.createElement("img");
        img.className = opts.launcher
            ? "ui-ws-item-icon-img"
            : "ui-ws-item-icon-img env-shell-app-menu__tile-favicon";
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        img.referrerPolicy = "no-referrer";
        const favicon =
            !opts.launcher &&
            (isBookmarkFaviconResourceUrl(resource) || isBookmarkFaviconResourceUrl(resourceRaw));
        if (favicon) {
            img.toggleAttribute("data-bookmark-favicon", true);
        } else if (opts.launcher) {
            img.toggleAttribute("data-launcher-icon", true);
        }
        if (resource) {
            img.src = resource;
        } else {
            img.toggleAttribute("data-icon-pending", true);
        }
        iconPlate.append(img);
        finishPaint();
        if (isAndroidIconRef(resourceRaw)) {
            void resolveIconResourceUrl(resourceRaw, fetchSize).then((url) => {
                if (!url || !img.isConnected) return;
                img.src = url;
                img.removeAttribute("data-icon-pending");
                finishPaint();
            });
        }
        return;
    }

    const host = createTileUiIconElement({
        display: display as IconDisplayMode,
        glyph: String(opts.chrome.icon || opts.fallbackGlyph || "device-mobile"),
        resourceUrl: resource || undefined,
        launcher: opts.launcher,
        className: "ui-ws-item-icon-native"
    });
    iconPlate.append(host);
    finishPaint();
    if (opts.launcher && resource && display !== "glyph") {
        applyLauncherIconToUiIcon(
            host,
            resource,
            display as "colored" | "masked" | "masked-inverse"
        );
        finishPaint();
    }
    if (isAndroidIconRef(resourceRaw)) {
        void resolveIconResourceUrl(resourceRaw, fetchSize).then((url) => {
            if (!url || !host.isConnected) return;
            applyLauncherIconToUiIcon(
                host,
                url,
                display as "colored" | "masked" | "masked-inverse"
            );
            finishPaint();
        });
    }
}

function bindLauncherAppTileDrag(
    tile: HTMLElement,
    app: LauncherAppEntry,
    iconPlate: HTMLElement,
    hooks: TileDragHooks
): void {
    const envelope = (): string => buildLauncherAppDragEnvelope(app);
    // Capacitor / coarse pointer: HTML5 DnD closes or fights touch scroll; use long-press ghost.
    const coarse =
        typeof window !== "undefined" &&
        (window.matchMedia?.("(pointer: coarse)")?.matches || "ontouchstart" in window);
    tile.draggable = !coarse;

    if (!coarse) {
        tile.addEventListener("dragstart", (ev) => {
            const json = envelope();
            ev.dataTransfer?.setData("text/plain", json);
            ev.dataTransfer?.setData("application/json", json);
            if (ev.dataTransfer) {
                ev.dataTransfer.effectAllowed = "copy";
                try {
                    ev.dataTransfer.setDragImage(iconPlate, 24, 24);
                } catch {
                    /* ignore */
                }
            }
            // Fade panel — do not unmount (would cancel the drag).
            document.documentElement.toggleAttribute("data-app-menu-dragging", true);
        });
        tile.addEventListener("dragend", () => {
            document.documentElement.toggleAttribute("data-app-menu-dragging", false);
        });
    }

    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let dragArmed = false;
    let dragging = false;
    let suppressClick = false;
    let ghost: HTMLElement | null = null;

    const clearPressTimer = (): void => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = undefined;
        }
    };

    const cancelPointerDrag = (): void => {
        clearPressTimer();
        dragArmed = false;
        if (!dragging) return;
        dragging = false;
        tile.classList.remove("env-shell-app-menu__tile--dragging");
        document.documentElement.toggleAttribute("data-app-menu-dragging", false);
        ghost?.remove();
        ghost = null;
        if (pointerId != null) {
            try {
                tile.releasePointerCapture(pointerId);
            } catch {
                /* ignore */
            }
            pointerId = null;
        }
    };

    const beginPointerDrag = (clientX: number, clientY: number, id: number): void => {
        if (dragging) return;
        dragArmed = false;
        dragging = true;
        suppressClick = true;
        tile.classList.add("env-shell-app-menu__tile--dragging");
        document.documentElement.toggleAttribute("data-app-menu-dragging", true);
        ghost = createDragGhost(iconPlate, app.label);
        document.body.appendChild(ghost);
        ghost.style.transform = `translate(${clientX}px, ${clientY}px) translate(-50%, -50%)`;
        try {
            tile.setPointerCapture(id);
        } catch {
            /* ignore */
        }
    };

    const moveGhost = (clientX: number, clientY: number): void => {
        if (!ghost) return;
        ghost.style.transform = `translate(${clientX}px, ${clientY}px) translate(-50%, -50%)`;
    };

    const finishPointerDrag = (clientX: number, clientY: number): void => {
        if (!isClientPointOverSpeedDial(clientX, clientY)) return;
        const cell = resolveSpeedDialCellFromClientPoint(clientX, clientY);
        const pinned = pinLauncherAppEntry(app, cell ?? undefined);
        if (pinned) {
            showSuccess(`Pinned ${app.label} to desktop`);
            hooks.onPinned?.();
        }
    };

    const endPointerDrag = (ev: PointerEvent): void => {
        if (!dragging) return;
        dragging = false;
        dragArmed = false;
        tile.classList.remove("env-shell-app-menu__tile--dragging");
        document.documentElement.toggleAttribute("data-app-menu-dragging", false);
        ghost?.remove();
        ghost = null;
        if (pointerId != null) {
            try {
                tile.releasePointerCapture(pointerId);
            } catch {
                /* ignore */
            }
            pointerId = null;
        }
        finishPointerDrag(ev.clientX, ev.clientY);
    };

    tile.addEventListener(
        "pointerdown",
        (ev) => {
            if (ev.button !== 0) return;
            clearPressTimer();
            pointerId = ev.pointerId;
            startX = ev.clientX;
            startY = ev.clientY;
            suppressClick = false;
            dragging = false;
            dragArmed = false;

            pressTimer = setTimeout(() => {
                pressTimer = undefined;
                // Arm only — start drag after a subsequent move so contextmenu can win.
                dragArmed = true;
                suppressClick = true;
            }, LONG_PRESS_MS);
        },
        { passive: true }
    );

    tile.addEventListener(
        "pointermove",
        (ev) => {
            if (pressTimer && !dragging && !dragArmed) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (Math.hypot(dx, dy) > PRE_DRAG_MOVE_PX) {
                    clearPressTimer();
                }
                return;
            }
            if (dragArmed && !dragging) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (Math.hypot(dx, dy) > PRE_DRAG_MOVE_PX) {
                    beginPointerDrag(ev.clientX, ev.clientY, ev.pointerId);
                }
                return;
            }
            if (dragging) {
                moveGhost(ev.clientX, ev.clientY);
                ev.preventDefault();
            }
        },
        { passive: false }
    );

    tile.addEventListener("pointerup", (ev) => {
        clearPressTimer();
        dragArmed = false;
        if (dragging) {
            endPointerDrag(ev);
            return;
        }
    });

    tile.addEventListener("pointercancel", (ev) => {
        clearPressTimer();
        dragArmed = false;
        if (dragging) endPointerDrag(ev);
    });

    tile.addEventListener(
        "contextmenu",
        () => {
            cancelPointerDrag();
        },
        true
    );

    tile.addEventListener(
        "click",
        (ev) => {
            if (suppressClick) {
                ev.preventDefault();
                ev.stopPropagation();
                suppressClick = false;
            }
        },
        true
    );
}

async function launchListedApp(bridge: LauncherBridgeApi, app: LauncherAppEntry): Promise<void> {
    const spec = resolveAppLaunchSpec(app.packageName);
    const component = spec.componentName || app.componentName;
    const ok = await bridge.launcherLaunch(
        app.packageName,
        component,
        isLauncherLaunchSpecEmpty(spec) ? undefined : spec
    );
    if (!ok) showError(`Unable to open “${app.label}”`);
}

function renderAppTile(
    app: LauncherAppEntry,
    bridge: LauncherBridgeApi,
    gen: number,
    refreshGen: () => number,
    hooks: TileDragHooks
): HTMLElement {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "env-shell-app-menu__tile";
    tile.setAttribute("data-package", app.packageName);
    tile.title = `${app.label} — right-click: info / uninstall / launch; hold and drag`;

    const chromeKey = appMenuChromeKeyForPackage(app.packageName);
    const iconPlate = document.createElement("span");
    iconPlate.className = "env-shell-app-menu__tile-icon ui-ws-item-icon shaped";

    const label = document.createElement("span");
    label.className = "env-shell-app-menu__tile-label";
    label.textContent = app.label;

    tile.append(iconPlate, label);

    const cacheKey = app.iconCacheKey || app.packageName;
    const paint = (resourceUrl = ""): void => {
        paintAppMenuIconPlate(iconPlate, {
            chrome: getAppMenuTileChrome(chromeKey),
            fallbackGlyph: "device-mobile",
            resourceUrl,
            launcher: true
        });
    };
    const fetchSize = tileIconFetchSize(getAppMenuTileChrome(chromeKey).iconScale);
    const cached = getCachedLauncherIconObjectUrl(cacheKey, fetchSize);
    paint(cached);

    void ensureLauncherIconObjectUrl(cacheKey, fetchSize)
        .then((objectUrl) => {
            if (gen !== refreshGen()) return;
            if (!objectUrl) return;
            paint(objectUrl);
        })
        .catch(() => {
            /* ignore */
        });

    bindLauncherAppTileDrag(tile, app, iconPlate, hooks);

    tile.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openUnifiedContextMenu({
            x: ev.clientX,
            y: ev.clientY,
            compact: true,
            items: [
                {
                    id: "place-desktop",
                    label: "Place on desktop",
                    icon: "desktop",
                    action: () => {
                        const pinned = pinLauncherAppEntry(app);
                        if (pinned) {
                            showSuccess(`Placed “${app.label}” on desktop`);
                            hooks.onPinned?.();
                        }
                    }
                },
                {
                    id: "icon-design",
                    label: "Icon design…",
                    icon: "palette",
                    action: () => {
                        openAppMenuTileChromeEditor({
                            title: app.label,
                            key: chromeKey,
                            packageName: app.packageName,
                            defaults: { shape: APP_MENU_DEFAULT_SHAPE, iconDisplay: "colored" },
                            onSave: (chrome) => {
                                const merged = { ...getAppMenuTileChrome(chromeKey), ...chrome };
                                const size = tileIconFetchSize(merged.iconScale);
                                const paintChrome = (resourceUrl = ""): void => {
                                    paintAppMenuIconPlate(iconPlate, {
                                        chrome: merged,
                                        fallbackGlyph: "device-mobile",
                                        resourceUrl,
                                        launcher: true
                                    });
                                };
                                const cached =
                                    getCachedLauncherIconObjectUrl(cacheKey, size) ||
                                    (isAndroidIconRef(String(merged.iconUrl || ""))
                                        ? ""
                                        : String(merged.iconUrl || "").trim());
                                paintChrome(cached);
                                if (isAndroidIconRef(String(merged.iconUrl || ""))) {
                                    void resolveIconResourceUrl(merged.iconUrl, size).then((url) => {
                                        if (url) paintChrome(url);
                                    });
                                } else {
                                    void ensureLauncherIconObjectUrl(cacheKey, size).then((url) => {
                                        if (url) paintChrome(url);
                                    });
                                }
                            }
                        });
                    }
                },
                {
                    id: "launch",
                    label: "Open",
                    icon: "arrow-square-out",
                    action: async () => {
                        try {
                            await launchListedApp(bridge, app);
                        } catch {
                            /* ignore */
                        }
                    }
                },
                {
                    id: "app-info",
                    label: "App info",
                    icon: "info",
                    action: async () => {
                        let info: LauncherAppInfo | null = null;
                        try {
                            info = (await bridge.launcherAppInfo?.(app.packageName)) || null;
                        } catch {
                            info = null;
                        }
                        openAppInfoDialog({
                            title: app.label,
                            fallback: {
                                packageName: app.packageName,
                                componentName: app.componentName,
                                label: app.label
                            },
                            info,
                            onOpenSystem: bridge.launcherOpenAppInfo
                                ? () => bridge.launcherOpenAppInfo!(app.packageName)
                                : undefined
                        });
                    }
                },
                ...(bridge.launcherOpenAppInfo
                    ? [
                          {
                              id: "android-settings",
                              label: "Android settings",
                              icon: "gear",
                              action: async () => {
                                  try {
                                      const ok = await bridge.launcherOpenAppInfo!(app.packageName);
                                      if (!ok) showError(`Cannot open Android settings for “${app.label}”`);
                                  } catch {
                                      showError(`Cannot open Android settings for “${app.label}”`);
                                  }
                              }
                          }
                      ]
                    : []),
                {
                    id: "edit-launch",
                    label: "Edit launch…",
                    icon: "sliders",
                    action: () => {
                        openAppLaunchEditor({
                            title: app.label,
                            packageName: app.packageName,
                            defaultComponent: app.componentName
                        });
                    }
                },
                ...(bridge.launcherUninstall
                    ? [
                          {
                              id: "uninstall",
                              label: "Uninstall",
                              icon: "trash",
                              danger: true,
                              action: async () => {
                                  if (!confirmUninstall(app.label, "Uninstall")) return;
                                  try {
                                      const ok = await bridge.launcherUninstall!(app.packageName);
                                      if (!ok) {
                                          showError(`Cannot uninstall “${app.label}”`);
                                          return;
                                      }
                                      showSuccess(`Uninstall started for “${app.label}”`);
                                      refreshWhenVisible(() => hooks.onAppsChanged?.());
                                  } catch {
                                      showError(`Cannot uninstall “${app.label}”`);
                                  }
                              }
                          }
                      ]
                    : [])
            ]
        });
    });

    tile.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
            await launchListedApp(bridge, app);
        } catch {
            /* ignore */
        }
    });

    return tile;
}

function bindBookmarkTileDrag(
    tile: HTMLElement,
    entry: BookmarkMenuEntry,
    iconPlate: HTMLElement,
    iconUrl: { current: string },
    hooks: TileDragHooks
): void {
    if (entry.folder || !String(entry.url || "").trim()) return;

    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let dragArmed = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let pointerId = -1;
    let ghost: HTMLElement | null = null;

    const clearPress = (): void => {
        if (pressTimer != null) {
            clearTimeout(pressTimer);
            pressTimer = undefined;
        }
    };

    const cancelDrag = (): void => {
        clearPress();
        dragArmed = false;
        if (!dragging) return;
        dragging = false;
        tile.classList.remove("env-shell-app-menu__tile--dragging");
        document.documentElement.toggleAttribute("data-app-menu-dragging", false);
        ghost?.remove();
        ghost = null;
        try {
            tile.releasePointerCapture?.(pointerId);
        } catch {
            /* ignore */
        }
    };

    const beginDrag = (clientX: number, clientY: number): void => {
        if (dragging) return;
        dragArmed = false;
        dragging = true;
        tile.classList.add("env-shell-app-menu__tile--dragging");
        document.documentElement.toggleAttribute("data-app-menu-dragging", true);
        ghost = createDragGhost(iconPlate, entry.title);
        document.body.appendChild(ghost);
        ghost.style.transform = `translate(${clientX}px, ${clientY}px) translate(-50%, -50%)`;
        try {
            tile.setPointerCapture?.(pointerId);
        } catch {
            /* ignore */
        }
    };

    const endDrag = (clientX: number, clientY: number): void => {
        clearPress();
        dragArmed = false;
        if (!dragging) return;
        dragging = false;
        tile.classList.remove("env-shell-app-menu__tile--dragging");
        document.documentElement.toggleAttribute("data-app-menu-dragging", false);
        ghost?.remove();
        ghost = null;
        try {
            tile.releasePointerCapture?.(pointerId);
        } catch {
            /* ignore */
        }
        if (isClientPointOverSpeedDial(clientX, clientY)) {
            const cell = resolveSpeedDialCellFromClientPoint(clientX, clientY) ?? undefined;
            const paint =
                String(iconUrl.current || "").trim() ||
                resolveBookmarkDesktopIconUrl(entry, resolveBookmarksMenuApi());
            const pinned = placeBookmarkOnDesktop(entry, cell, resolveBookmarksMenuApi(), paint);
            if (pinned) {
                showSuccess(`Placed “${entry.title}” on desktop`);
                hooks.onPinned?.();
            }
        }
    };

    tile.addEventListener("pointerdown", (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        startX = ev.clientX;
        startY = ev.clientY;
        pointerId = ev.pointerId;
        dragging = false;
        dragArmed = false;
        clearPress();
        pressTimer = setTimeout(() => {
            pressTimer = undefined;
            dragArmed = true;
        }, LONG_PRESS_MS);
    });

    tile.addEventListener(
        "pointermove",
        (ev) => {
            if (!dragging && !dragArmed) {
                if (pressTimer == null) return;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (dx * dx + dy * dy > PRE_DRAG_MOVE_PX * PRE_DRAG_MOVE_PX) clearPress();
                return;
            }
            if (dragArmed && !dragging) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (dx * dx + dy * dy > PRE_DRAG_MOVE_PX * PRE_DRAG_MOVE_PX) {
                    beginDrag(ev.clientX, ev.clientY);
                }
                return;
            }
            if (ghost) {
                ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -50%)`;
                ev.preventDefault();
            }
        },
        { passive: false }
    );

    tile.addEventListener("pointerup", (ev) => endDrag(ev.clientX, ev.clientY));
    tile.addEventListener("pointercancel", (ev) => endDrag(ev.clientX, ev.clientY));
    tile.addEventListener("contextmenu", () => cancelDrag(), true);
}

function bindBookmarkTileContextMenu(
    tile: HTMLElement,
    entry: BookmarkMenuEntry,
    api: BookmarksMenuApi,
    iconUrl: { current: string },
    hooks: TileDragHooks & { onStartPinsChanged?: () => void }
): void {
    tile.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (entry.folder) {
            openUnifiedContextMenu({
                x: ev.clientX,
                y: ev.clientY,
                compact: true,
                items: [
                    {
                        id: "open-folder",
                        label: "Open folder",
                        icon: "folder-open",
                        action: () => {
                            tile.click();
                        }
                    },
                    {
                        id: "bm-info",
                        label: "Info",
                        icon: "info",
                        action: () => {
                            openBookmarkInfoDialog(entry);
                        }
                    },
                    ...(api.update
                        ? [
                              {
                                  id: "bm-edit",
                                  label: "Rename folder…",
                                  icon: "pencil",
                                  action: () => {
                                      openBookmarkLaunchEditor({
                                          entry,
                                          api,
                                          onSaved: () => hooks.onAppsChanged?.()
                                      });
                                  }
                              }
                          ]
                        : []),
                    ...(api.remove
                        ? [
                              {
                                  id: "bm-delete",
                                  label: "Delete folder",
                                  icon: "trash",
                                  danger: true,
                                  action: async () => {
                                      if (!confirmUninstall(entry.title, "Delete")) return;
                                      try {
                                          const ok = await api.remove!(entry);
                                          if (!ok) {
                                              showError(`Could not delete “${entry.title}”`);
                                              return;
                                          }
                                          showSuccess(`Deleted “${entry.title}”`);
                                          forgetBookmarkFromLists(entry.id);
                                          hooks.onAppsChanged?.();
                                      } catch {
                                          showError(`Could not delete “${entry.title}”`);
                                      }
                                  }
                              }
                          ]
                        : [])
                ]
            });
            return;
        }

        const pinned = isBookmarkPinnedToStart(entry.id);
        openUnifiedContextMenu({
            x: ev.clientX,
            y: ev.clientY,
            compact: true,
            items: [
                {
                    id: "place-desktop",
                    label: "Place on desktop",
                    icon: "desktop",
                    action: () => {
                        const paint =
                            String(iconUrl.current || "").trim() ||
                            resolveBookmarkDesktopIconUrl(entry, api);
                        const item = placeBookmarkOnDesktop(entry, undefined, api, paint);
                        if (item) {
                            showSuccess(`Placed “${entry.title}” on desktop`);
                            hooks.onPinned?.();
                        }
                    }
                },
                {
                    id: "icon-design",
                    label: "Icon design…",
                    icon: "palette",
                    action: () => {
                        const key = appMenuChromeKeyForBookmark(entry.id);
                        openAppMenuTileChromeEditor({
                            title: entry.title,
                            key,
                            pageUrl: String(entry.url || "").trim(),
                            defaults: { shape: APP_MENU_DEFAULT_SHAPE, iconDisplay: "colored" },
                            onSave: (chrome) => {
                                const plate = tile.querySelector(
                                    ".env-shell-app-menu__tile-icon"
                                ) as HTMLElement | null;
                                if (!plate) return;
                                const merged = { ...getAppMenuTileChrome(key), ...chrome };
                                const resource =
                                    String(merged.iconUrl || "").trim() ||
                                    String(iconUrl.current || "").trim() ||
                                    resolveBookmarkDesktopIconUrl(entry, api);
                                paintAppMenuIconPlate(plate, {
                                    chrome: merged,
                                    fallbackGlyph: entry.folder ? "folder" : "link",
                                    resourceUrl: resource
                                });
                                if (resource) iconUrl.current = resource;
                            }
                        });
                    }
                },
                pinned
                    ? {
                          id: "unpin-start",
                          label: "Unpin from Start",
                          icon: "push-pin-slash",
                          action: () => {
                              if (unpinBookmarkFromStart(entry.id)) {
                                  showSuccess(`Unpinned “${entry.title}”`);
                                  hooks.onStartPinsChanged?.();
                              }
                          }
                      }
                    : {
                          id: "pin-start",
                          label: "Pin to Start",
                          icon: "push-pin",
                          action: () => {
                              if (pinBookmarkToStart(entry)) {
                                  showSuccess(`Pinned “${entry.title}” to Start`);
                                  hooks.onStartPinsChanged?.();
                              }
                          }
                      },
                {
                    id: "open",
                    label: "Open",
                    icon: "arrow-square-out",
                    action: async () => {
                        pushRecentBookmark(entry);
                        try {
                            await api.open(entry);
                        } catch {
                            /* ignore */
                        }
                    }
                },
                {
                    id: "bm-info",
                    label: "Info",
                    icon: "info",
                    action: () => {
                        openBookmarkInfoDialog(entry);
                    }
                },
                ...(api.update && !entry.folder
                    ? [
                          {
                              id: "bm-edit",
                              label: "Edit bookmark…",
                              icon: "pencil",
                              action: () => {
                                  openBookmarkLaunchEditor({
                                      entry,
                                      api,
                                      onSaved: () => hooks.onAppsChanged?.()
                                  });
                              }
                          }
                      ]
                    : []),
                ...(api.remove
                    ? [
                          {
                              id: "bm-delete",
                              label: entry.folder ? "Delete folder" : "Delete",
                              icon: "trash",
                              danger: true,
                              action: async () => {
                                  if (!confirmUninstall(entry.title, "Delete")) return;
                                  try {
                                      const ok = await api.remove!(entry);
                                      if (!ok) {
                                          showError(`Could not delete “${entry.title}”`);
                                          return;
                                      }
                                      showSuccess(`Deleted “${entry.title}”`);
                                      forgetBookmarkFromLists(entry.id);
                                      hooks.onAppsChanged?.();
                                  } catch {
                                      showError(`Could not delete “${entry.title}”`);
                                  }
                              }
                          }
                      ]
                    : [])
            ]
        });
    });
}

function renderBookmarkTile(
    entry: BookmarkMenuEntry,
    api: BookmarksMenuApi,
    hooks: TileDragHooks & { onStartPinsChanged?: () => void },
    onFolder: (id: string, title: string) => void
): HTMLElement {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "env-shell-app-menu__tile";
    tile.setAttribute("data-bookmark-id", entry.id);
    if (entry.folder) tile.setAttribute("data-folder", "");
    tile.title = entry.folder
        ? `${entry.title} — open folder`
        : `${entry.title} — right-click: info / edit / delete; hold to drag`;

    const chromeKey = appMenuChromeKeyForBookmark(entry.id);
    const iconPlate = document.createElement("span");
    iconPlate.className = "env-shell-app-menu__tile-icon ui-ws-item-icon shaped";
    iconPlate.setAttribute("data-shape", APP_MENU_DEFAULT_SHAPE);

    const label = document.createElement("span");
    label.className = "env-shell-app-menu__tile-label";
    label.textContent = entry.title;

    tile.append(iconPlate, label);

    const iconUrl = { current: "" };
    const applyChromePaint = (url: string): void => {
        const chrome = getAppMenuTileChrome(chromeKey);
        if (
            chrome.shape ||
            chrome.iconDisplay ||
            chrome.icon ||
            chrome.iconUrl
        ) {
            paintAppMenuIconPlate(iconPlate, {
                chrome,
                fallbackGlyph: entry.folder ? "folder" : "link",
                resourceUrl: String(chrome.iconUrl || url || "").trim()
            });
            return;
        }
        iconPlate.setAttribute("data-shape", APP_MENU_DEFAULT_SHAPE);
    };

    void applyBookmarkIconToPlate(iconPlate, entry, api).then((url) => {
        iconUrl.current = url;
        applyChromePaint(url);
    });

    bindBookmarkTileDrag(tile, entry, iconPlate, iconUrl, hooks);
    bindBookmarkTileContextMenu(tile, entry, api, iconUrl, hooks);

    tile.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (document.documentElement.hasAttribute("data-app-menu-dragging")) return;
        if (entry.folder) {
            onFolder(entry.id, entry.title);
            return;
        }
        pushRecentBookmark(entry);
        try {
            await api.open(entry);
        } catch {
            /* ignore */
        }
    });

    return tile;
}

export type MountAppMenuResult = {
    element: HTMLElement;
    toggle: () => void;
    open: () => void;
    /** Full-page Apps surface (same drawer, page chrome). */
    openPage: () => void;
    close: () => void;
    isOpen: () => boolean;
    refresh: () => Promise<void>;
    dispose: () => void;
};

/**
 * Mount `.env-shell-app-menu` beside the shell chrome.
 * Launcher SKU → Android apps grid; CRX bookmarks API → Win7-style Start (recent | folders).
 */
export function mountEnvironmentAppMenu(): MountAppMenuResult {
    ensureDocumentStyles();

    const mode = resolveAppMenuMode();
    const root = document.createElement("div");
    root.className = "env-shell-app-menu";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "false");
    root.setAttribute("aria-label", mode === "bookmarks" ? "Bookmarks" : "Apps");
    if (mode) root.setAttribute("data-menu-mode", mode);

    const syncAppMenuColorScheme = (): void => {
        try {
            const html = document.documentElement;
            const pinned = (html.getAttribute("data-theme") || "").toLowerCase();
            const inline = (html.style.colorScheme || "").trim().toLowerCase();
            const scheme =
                pinned === "light" || pinned === "dark"
                    ? pinned
                    : inline === "light" || inline === "dark"
                      ? inline
                      : "";
            if (scheme === "light" || scheme === "dark") {
                root.dataset.theme = scheme;
                root.style.colorScheme = scheme;
                return;
            }
            delete root.dataset.theme;
            root.style.colorScheme = "inherit";
        } catch {
            /* ignore */
        }
    };
    syncAppMenuColorScheme();
    const onThemeChange = (): void => syncAppMenuColorScheme();
    document.addEventListener("u2-theme-change", onThemeChange);
    const themeAttrObserver = new MutationObserver(onThemeChange);
    try {
        themeAttrObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme", "data-scheme", "style"]
        });
    } catch {
        /* ignore */
    }

    const panel = document.createElement("div");
    panel.className = "env-shell-app-menu__panel";
    if (mode === "bookmarks") panel.setAttribute("data-layout", "start-split");

    const frame = document.createElement("div");
    frame.className = "env-shell-app-menu__frame";

    const banner = document.createElement("div");
    banner.className = "env-shell-app-menu__banner";
    banner.hidden = true;

    const bannerText = document.createElement("p");
    bannerText.className = "env-shell-app-menu__banner-text";
    bannerText.textContent = "Set CWSP Launcher as Home";

    const bannerAction = document.createElement("button");
    bannerAction.type = "button";
    bannerAction.className = "env-shell-app-menu__banner-action btn";
    bannerAction.textContent = "Set as default";

    banner.append(bannerText, bannerAction);

    const search = document.createElement("input");
    search.type = "search";
    search.className = "env-shell-app-menu__search";
    search.placeholder = mode === "bookmarks" ? "Search bookmarks" : "Search apps";
    search.autocomplete = "off";
    search.inputMode = "search";
    search.setAttribute("aria-label", mode === "bookmarks" ? "Search bookmarks" : "Search apps");

    const tools = document.createElement("div");
    tools.className = "env-shell-app-menu__tools";
    const sortBySelect = document.createElement("select");
    sortBySelect.className = "env-shell-app-menu__sort";
    sortBySelect.setAttribute("aria-label", "Sort apps");
    for (const [value, label] of APP_MENU_SORT_OPTIONS) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        sortBySelect.appendChild(opt);
    }
    const sortDirSelect = document.createElement("select");
    sortDirSelect.className = "env-shell-app-menu__sort-dir";
    sortDirSelect.setAttribute("aria-label", "Sort order");
    for (const [value, label] of [
        ["asc", "A–Z / oldest"],
        ["desc", "Z–A / newest"]
    ] as const) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        sortDirSelect.appendChild(opt);
    }
    const syncSortControls = (): void => {
        const prefs = peekAppMenuSort();
        sortBySelect.value = prefs.sortBy;
        sortDirSelect.value = prefs.sortDir;
    };
    syncSortControls();
    tools.append(search, sortBySelect, sortDirSelect);

    const startBody = document.createElement("div");
    startBody.className = "env-shell-app-menu__start-body";
    startBody.hidden = mode !== "bookmarks";

    const leftCol = document.createElement("div");
    leftCol.className = "env-shell-app-menu__start-left";
    leftCol.setAttribute("aria-label", "Pinned and recent bookmarks");

    const pinnedHeading = document.createElement("div");
    pinnedHeading.className = "env-shell-app-menu__start-heading";
    pinnedHeading.textContent = "Pinned";

    const pinnedList = document.createElement("div");
    pinnedList.className = "env-shell-app-menu__start-recent env-shell-app-menu__start-pinned";

    const recentHeading = document.createElement("div");
    recentHeading.className = "env-shell-app-menu__start-heading";
    recentHeading.textContent = "Recent";

    const recentList = document.createElement("div");
    recentList.className = "env-shell-app-menu__start-recent";

    leftCol.append(pinnedHeading, pinnedList, recentHeading, recentList);

    const rightCol = document.createElement("div");
    rightCol.className = "env-shell-app-menu__start-right";

    const crumb = document.createElement("div");
    crumb.className = "env-shell-app-menu__crumb";

    const crumbNav = document.createElement("div");
    crumbNav.className = "env-shell-app-menu__crumb-nav";

    const crumbActions = document.createElement("div");
    crumbActions.className = "env-shell-app-menu__crumb-actions";

    crumb.append(crumbNav, crumbActions);

    const gridHost = document.createElement("div");
    gridHost.className = "env-shell-app-menu__grid";
    gridHost.setAttribute("data-part", "grid");
    gridHost.setAttribute("aria-label", mode === "bookmarks" ? "Bookmarks" : "Installed apps");

    rightCol.append(crumb, gridHost);
    startBody.append(leftCol, rightCol);

    if (mode === "bookmarks") {
        panel.append(banner, tools, startBody);
    } else {
        panel.append(banner, tools, gridHost);
    }
    frame.append(panel);
    root.appendChild(frame);

    const host = resolveAppMenuHost();
    host.appendChild(root);

    let open = false;
    let refreshGen = 0;
    let searchQuery = "";
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let folderStack: Array<{ id: string; title: string }> = [];

    const syncVisibility = (): void => {
        if (!isAppMenuEnabled()) {
            root.hidden = true;
            root.toggleAttribute("data-open", false);
            return;
        }
        root.hidden = !open;
        root.toggleAttribute("data-open", open);
    };

    const close = (): void => {
        if (!open) return;
        open = false;
        root.toggleAttribute("data-page", false);
        syncVisibility();
        root.dispatchEvent(new CustomEvent("env-app-menu-close", { bubbles: true }));
    };

    root.addEventListener("env-app-menu-request-close", (ev) => {
        ev.stopPropagation();
        close();
    });

    const openMenu = (): void => {
        if (!isAppMenuEnabled()) return;
        syncAppMenuColorScheme();
        open = true;
        syncVisibility();
        void refresh();
        root.dispatchEvent(new CustomEvent("env-app-menu-open", { bubbles: true }));
    };

    const openPage = (): void => {
        root.toggleAttribute("data-page", true);
        openMenu();
    };

    const toggle = (): void => {
        if (open) close();
        else openMenu();
    };

    const tileDragHooks: TileDragHooks = {
        onPinned: () => {
            close();
        },
        onStartPinsChanged: () => {
            void refresh();
        },
        onAppsChanged: () => {
            void refresh();
        }
    };

    const beginCreateBookmark = (kind: "url" | "folder"): void => {
        const api = resolveBookmarksMenuApi();
        if (!api?.create) {
            showError("Cannot create bookmark here");
            return;
        }
        const parent = folderStack.length ? folderStack[folderStack.length - 1] : null;
        const parentId = parent?.id || "0";
        const parentTitle = parent?.title || "Bookmarks";
        void (async () => {
            const fields = await openBookmarkFieldsDialog({
                heading: kind === "folder" ? "New folder" : "New bookmark",
                description: `Add to “${parentTitle}” (Chrome bookmarks)`,
                showUrl: kind === "url",
                initialTitle: kind === "folder" ? "New folder" : "",
                initialUrl: kind === "url" ? "https://" : "",
                submitLabel: "Create"
            });
            if (!fields) return;
            const created = await api.create(parentId, {
                title: fields.title,
                url: kind === "url" ? fields.url : undefined
            });
            if (!created) {
                showError(kind === "folder" ? "Could not create folder" : "Could not create bookmark");
                return;
            }
            showSuccess(
                kind === "folder" ? `Created folder “${created.title}”` : `Created “${created.title}”`
            );
            void refresh();
        })();
    };

    const makeCrumbAction = (label: string, onClick: () => void): HTMLButtonElement => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "env-shell-app-menu__crumb-action";
        btn.textContent = label;
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            onClick();
        });
        return btn;
    };

    crumbActions.append(
        makeCrumbAction("New bookmark", () => beginCreateBookmark("url")),
        makeCrumbAction("New folder", () => beginCreateBookmark("folder"))
    );

    gridHost.addEventListener("contextmenu", (ev) => {
        if ((ev.target as HTMLElement | null)?.closest?.("[data-bookmark-id]")) return;
        if (resolveAppMenuMode() !== "bookmarks") return;
        const api = resolveBookmarksMenuApi();
        if (!api?.create) return;
        ev.preventDefault();
        ev.stopPropagation();
        openUnifiedContextMenu({
            x: ev.clientX,
            y: ev.clientY,
            compact: true,
            items: [
                {
                    id: "new-bookmark",
                    label: "New bookmark…",
                    icon: "bookmark-simple",
                    action: () => beginCreateBookmark("url")
                },
                {
                    id: "new-folder",
                    label: "New folder…",
                    icon: "folder-plus",
                    action: () => beginCreateBookmark("folder")
                }
            ]
        });
    });

    const paintCrumb = (): void => {
        crumbNav.replaceChildren();
        crumbActions.hidden = mode !== "bookmarks" || !resolveBookmarksMenuApi()?.create;
        if (mode !== "bookmarks") return;
        const rootBtn = document.createElement("button");
        rootBtn.type = "button";
        rootBtn.className = "env-shell-app-menu__crumb-item";
        rootBtn.textContent = "Bookmarks";
        rootBtn.addEventListener("click", () => {
            folderStack = [];
            void refresh();
        });
        crumbNav.appendChild(rootBtn);
        folderStack.forEach((seg, idx) => {
            const sep = document.createElement("span");
            sep.className = "env-shell-app-menu__crumb-sep";
            sep.textContent = "›";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "env-shell-app-menu__crumb-item";
            btn.textContent = seg.title;
            btn.addEventListener("click", () => {
                folderStack = folderStack.slice(0, idx + 1);
                void refresh();
            });
            crumbNav.append(sep, btn);
        });
    };

    const populateLauncherGrid = async (bridge: LauncherBridgeApi, gen: number): Promise<void> => {
        let apps: LauncherAppEntry[] = [];
        try {
            apps = await bridge.launcherList(searchQuery || undefined);
        } catch {
            apps = [];
        }
        if (gen !== refreshGen) return;

        gridHost.replaceChildren();
        const prefs = peekAppMenuSort();
        if (prefs.sortBy === "color") {
            await hydrateAppColorKeys(apps, gridHost);
            if (gen !== refreshGen) return;
        }
        apps = sortLauncherApps(apps, prefs);

        if (apps.length === 0) {
            const empty = document.createElement("p");
            empty.className = "env-shell-app-menu__empty";
            empty.textContent = searchQuery ? "No matching apps" : "No apps found";
            gridHost.appendChild(empty);
            return;
        }

        const frag = document.createDocumentFragment();
        for (const app of apps) {
            frag.appendChild(renderAppTile(app, bridge, gen, () => refreshGen, tileDragHooks));
        }
        gridHost.appendChild(frag);
    };

    const enterFolder = (id: string, title: string): void => {
        folderStack.push({ id, title });
        searchQuery = "";
        search.value = "";
        void refresh();
    };

    const populateBookmarks = async (api: BookmarksMenuApi, gen: number): Promise<void> => {
        paintCrumb();

        const fillLeftSection = (
            host: HTMLElement,
            entries: BookmarkMenuEntry[],
            emptyLabel: string
        ): void => {
            host.replaceChildren();
            if (entries.length === 0) {
                const empty = document.createElement("p");
                empty.className = "env-shell-app-menu__empty env-shell-app-menu__empty--compact";
                empty.textContent = emptyLabel;
                host.appendChild(empty);
                return;
            }
            for (const entry of entries) {
                host.appendChild(renderBookmarkTile(entry, api, tileDragHooks, enterFolder));
            }
        };

        fillLeftSection(pinnedList, readPinnedBookmarks(), "No pinned bookmarks");
        fillLeftSection(recentList, readRecentBookmarks(), "No recent bookmarks");

        let entries: BookmarkMenuEntry[] = [];
        try {
            if (searchQuery) {
                entries = await api.search(searchQuery);
            } else {
                const folderId = folderStack.length ? folderStack[folderStack.length - 1]!.id : undefined;
                entries = await api.listChildren(folderId);
            }
        } catch {
            entries = [];
        }
        if (gen !== refreshGen) return;

        gridHost.replaceChildren();
        if (entries.length === 0) {
            const empty = document.createElement("p");
            empty.className = "env-shell-app-menu__empty";
            empty.textContent = searchQuery ? "No matching bookmarks" : "This folder is empty";
            gridHost.appendChild(empty);
            return;
        }

        const frag = document.createDocumentFragment();
        const prefs = peekAppMenuSort();
        const dir = prefs.sortDir === "desc" ? -1 : 1;
        const folders = entries.filter((e) => e.folder);
        const links = entries.filter((e) => !e.folder);
        const byTitle = (a: BookmarkMenuEntry, b: BookmarkMenuEntry) =>
            String(a.title || "").localeCompare(String(b.title || ""), undefined, {
                numeric: true,
                sensitivity: "base"
            }) * dir;
        for (const entry of [...folders.sort(byTitle), ...links.sort(byTitle)]) {
            frag.appendChild(renderBookmarkTile(entry, api, tileDragHooks, enterFolder));
        }
        gridHost.appendChild(frag);
    };

    const refresh = async (): Promise<void> => {
        const gen = ++refreshGen;
        banner.hidden = true;
        tools.hidden = false;
        search.hidden = false;

        const activeMode = resolveAppMenuMode();
        if (!activeMode) {
            syncVisibility();
            return;
        }
        root.setAttribute("data-menu-mode", activeMode);

        if (activeMode === "bookmarks") {
            panel.setAttribute("data-layout", "start-split");
            startBody.hidden = false;
            if (!panel.contains(startBody)) {
                panel.append(banner, tools, startBody);
                if (gridHost.parentElement !== rightCol) rightCol.append(crumb, gridHost);
            }
            const api = resolveBookmarksMenuApi();
            if (!api) {
                banner.hidden = false;
                bannerText.textContent = "Bookmarks API unavailable in this context";
                bannerAction.hidden = true;
                search.hidden = true;
                tools.hidden = true;
                startBody.hidden = true;
                return;
            }
            bannerAction.hidden = true;
            await populateBookmarks(api, gen);
            return;
        }

        panel.removeAttribute("data-layout");
        startBody.hidden = true;
        if (gridHost.parentElement !== panel) panel.append(gridHost);

        const bridge = await resolveLauncherBridge();
        if (gen !== refreshGen) return;

        if (!bridge?.launcherList || !bridge?.launcherLaunch || !bridge?.launcherIcon) {
            banner.hidden = false;
            bannerText.textContent = "Launcher bridge unavailable — rebuild the Capacitor APK";
            bannerAction.hidden = true;
            search.hidden = true;
            tools.hidden = true;
            gridHost.hidden = true;
            return;
        }

        let isDefault = false;
        try {
            isDefault = await bridge.launcherIsDefault();
        } catch {
            isDefault = false;
        }
        if (gen !== refreshGen) return;

        if (!isDefault) {
            banner.hidden = false;
            bannerText.textContent = "Set CWSP Launcher as Home for full launcher integration";
            bannerAction.hidden = false;
        } else {
            banner.hidden = true;
        }

        search.hidden = false;
        tools.hidden = false;
        gridHost.hidden = false;
        await populateLauncherGrid(bridge, gen);
    };

    sortBySelect.addEventListener("change", () => {
        const sortBy = sortBySelect.value as AppMenuSortBy;
        writeAppMenuSort({ sortBy, sortDir: defaultDirForAppSort(sortBy) });
        syncSortControls();
    });
    sortDirSelect.addEventListener("change", () => {
        writeAppMenuSort({ sortDir: sortDirSelect.value === "desc" ? "desc" : "asc" });
    });
    const onSortPrefs = (): void => {
        syncSortControls();
        if (open) void refresh();
    };
    window.addEventListener(APP_MENU_SORT_EVENT, onSortPrefs);

    search.addEventListener("input", () => {
        searchQuery = search.value.trim();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            void refresh();
        }, 180);
    });

    bannerAction.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const bridge = await resolveLauncherBridge();
        if (!bridge) return;
        try {
            await bridge.launcherRequestDefault();
        } catch {
            /* ignore */
        }
        void refresh();
    });

    const onDocPointer = (ev: Event): void => {
        if (!open) return;
        if (document.documentElement.hasAttribute("data-app-menu-dragging")) return;
        const path =
            typeof (ev as PointerEvent).composedPath === "function"
                ? (ev as PointerEvent).composedPath()
                : [];
        for (const n of path) {
            if (n === root || n === panel) return;
            if (n instanceof Element && root.contains(n)) return;
            if (n instanceof Element && n.closest?.(".cw-context-menu-layer")) return;
            if (n instanceof Element && n.closest?.(".env-shell-app-menu__chrome-editor")) return;
            if (n instanceof Element && n.closest?.("dialog.speed-dial-editor")) return;
        }
        close();
    };
    document.addEventListener("pointerdown", onDocPointer, { capture: true });

    /* WHY: `[data-page]` covers the viewport, so outside-pointer never fires.
     * Treat a short tap on the drawer chrome/gaps as dismiss; ignore scroll/drag. */
    const APP_MENU_KEEP_OPEN_SEL = [
        ".env-shell-app-menu__tile",
        ".env-shell-app-menu__search",
        ".env-shell-app-menu__sort",
        ".env-shell-app-menu__sort-dir",
        ".env-shell-app-menu__tools",
        ".env-shell-app-menu__banner",
        ".env-shell-app-menu__pin-menu",
        ".env-shell-app-menu__crumb-item",
        ".env-shell-app-menu__start-heading",
        ".env-shell-app-menu__chrome-editor",
        ".env-shell-app-menu__drag-ghost",
        ".cw-context-menu-layer",
        "dialog.speed-dial-editor"
    ].join(", ");
    const TAP_DISMISS_SLOP_PX = 14;
    let dismissTap: { id: number; x: number; y: number } | null = null;
    const isKeepOpenTarget = (t: EventTarget | null): boolean =>
        t instanceof Element && Boolean(t.closest(APP_MENU_KEEP_OPEN_SEL));
    const onEmptySurfacePointerDown = (ev: PointerEvent): void => {
        if (!open) return;
        if (ev.button != null && ev.button !== 0) return;
        if (document.documentElement.hasAttribute("data-app-menu-dragging") || isKeepOpenTarget(ev.target)) {
            dismissTap = null;
            return;
        }
        dismissTap = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    };
    const onEmptySurfacePointerUp = (ev: PointerEvent): void => {
        if (!dismissTap || dismissTap.id !== ev.pointerId) return;
        const dx = ev.clientX - dismissTap.x;
        const dy = ev.clientY - dismissTap.y;
        dismissTap = null;
        if (!open) return;
        if (document.documentElement.hasAttribute("data-app-menu-dragging")) return;
        if (isKeepOpenTarget(ev.target)) return;
        if (Math.hypot(dx, dy) > TAP_DISMISS_SLOP_PX) return;
        close();
    };
    const onEmptySurfacePointerCancel = (ev: PointerEvent): void => {
        if (dismissTap?.id === ev.pointerId) dismissTap = null;
    };
    root.addEventListener("pointerdown", onEmptySurfacePointerDown);
    root.addEventListener("pointerup", onEmptySurfacePointerUp);
    root.addEventListener("pointercancel", onEmptySurfacePointerCancel);

    syncVisibility();

    const dispose = (): void => {
        if (searchTimer) clearTimeout(searchTimer);
        document.documentElement.toggleAttribute("data-app-menu-dragging", false);
        document.removeEventListener("pointerdown", onDocPointer, { capture: true } as EventListenerOptions);
        root.removeEventListener("pointerdown", onEmptySurfacePointerDown);
        root.removeEventListener("pointerup", onEmptySurfacePointerUp);
        root.removeEventListener("pointercancel", onEmptySurfacePointerCancel);
        document.removeEventListener("u2-theme-change", onThemeChange);
        window.removeEventListener(APP_MENU_SORT_EVENT, onSortPrefs);
        try {
            themeAttrObserver.disconnect();
        } catch {
            /* ignore */
        }
        root.remove();
    };

    return {
        element: root,
        toggle,
        open: openMenu,
        openPage,
        close,
        isOpen: () => open,
        refresh,
        dispose
    };
}
