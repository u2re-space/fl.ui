/*
 * Filename: icon-resource-picker.ts
 * FullPath: modules/projects/fl.ui/src/ui/speed-dial/icon-resource-picker.ts
 * Change date and time: 21.15.00_22.08.2026
 * Reason for changes: Center icon picker via full-viewport dialog host (Cap WebView).
 */

import {
    ensureLauncherIconObjectUrl,
    formatAndroidIconRef,
    getLauncherBridgeForSpeedDial,
    type LauncherBridgeSpeedDialApi
} from "./action-registry";
import {
    normalizeAndroidIconVariant,
    type AndroidIconVariant
} from "./android-icon-ref";
import {
    resolveBookmarksMenuApi,
    type BookmarkMenuEntry,
    type BookmarksMenuApi
} from "../navigation/app-menu/bookmarks-menu";

export type IconResourcePick = {
    /** Durable resource URL (`android-icon:…`, chrome `_favicon`, S2, https…). */
    iconUrl: string;
    packageName?: string;
    variant?: AndroidIconVariant;
    /** Icon-pack package when pick came from a themed pack. */
    pack?: string;
    drawable?: string;
    label?: string;
    source?: "android" | "bookmark" | "favicon" | "icon-pack";
};

type PickerOpts = {
    packageName?: string;
    /** Page / bookmark href — seeds CRX favicon variants. */
    pageUrl?: string;
    currentUrl?: string;
    theme?: "light" | "dark";
    onPick: (pick: IconResourcePick) => void;
};

const VARIANT_FALLBACK: Array<{ id: AndroidIconVariant; label: string }> = [
    { id: "default", label: "Default" },
    { id: "monochrome", label: "Material You" },
    { id: "foreground", label: "Adaptive FG" }
];

function resolveTheme(theme?: "light" | "dark"): "light" | "dark" {
    if (theme === "light" || theme === "dark") return theme;
    const pinned = String(document.documentElement.getAttribute("data-theme") || "").toLowerCase();
    return pinned === "light" ? "light" : "dark";
}

function httpPageUrl(raw: unknown): string {
    const u = String(raw || "").trim();
    return /^https?:\/\//i.test(u) ? u : "";
}

function googleS2Favicon(pageUrl: string, size = 128): string {
    try {
        const host = new URL(pageUrl).hostname;
        if (!host) return "";
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
    } catch {
        return "";
    }
}

function chromeExtensionFavicon(pageUrl: string, size = 128): string {
    try {
        const chromeRt = (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } })
            .chrome?.runtime;
        if (typeof chromeRt?.getURL !== "function") return "";
        const u = new URL(chromeRt.getURL("/_favicon/"));
        u.searchParams.set("pageUrl", pageUrl);
        u.searchParams.set("size", String(size));
        return u.toString();
    } catch {
        return "";
    }
}

function resolveFaviconCandidates(
    pageUrl: string,
    api: BookmarksMenuApi | null
): Array<{ label: string; url: string }> {
    const page = httpPageUrl(pageUrl);
    if (!page) return [];
    const out: Array<{ label: string; url: string }> = [];
    const seen = new Set<string>();
    const push = (label: string, url: string): void => {
        const u = String(url || "").trim();
        if (!u || seen.has(u)) return;
        seen.add(u);
        out.push({ label, url: u });
    };
    const fromApi = api?.resolveIconUrl?.(page, 128) || api?.resolveIconUrl?.(page, 64) || "";
    const s2 = googleS2Favicon(page, 128);
    if (s2) push("Google S2", s2);
    const s2sm = googleS2Favicon(page, 64);
    if (s2sm) push("Google S2 (64)", s2sm);
    const chromeFav = chromeExtensionFavicon(page, 128);
    if (chromeFav) push("Chrome favicon", chromeFav);
    if (fromApi) push("Bookmark favicon", fromApi);
    return out;
}

const PICKER_GRID_COLS = "repeat(auto-fill, minmax(4.75rem, 1fr))";

const pin = (el: HTMLElement, props: Record<string, string>): void => {
    for (const [name, value] of Object.entries(props)) {
        el.style.setProperty(name, value, "important");
    }
};

function pinPickerGrid(grid: HTMLElement): void {
    pin(grid, {
        display: "grid",
        "grid-template-columns": PICKER_GRID_COLS,
        gap: "0.5rem 0.4rem",
        "align-content": "start",
        "justify-content": "stretch",
        "min-inline-size": "0",
        "min-block-size": "0",
        "inline-size": "100%"
    });
}

/* WHY: Cap WebView keeps global `button { inline-flex; green chrome }` — pin column cards. */
function pinPickerCard(btn: HTMLButtonElement, img: HTMLImageElement, caption: HTMLElement): void {
    pin(btn, {
        display: "grid",
        "grid-template-columns": "minmax(0, 1fr)",
        "grid-template-rows": "auto max-content",
        "justify-items": "center",
        "align-content": "start",
        "align-items": "start",
        "flex-direction": "column",
        gap: "0.3rem",
        margin: "0",
        padding: "0.2rem 0.08rem 0.15rem",
        "min-inline-size": "0",
        "inline-size": "100%",
        "max-inline-size": "100%",
        "block-size": "auto",
        "min-block-size": "0",
        background: "transparent",
        border: "0",
        "border-radius": "0.7rem",
        "box-shadow": "none",
        appearance: "none",
        "-webkit-appearance": "none",
        position: "static",
        "z-index": "auto",
        overflow: "hidden"
    });
    pin(img, {
        display: "block",
        "grid-row": "1",
        "inline-size": "3rem",
        "block-size": "3rem",
        "max-inline-size": "3rem",
        "max-block-size": "3rem",
        "object-fit": "cover",
        "border-radius": "50%",
        "flex-shrink": "0"
    });
    pin(caption, {
        display: "block",
        "grid-row": "2",
        "inline-size": "100%",
        "max-inline-size": "100%",
        overflow: "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
        "font-size": "0.62rem",
        "line-height": "1.2",
        "text-align": "center",
        opacity: "0.88"
    });
}

function makeCard(label: string, title?: string): {
    btn: HTMLButtonElement;
    img: HTMLImageElement;
} {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sd-icon-picker__card";
    btn.title = title || label;
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";
    const caption = document.createElement("span");
    caption.className = "sd-icon-picker__card-label";
    caption.textContent = label;
    btn.append(img, caption);
    pinPickerCard(btn, img, caption);
    return { btn, img };
}

async function loadVariantCards(
    bridge: LauncherBridgeSpeedDialApi,
    pkg: string,
    host: HTMLElement,
    onPick: (pick: IconResourcePick) => void,
    close: () => void
): Promise<void> {
    host.replaceChildren();
    let variants = VARIANT_FALLBACK.map((v) => ({ ...v, available: true }));
    try {
        const listed = await bridge.launcherIconVariants?.(pkg);
        if (Array.isArray(listed) && listed.length) {
            variants = listed.map((v) => ({
                id: normalizeAndroidIconVariant(v.id),
                label: String(v.label || v.id),
                available: v.available !== false
            }));
        }
    } catch {
        /* fallbacks */
    }

    for (const v of variants) {
        if (!v.available && v.id !== "default") continue;
        const { btn, img } = makeCard(v.label);
        host.append(btn);
        void ensureLauncherIconObjectUrl(pkg, 96, v.id).then((url) => {
            if (!url) {
                btn.disabled = true;
                btn.title = `${v.label} (unavailable)`;
                return;
            }
            img.src = url;
        });
        btn.addEventListener("click", () => {
            onPick({
                iconUrl: formatAndroidIconRef(pkg, v.id),
                packageName: pkg,
                variant: v.id,
                label: v.label,
                source: "android"
            });
            close();
        });
    }
}

async function loadIconPackCards(
    bridge: LauncherBridgeSpeedDialApi,
    targetPkg: string,
    host: HTMLElement,
    onPick: (pick: IconResourcePick) => void,
    close: () => void
): Promise<void> {
    host.replaceChildren();
    host.classList.remove("sd-icon-picker__grid--browse");
    pinPickerGrid(host);
    if (!bridge.launcherIconPacks) {
        host.textContent = "Icon packs unavailable.";
        return;
    }
    let packs: Array<{ packageName: string; label: string; iconCacheKey?: string }> = [];
    try {
        packs = await bridge.launcherIconPacks();
    } catch {
        host.textContent = "Failed to list icon packs.";
        return;
    }
    if (!packs.length) {
        host.textContent = "No icon packs installed.";
        return;
    }

    const frag = document.createDocumentFragment();
    for (const pack of packs.slice(0, 64)) {
        const packPkg = String(pack.packageName || "").trim();
        if (!packPkg) continue;
        const label = String(pack.label || packPkg);
        const wrap = document.createElement("div");
        wrap.className = "sd-icon-picker__pack-wrap";
        pin(wrap, {
            position: "relative",
            "min-inline-size": "0",
            "inline-size": "100%"
        });

        const { btn, img } = makeCard(label, `${label} — tap to apply, grid to browse`);
        void ensureLauncherIconObjectUrl(targetPkg, 96, "default", packPkg).then((url) => {
            if (url) {
                img.src = url;
                return;
            }
            btn.disabled = true;
            btn.title = `${label} (no cover for this app)`;
            void ensureLauncherIconObjectUrl(packPkg, 72, "default").then((packIcon) => {
                if (packIcon) img.src = packIcon;
            });
        });
        btn.addEventListener("click", () => {
            if (btn.disabled) return;
            onPick({
                iconUrl: formatAndroidIconRef(targetPkg, "default", packPkg),
                packageName: targetPkg,
                variant: "default",
                pack: packPkg,
                label,
                source: "icon-pack"
            });
            close();
        });

        const browse = document.createElement("button");
        browse.type = "button";
        browse.className = "sd-icon-picker__pack-browse";
        pin(browse, {
            position: "absolute",
            "inset-block-start": "0",
            "inset-inline-end": "0",
            display: "grid",
            "place-items": "center",
            margin: "0",
            padding: "0",
            "inline-size": "1.2rem",
            "block-size": "1.2rem",
            "min-inline-size": "1.2rem",
            "min-block-size": "1.2rem",
            border: "0",
            "border-radius": "999px"
        });
        browse.title = `Browse icons in ${label}`;
        browse.setAttribute("aria-label", `Browse icons in ${label}`);
        browse.innerHTML = '<ui-icon icon="squares-four" aria-hidden="true"></ui-icon>';
        browse.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            host.dataset.packBrowse = "1";
            void loadPackDrawableBrowse(bridge, targetPkg, packPkg, label, host, onPick, close, () => {
                delete host.dataset.packBrowse;
                void loadIconPackCards(bridge, targetPkg, host, onPick, close);
            });
        });

        wrap.append(btn, browse);
        frag.append(wrap);
    }
    host.append(frag);
}

async function loadPackDrawableBrowse(
    bridge: LauncherBridgeSpeedDialApi,
    targetPkg: string,
    packPkg: string,
    packLabel: string,
    host: HTMLElement,
    onPick: (pick: IconResourcePick) => void,
    close: () => void,
    onBack: () => void
): Promise<void> {
    host.replaceChildren();
    host.classList.add("sd-icon-picker__grid--browse");
    host.style.setProperty("display", "grid", "important");
    host.style.setProperty("grid-template-columns", "minmax(0, 1fr)", "important");
    host.style.setProperty("grid-template-rows", "auto minmax(0, 1fr)", "important");
    host.style.setProperty("gap", "0.35rem", "important");
    const toolbar = document.createElement("div");
    toolbar.className = "sd-icon-picker__pack-toolbar";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "sd-icon-picker__pack-back";
    back.textContent = "Packs";
    back.addEventListener("click", () => onBack());
    const title = document.createElement("span");
    title.className = "sd-icon-picker__pack-title";
    title.textContent = packLabel;
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Filter…";
    search.autocomplete = "off";
    search.className = "sd-icon-picker__search";
    toolbar.append(back, title, search);

    const grid = document.createElement("div");
    grid.className = "sd-icon-picker__grid";
    pinPickerGrid(grid);

    host.append(toolbar, grid);

    let timer = 0;
    const refresh = (): void => {
        void (async () => {
            grid.replaceChildren();
            if (!bridge.launcherIconPackIcons) {
                grid.textContent = "Pack browse unavailable.";
                return;
            }
            let icons: Array<{ drawable: string; label: string }> = [];
            try {
                icons = await bridge.launcherIconPackIcons(packPkg, String(search.value || ""), 96);
            } catch {
                grid.textContent = "Failed to list pack icons.";
                return;
            }
            if (!icons.length) {
                grid.textContent = "No matching icons.";
                return;
            }
            const frag = document.createDocumentFragment();
            const resolvePkg = targetPkg || packPkg;
            for (const icon of icons) {
                const drawable = String(icon.drawable || "").trim();
                if (!drawable) continue;
                const { btn, img } = makeCard(
                    String(icon.label || drawable),
                    `${packLabel}: ${drawable}`
                );
                frag.append(btn);
                void ensureLauncherIconObjectUrl(
                    resolvePkg,
                    72,
                    "default",
                    packPkg,
                    drawable
                ).then((url) => {
                    if (url) img.src = url;
                    else btn.disabled = true;
                });
                btn.addEventListener("click", () => {
                    if (btn.disabled) return;
                    onPick({
                        iconUrl: formatAndroidIconRef(resolvePkg, "default", packPkg, drawable),
                        packageName: resolvePkg,
                        variant: "default",
                        pack: packPkg,
                        drawable,
                        label: String(icon.label || drawable),
                        source: "icon-pack"
                    });
                    close();
                });
            }
            grid.append(frag);
        })();
    };
    search.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(refresh, 160);
    });
    refresh();
}

async function loadAppBrowse(
    bridge: LauncherBridgeSpeedDialApi,
    query: string,
    host: HTMLElement,
    onPick: (pick: IconResourcePick) => void,
    close: () => void
): Promise<void> {
    host.replaceChildren();
    if (!bridge.launcherList) {
        host.textContent = "App list unavailable.";
        return;
    }
    let apps: Array<{ packageName: string; label: string; iconCacheKey?: string }> = [];
    try {
        apps = await bridge.launcherList(query);
    } catch {
        host.textContent = "Failed to list apps.";
        return;
    }
    if (!apps.length) {
        host.textContent = query.trim() ? "No matches." : "No apps.";
        return;
    }

    const frag = document.createDocumentFragment();
    for (const app of apps.slice(0, 96)) {
        const pkg = String(app.packageName || "").trim();
        if (!pkg) continue;
        const { btn, img } = makeCard(String(app.label || pkg), `${app.label} (${pkg})`);
        frag.append(btn);
        const cacheKey = String(app.iconCacheKey || pkg).trim() || pkg;
        void ensureLauncherIconObjectUrl(cacheKey, 72, "default").then((url) => {
            if (url) img.src = url;
        });
        btn.addEventListener("click", () => {
            onPick({
                iconUrl: formatAndroidIconRef(pkg, "default"),
                packageName: pkg,
                variant: "default",
                label: String(app.label || pkg),
                source: "android"
            });
            close();
        });
    }
    host.append(frag);
}

function loadFaviconVariantCards(
    pageUrl: string,
    api: BookmarksMenuApi | null,
    host: HTMLElement,
    onPick: (pick: IconResourcePick) => void,
    close: () => void
): void {
    host.replaceChildren();
    const candidates = resolveFaviconCandidates(pageUrl, api);
    if (!candidates.length) {
        host.textContent = "No favicon sources for this URL.";
        return;
    }
    for (const c of candidates) {
        const { btn, img } = makeCard(c.label, c.url);
        img.src = c.url;
        img.addEventListener("error", () => {
            btn.disabled = true;
            btn.title = `${c.label} (failed to load)`;
        });
        btn.addEventListener("click", () => {
            onPick({
                iconUrl: c.url,
                label: c.label,
                source: "favicon"
            });
            close();
        });
        host.append(btn);
    }
}

async function loadBookmarkBrowse(
    api: BookmarksMenuApi,
    query: string,
    host: HTMLElement,
    onPick: (pick: IconResourcePick) => void,
    close: () => void
): Promise<void> {
    host.replaceChildren();
    let entries: BookmarkMenuEntry[] = [];
    try {
        const q = String(query || "").trim();
        entries = q ? await api.search(q) : await api.listChildren();
    } catch {
        host.textContent = "Failed to list bookmarks.";
        return;
    }
    const links = entries.filter((e) => !e.folder && httpPageUrl(e.url));
    if (!links.length) {
        host.textContent = query.trim() ? "No matching bookmarks." : "No bookmarks.";
        return;
    }
    const frag = document.createDocumentFragment();
    for (const entry of links.slice(0, 80)) {
        const page = httpPageUrl(entry.url);
        if (!page) continue;
        const icon =
            api.resolveIconUrl?.(page, 64) ||
            chromeExtensionFavicon(page, 64) ||
            googleS2Favicon(page, 64);
        const { btn, img } = makeCard(String(entry.title || page), page);
        if (icon) img.src = icon;
        frag.append(btn);
        btn.addEventListener("click", () => {
            const preferred =
                api.resolveIconUrl?.(page, 128) ||
                chromeExtensionFavicon(page, 128) ||
                googleS2Favicon(page, 128) ||
                icon;
            if (!preferred) return;
            onPick({
                iconUrl: preferred,
                label: String(entry.title || page),
                source: "bookmark"
            });
            close();
        });
    }
    host.append(frag);
}

/**
 * Modal picker:
 * - Capacitor: Material You / adaptive + icon packs + installed apps (`android-icon:`)
 * - CRX: favicon variants for a page URL + browse Chrome bookmarks
 */
export async function openIconResourcePicker(opts: PickerOpts): Promise<void> {
    const bridge = await getLauncherBridgeForSpeedDial();
    const bookmarksApi = resolveBookmarksMenuApi();
    const hasAndroid = Boolean(bridge?.launcherIcon);
    const pageSeed =
        httpPageUrl(opts.pageUrl) ||
        httpPageUrl(opts.currentUrl) ||
        "";
    const hasBookmarks = Boolean(bookmarksApi) || Boolean(pageSeed);
    if (!hasAndroid && !hasBookmarks) {
        console.warn("[icon-resource-picker] no launcher bridge or bookmarks/favicon source");
        return;
    }

    const theme = resolveTheme(opts.theme);
    const pkgSeed = String(opts.packageName || "").trim();
    const showAndroidVariants = hasAndroid && Boolean(pkgSeed);
    const showIconPacks = hasAndroid && Boolean(pkgSeed) && Boolean(bridge?.launcherIconPacks);
    const showAndroidBrowse = hasAndroid && Boolean(bridge?.launcherList);
    const showFaviconVariants = Boolean(pageSeed);
    const showBookmarkBrowse = Boolean(bookmarksApi);

    const tabs: Array<{ id: string; label: string }> = [];
    if (showAndroidVariants) tabs.push({ id: "variants", label: "This app" });
    if (showIconPacks) tabs.push({ id: "packs", label: "Packs" });
    if (showFaviconVariants) tabs.push({ id: "favicon", label: "Link" });
    if (showAndroidBrowse) tabs.push({ id: "browse", label: "Apps" });
    if (showBookmarkBrowse) tabs.push({ id: "bookmarks", label: "Bookmarks" });
    const initialTab = tabs[0]?.id || "browse";

    const dialog = document.createElement("dialog");
    /* INVARIANT: not `.speed-dial-editor` / `.modal-*` — those rules stack a second panel and z-index cards. */
    dialog.className = "sd-icon-picker";
    dialog.dataset.theme = theme;
    dialog.dataset.tab = initialTab;
    dialog.innerHTML = `
        <form class="sd-icon-picker__form" data-theme="${theme}" method="dialog">
            <header class="sd-icon-picker__header">
                <h2 class="sd-icon-picker__title">Icon</h2>
                <nav class="sd-icon-picker__tabs" role="tablist" aria-label="Icon source"></nav>
                <input class="sd-icon-picker__search" data-search type="search" placeholder="Search…" autocomplete="off" hidden />
            </header>
            <div class="sd-icon-picker__body">
                <section class="sd-icon-picker__section" data-section="variants" hidden>
                    <div class="sd-icon-picker__grid" data-variants></div>
                </section>
                <section class="sd-icon-picker__section" data-section="packs" hidden>
                    <div class="sd-icon-picker__grid" data-packs></div>
                </section>
                <section class="sd-icon-picker__section" data-section="favicon" hidden>
                    <div class="sd-icon-picker__grid" data-favicon></div>
                </section>
                <section class="sd-icon-picker__section" data-section="browse" hidden>
                    <div class="sd-icon-picker__grid" data-browse></div>
                </section>
                <section class="sd-icon-picker__section" data-section="bookmarks" hidden>
                    <div class="sd-icon-picker__grid" data-bookmarks></div>
                </section>
            </div>
            <footer class="sd-icon-picker__footer">
                <button type="button" data-action="cancel" class="sd-icon-picker__cancel">Cancel</button>
            </footer>
        </form>
    `;
    /* WHY: Cap <dialog> ignores margin:auto — same full-viewport grid as ShortcutEditor. */
    pin(dialog, {
        position: "fixed",
        inset: "0",
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
        width: "100%",
        height: "100%",
        "inline-size": "100%",
        "block-size": "100%",
        "max-inline-size": "100%",
        "max-block-size": "100%",
        "max-width": "100%",
        "max-height": "100%",
        margin: "0",
        padding: "1rem",
        display: "grid",
        "place-items": "center",
        "place-content": "center",
        background: "transparent",
        border: "none",
        "border-radius": "0",
        "box-shadow": "none",
        overflow: "auto"
    });
    const formEl = dialog.querySelector<HTMLElement>(".sd-icon-picker__form");
    if (formEl) {
        pin(formEl, {
            display: "flex",
            "flex-direction": "column",
            "inline-size": "min(90cqi, 100dvi)",
            width: "min(90cqi, 100dvi)",
            "max-inline-size": "100%",
            "max-block-size": "min(86dvh, 36rem)",
            margin: "0",
            padding: "0",
            "border-radius": "18px",
            overflow: "hidden",
            "justify-self": "center",
            "align-self": "center",
            background: "color-mix(in oklab, var(--color-surface-container, Canvas) 92%, transparent)"
        });
    }
    const tabsEl = dialog.querySelector<HTMLElement>(".sd-icon-picker__tabs");
    if (tabsEl) {
        pin(tabsEl, {
            display: "grid",
            "grid-auto-flow": "column",
            "grid-auto-columns": "1fr",
            gap: "0.28rem",
            "inline-size": "100%"
        });
    }
    const bodyEl = dialog.querySelector<HTMLElement>(".sd-icon-picker__body");
    if (bodyEl) {
        pin(bodyEl, {
            display: "block",
            padding: "0.65rem 0.85rem 0.45rem",
            "min-block-size": "0",
            "max-block-size": "min(26rem, 52dvh)",
            overflow: "auto",
            background: "transparent"
        });
    }
    const footerEl = dialog.querySelector<HTMLElement>(".sd-icon-picker__footer");
    if (footerEl) {
        pin(footerEl, {
            display: "flex",
            "justify-content": "flex-end",
            "align-items": "center",
            gap: "0.45rem",
            padding: "0.55rem 0.85rem 0.7rem"
        });
    }
    const cancelEl = dialog.querySelector<HTMLElement>(".sd-icon-picker__cancel");
    if (cancelEl) {
        pin(cancelEl, {
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
            flex: "0 0 auto",
            margin: "0",
            padding: "0.42rem 0.86rem",
            "inline-size": "auto",
            width: "auto",
            "min-inline-size": "0",
            "max-inline-size": "none",
            "border-radius": "0.65rem"
        });
    }

    const form = dialog.querySelector("form") as HTMLFormElement;
    const tablist = dialog.querySelector<HTMLElement>(".sd-icon-picker__tabs");
    const search = dialog.querySelector<HTMLInputElement>("[data-search]");
    const variantsHost = dialog.querySelector<HTMLElement>("[data-variants]");
    const packsHost = dialog.querySelector<HTMLElement>("[data-packs]");
    const faviconHost = dialog.querySelector<HTMLElement>("[data-favicon]");
    const browseHost = dialog.querySelector<HTMLElement>("[data-browse]");
    const bookmarksHost = dialog.querySelector<HTMLElement>("[data-bookmarks]");

    let closed = false;
    const close = (): void => {
        if (closed) return;
        closed = true;
        try {
            if (dialog.open) dialog.close();
        } catch {
            /* ignore */
        }
        dialog.remove();
    };

    const onPick = (pick: IconResourcePick): void => {
        opts.onPick(pick);
    };

    form.addEventListener("click", (ev) => {
        const action = (ev.target as HTMLElement | null)
            ?.closest?.("[data-action]")
            ?.getAttribute("data-action");
        if (action === "cancel") {
            ev.preventDefault();
            close();
        }
    });
    dialog.addEventListener("cancel", (ev) => {
        ev.preventDefault();
        close();
    });
    dialog.addEventListener("click", (ev) => {
        if (ev.target === dialog) close();
    });

    const setTab = (id: string): void => {
        dialog.dataset.tab = id;
        dialog.querySelectorAll<HTMLElement>("[data-section]").forEach((section) => {
            section.hidden = section.dataset.section !== id;
        });
        tablist?.querySelectorAll<HTMLElement>("[data-tab]").forEach((btn) => {
            const on = btn.dataset.tab === id;
            btn.toggleAttribute("data-active", on);
            btn.setAttribute("aria-selected", on ? "true" : "false");
            btn.tabIndex = on ? 0 : -1;
        });
        const wantsSearch = id === "browse" || id === "bookmarks";
        if (search) {
            search.hidden = !wantsSearch;
            search.placeholder = id === "bookmarks" ? "Search bookmarks…" : "Search apps…";
            if (wantsSearch) search.value = "";
        }
        if (id === "packs" && packsHost?.dataset.packBrowse === "1" && bridge && pkgSeed) {
            delete packsHost.dataset.packBrowse;
            void loadIconPackCards(bridge, pkgSeed, packsHost, onPick, close);
        }
    };

    if (tablist) {
        const frag = document.createDocumentFragment();
        for (const tab of tabs) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sd-icon-picker__tab";
            btn.dataset.tab = tab.id;
            btn.setAttribute("role", "tab");
            btn.textContent = tab.label;
            pin(btn, {
                display: "inline-flex",
                flex: "1 1 0",
                "align-items": "center",
                "justify-content": "center",
                margin: "0",
                padding: "0.38rem 0.4rem",
                border: "0",
                "border-radius": "999px",
                "inline-size": "100%",
                "min-inline-size": "0",
                "block-size": "auto"
            });
            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                setTab(tab.id);
            });
            frag.append(btn);
        }
        tablist.append(frag);
        tablist.hidden = tabs.length <= 1;
    }

    if (showAndroidVariants && bridge && variantsHost) {
        void loadVariantCards(bridge, pkgSeed, variantsHost, onPick, close);
    }
    if (showIconPacks && bridge && packsHost && pkgSeed) {
        void loadIconPackCards(bridge, pkgSeed, packsHost, onPick, close);
    }
    if (showFaviconVariants && faviconHost) {
        loadFaviconVariantCards(pageSeed, bookmarksApi, faviconHost, onPick, close);
    }

    let appTimer = 0;
    const refreshApps = (): void => {
        if (!browseHost || !bridge) return;
        void loadAppBrowse(bridge, String(search?.value || ""), browseHost, onPick, close);
    };
    let bmTimer = 0;
    const refreshBookmarks = (): void => {
        if (!bookmarksHost || !bookmarksApi) return;
        void loadBookmarkBrowse(bookmarksApi, String(search?.value || ""), bookmarksHost, onPick, close);
    };
    search?.addEventListener("input", () => {
        const tab = dialog.dataset.tab;
        if (tab === "browse") {
            window.clearTimeout(appTimer);
            appTimer = window.setTimeout(refreshApps, 180);
            return;
        }
        if (tab === "bookmarks") {
            window.clearTimeout(bmTimer);
            bmTimer = window.setTimeout(refreshBookmarks, 180);
        }
    });
    if (showAndroidBrowse) refreshApps();
    if (showBookmarkBrowse && bookmarksApi) refreshBookmarks();
    tablist?.addEventListener("click", (ev) => {
        const id = (ev.target as HTMLElement | null)?.closest?.("[data-tab]")?.getAttribute("data-tab");
        if (id === "browse") refreshApps();
        if (id === "bookmarks") refreshBookmarks();
    });

    setTab(initialTab);

    document.body.append(dialog);
    /* WHY: Cap WebView flaky with layered picker CSS — pin dense grid on mount. */
    dialog.querySelectorAll<HTMLElement>(".sd-icon-picker__grid").forEach(pinPickerGrid);
    try {
        dialog.showModal();
    } catch {
        dialog.setAttribute("open", "");
    }
}

/** Icon-only button that opens {@link openIconResourcePicker} and fills an input. */
export function attachIconResourcePickButton(
    field: HTMLElement,
    input: HTMLInputElement,
    opts: {
        packageName?: string | (() => string);
        pageUrl?: string | (() => string);
        theme?: "light" | "dark";
    }
): HTMLButtonElement {
    let row = field.querySelector<HTMLElement>(".sd-icon-resource-row");
    if (!row) {
        row = document.createElement("div");
        row.className = "sd-icon-resource-row";
        input.replaceWith(row);
        row.append(input);
    }
    /* WHY: Cap ignored layered SCSS — pin input|button on one row via inline style. */
    row.style.setProperty("display", "grid", "important");
    row.style.setProperty("grid-template-columns", "minmax(0,1fr) 2.5rem 2.5rem", "important");
    row.style.setProperty("align-items", "stretch", "important");
    row.style.setProperty("gap", "0.45rem", "important");
    row.style.setProperty("min-inline-size", "0", "important");
    row.style.setProperty("inline-size", "100%", "important");

    let btn = row.querySelector<HTMLButtonElement>("[data-action='pick-icon']");
    if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn secondary sd-icon-resource-pick";
        btn.setAttribute("data-action", "pick-icon");
        btn.title = "Pick alternative icon";
        btn.setAttribute("aria-label", "Pick alternative icon");
        btn.innerHTML =
            '<ui-icon icon="squares-four" icon-style="duotone" aria-hidden="true"></ui-icon>';
        row.append(btn);
    }

    let photoBtn = row.querySelector<HTMLButtonElement>("[data-action='pick-photo']");
    if (!photoBtn) {
        photoBtn = document.createElement("button");
        photoBtn.type = "button";
        photoBtn.className = "btn secondary sd-icon-resource-pick";
        photoBtn.setAttribute("data-action", "pick-photo");
        photoBtn.title = "Use photo / avatar";
        photoBtn.setAttribute("aria-label", "Use photo or avatar");
        photoBtn.innerHTML =
            '<ui-icon icon="user-circle" icon-style="duotone" aria-hidden="true"></ui-icon>';
        row.append(photoBtn);
    }

    if (input.parentElement !== row) {
        row.moveBefore(input, btn);
    }
    /* Keep order: input → pick-icon → pick-photo */
    if (btn.parentElement === row && photoBtn.parentElement === row) {
        row.append(btn, photoBtn);
        row.moveBefore(input, btn);
    }

    const stylePickBtn = (el: HTMLButtonElement) => {
        el.style.setProperty("display", "inline-flex", "important");
        el.style.setProperty("align-items", "center", "important");
        el.style.setProperty("justify-content", "center", "important");
        el.style.setProperty("inline-size", "2.5rem", "important");
        el.style.setProperty("min-inline-size", "2.5rem", "important");
        el.style.setProperty("max-inline-size", "2.5rem", "important");
        el.style.setProperty("min-block-size", "2.5rem", "important");
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("margin", "0", "important");
    };
    stylePickBtn(btn);
    stylePickBtn(photoBtn);

    btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const pkg =
            typeof opts.packageName === "function"
                ? opts.packageName()
                : String(opts.packageName || "").trim();
        const pageUrl =
            typeof opts.pageUrl === "function"
                ? opts.pageUrl()
                : String(opts.pageUrl || "").trim();
        void openIconResourcePicker({
            packageName: pkg,
            pageUrl,
            currentUrl: input.value,
            theme: opts.theme,
            onPick: (pick) => {
                input.value = pick.iconUrl;
                input.setAttribute("value", pick.iconUrl);
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }
        });
    });

    photoBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";
        document.body.append(fileInput);
        fileInput.addEventListener(
            "change",
            () => {
                const file = fileInput.files?.[0];
                fileInput.remove();
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = String(reader.result || "").trim();
                    if (!dataUrl.startsWith("data:image/")) return;
                    input.value = dataUrl;
                    input.setAttribute("value", dataUrl);
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    /* Prefer colored bitmap for photos/avatars. */
                    const display = field
                        .closest("form")
                        ?.querySelector<HTMLSelectElement>('select[name="iconDisplay"]');
                    if (display) {
                        display.value = "colored";
                        display.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                };
                reader.readAsDataURL(file);
            },
            { once: true }
        );
        fileInput.click();
    });

    return btn;
}
