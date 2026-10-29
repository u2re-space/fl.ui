/*
 * Filename: action-registry.ts
 * FullPath: modules/projects/fl.ui/src/ui/speed-dial/action-registry.ts
 * Change date and time: 08.48.00_24.08.2026
 * Reason for changes: Hydrate paints launcher bitmaps onto ui-icon — no light-DOM img.
 * FIND:pin-shortcut
 * TAG:icon-hydrate
 */

import { navigate } from "@fest-lib/lure";
import {
    NAVIGATION_SHORTCUTS,
    buildSpeedDialViewPathHref,
    isExternalWebHref,
    normalizeExternalWebHref,
    canUseNativeOpenUri,
    openInDetachedBrowserWindow,
    openInNewBrowserTab,
    parseSpeedDialViewFromHref,
    normalizeOpenLinkTarget,
    resolveItemOpenLinkTarget,
    resolveSpeedDialItemHref,
    copySpeedDialItemToClipboard,
    getSpeedDialMeta,
    tileIconFetchSize,
    type SpeedDialItem,
    type SpeedDialMetaRegistry
} from "./launcher-state.ts";
import { showSuccess, showError } from "./toast.ts";
import { isLauncherLaunchSpecEmpty, resolveAppLaunchSpec } from "./app-launch.ts";
import { getSpeedDialViewOpener } from "./view-opener.ts";
import {
    androidIconCacheKey,
    formatAndroidIconRef,
    isAndroidIconRef,
    normalizeAndroidIconVariant,
    parseAndroidIconRef,
    type AndroidIconVariant
} from "./android-icon-ref.ts";

/** Minimal launcher IPC surface — host registers at boot (Capacitor entry). */
export type LauncherBridgeSpeedDialApi = {
    launcherLaunch: (
        pkg: string,
        component?: string,
        launch?: import("./app-launch.ts").LauncherLaunchSpec
    ) => Promise<boolean>;
    launcherStartShortcut?: (pkg: string, shortcutId: string) => Promise<boolean>;
    launcherShortcutIcon?: (pkg: string, shortcutId: string, size?: number) => Promise<string>;
    launcherOpenUri?: (
        uri: string,
        options?: { packageName?: string; chooser?: boolean; title?: string; mimeType?: string }
    ) => Promise<boolean>;
    launcherIcon?: (
        cacheKey: string,
        size?: number,
        variant?: string,
        pack?: string,
        drawable?: string
    ) => Promise<string>;
    /** One IPC for a grid of app/shortcut icons. Missing on older hosts — callers fall back. */
    launcherIcons?: (
        items: Array<{
            key: string;
            kind: "app" | "shortcut";
            packageName: string;
            shortcutId?: string;
            size?: number;
            variant?: string;
            pack?: string;
            drawable?: string;
        }>
    ) => Promise<Array<{ key: string; dataUrl: string }>>;
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
    launcherList?: (query?: string) => Promise<
        Array<{
            packageName: string;
            label: string;
            componentName?: string;
            iconCacheKey?: string;
        }>
    >;
    widgetList?: (query?: string) => Promise<
        Array<{
            provider: string;
            packageName: string;
            label: string;
            spanCols: number;
            spanRows: number;
            preview?: string;
        }>
    >;
    widgetBind?: (provider: string) => Promise<{
        provider: string;
        packageName: string;
        label: string;
        spanCols: number;
        spanRows: number;
        widgetId: number;
        preview?: string;
    } | null>;
    widgetAttach?: (box: { widgetId: number; x: number; y: number; w: number; h: number }) => Promise<boolean>;
    widgetLayout?: (box: { widgetId: number; x: number; y: number; w: number; h: number }) => Promise<boolean>;
    widgetDetach?: (widgetId: number) => Promise<boolean>;
    widgetDelete?: (widgetId: number) => Promise<boolean>;
    widgetHideAll?: () => Promise<boolean>;
};

let registeredLauncherBridge: LauncherBridgeSpeedDialApi | null = null;

/** In-memory cache: Android package → blob: object URL (web-native image). */
const launcherIconObjectUrlCache = new Map<string, string>();
const shortcutIconObjectUrlCache = new Map<string, string>();

/** PERF: fetch(data:) round-trips the whole PNG through the network stack. */
function dataUrlToObjectUrl(dataUrl: string): string {
    const url = String(dataUrl || "").trim();
    if (!url.startsWith("data:")) return url;
    const comma = url.indexOf(",");
    if (comma < 0) return url;
    const header = url.slice(5, comma);
    const mime = (header.split(";")[0] || "image/png").trim() || "image/png";
    const isBase64 = /;base64/i.test(header);
    try {
        const payload = url.slice(comma + 1);
        const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch {
        return url;
    }
}

type IconBatchSpec = {
    resultKey: string;
    kind: "app" | "shortcut";
    packageName: string;
    shortcutId: string;
    size: number;
    variant: string;
    pack: string;
    drawable: string;
};

type IconBatchJob = {
    spec: IconBatchSpec;
    resolve: (url: string) => void;
};

const iconBatchQueue = new Map<string, IconBatchJob>();
let iconBatchScheduled = false;
let iconBatchFlushing = false;
let iconBatchUnsupported = false;
const ICON_BATCH_LIMIT = 16;

const deliverIconBatch = (spec: IconBatchSpec, dataUrl: string): string => {
    const url = String(dataUrl || "").trim();
    if (!url) return "";
    const objectUrl = dataUrlToObjectUrl(url);
    if (spec.kind === "shortcut") shortcutIconObjectUrlCache.set(spec.resultKey, objectUrl);
    else launcherIconObjectUrlCache.set(spec.resultKey, objectUrl);
    return objectUrl;
};

const fetchOneLauncherIcon = async (
    bridge: LauncherBridgeSpeedDialApi,
    spec: IconBatchSpec
): Promise<string> => {
    try {
        if (spec.kind === "shortcut") {
            if (!bridge.launcherShortcutIcon) return "";
            return String(
                (await bridge.launcherShortcutIcon(spec.packageName, spec.shortcutId, spec.size)) || ""
            ).trim();
        }
        if (!bridge.launcherIcon) return "";
        return String(
            (await bridge.launcherIcon(
                spec.packageName,
                spec.size,
                spec.variant,
                spec.pack || undefined,
                spec.drawable || undefined
            )) || ""
        ).trim();
    } catch {
        return "";
    }
};

const resolveIconBatchJobs = async (
    bridge: LauncherBridgeSpeedDialApi | null,
    jobs: IconBatchJob[]
): Promise<void> => {
    const pending = new Map(jobs.map((job) => [job.spec.resultKey, job]));
    const finish = (job: IconBatchJob, dataUrl: string): void => {
        pending.delete(job.spec.resultKey);
        job.resolve(deliverIconBatch(job.spec, dataUrl));
    };

    if (
        bridge?.launcherIcons &&
        !iconBatchUnsupported &&
        jobs.length > 1
    ) {
        try {
            const rows = await bridge.launcherIcons(
                jobs.map((job) => ({
                    key: job.spec.resultKey,
                    kind: job.spec.kind,
                    packageName: job.spec.packageName,
                    shortcutId: job.spec.shortcutId || undefined,
                    size: job.spec.size,
                    variant: job.spec.variant,
                    pack: job.spec.pack || undefined,
                    drawable: job.spec.drawable || undefined
                }))
            );
            if (!rows?.length) iconBatchUnsupported = true;
            else {
                for (const row of rows) {
                    const job = pending.get(String(row?.key || ""));
                    if (!job) continue;
                    const dataUrl = String(row?.dataUrl || "").trim();
                    if (!dataUrl) continue;
                    finish(job, dataUrl);
                }
            }
        } catch {
            iconBatchUnsupported = true;
        }
    }

    const missed = [...pending.values()];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, missed.length) }, async () => {
        while (cursor < missed.length) {
            const job = missed[cursor++];
            if (!job || !bridge) {
                job?.resolve("");
                continue;
            }
            finish(job, await fetchOneLauncherIcon(bridge, job.spec));
        }
    });
    await Promise.all(workers);
};

const flushIconBatch = async (): Promise<void> => {
    if (iconBatchFlushing) return;
    iconBatchFlushing = true;
    try {
        const bridge = await resolveLauncherBridgeForSpeedDial();
        while (iconBatchQueue.size > 0) {
            const jobs = [...iconBatchQueue.values()].slice(0, ICON_BATCH_LIMIT);
            for (const job of jobs) iconBatchQueue.delete(job.spec.resultKey);
            await resolveIconBatchJobs(bridge, jobs);
        }
    } finally {
        iconBatchFlushing = false;
        if (iconBatchQueue.size > 0) void flushIconBatch();
    }
};

const enqueueLauncherIcon = (spec: IconBatchSpec): Promise<string> => {
    const queued = iconBatchQueue.get(spec.resultKey);
    if (queued) {
        return new Promise((resolve) => {
            const prev = queued.resolve;
            queued.resolve = (url) => {
                prev(url);
                resolve(url);
            };
        });
    }
    return new Promise((resolve) => {
        iconBatchQueue.set(spec.resultKey, { spec, resolve });
        if (iconBatchScheduled) return;
        iconBatchScheduled = true;
        scheduler?.yield?.()?.then?.(() => {
            iconBatchScheduled = false;
            void flushIconBatch();
        });
    });
};

/** Cached blob URL for an Android launcher icon, if already fetched this session. */
/**
 * Parse `shortcut:pkg::id` (current) or `shortcut:pkg/id` (COMPAT).
 * WHY: Material Files ids are file paths (`/storage/...`); first-slash split is fragile.
 */
function parseShortcutCacheKey(cacheKey: string): { packageName: string; shortcutId: string } | null {
    const raw = String(cacheKey || "").trim();
    if (!raw.startsWith("shortcut:")) return null;
    const rest = raw.slice("shortcut:".length);
    const sep = rest.indexOf("::");
    if (sep > 0) {
        const packageName = rest.slice(0, sep).trim();
        const shortcutId = rest.slice(sep + 2).trim();
        return packageName && shortcutId ? { packageName, shortcutId } : null;
    }
    const slash = rest.indexOf("/");
    if (slash > 0) {
        const packageName = rest.slice(0, slash).trim();
        const shortcutId = rest.slice(slash + 1).trim();
        return packageName && shortcutId ? { packageName, shortcutId } : null;
    }
    return null;
}

export function getCachedLauncherIconObjectUrl(
    cacheKey: string,
    size = 96,
    variant: AndroidIconVariant | string = "default",
    pack: string = "",
    drawable: string = ""
): string {
    const pkg = String(cacheKey || "").trim();
    if (!pkg) return "";
    const shortcut = parseShortcutCacheKey(pkg);
    if (shortcut) {
        return getCachedShortcutIconObjectUrl(shortcut.packageName, shortcut.shortcutId, size);
    }
    return (
        launcherIconObjectUrlCache.get(
            androidIconCacheKey(pkg, variant, pack, drawable, size)
        ) || ""
    );
}

/** Publisher package + pinned ShortcutInfo id for file / app shortcuts. */
export function getLauncherShortcutRef(
    item: { id: string; action?: string }
): { packageName: string; shortcutId: string } | null {
    const meta = getSpeedDialMeta(item.id);
    const shortcutId = String(meta?.shortcutId || "").trim();
    const packageName = String(
        meta?.packageName || (meta as { publisherPackage?: string } | null)?.publisherPackage || ""
    ).trim();
    /*
     * WHY: Material Files pins may persist as launch-shortcut, launch-app, or open-link
     * but always carry package + shortcutId. Any of those need the file icon, not Files.app.
     */
    if (!packageName || !shortcutId) return null;
    return { packageName, shortcutId };
}

export function getLauncherAppTileCacheKey(item: { id: string; action?: string }): string {
    const shortcut = getLauncherShortcutRef(item);
    /*
     * WHY: launch-shortcut must never use the publisher app package as icon cache key —
     * that paints Material Files instead of the document shortcut icon.
     * INVARIANT: separator is `::` so file-path ids (`/storage/...`) survive parse.
     */
    if (shortcut) return `shortcut:${shortcut.packageName}::${shortcut.shortcutId}`;
    const meta = getSpeedDialMeta(item.id);
    const action = String(meta?.action || item.action || "").trim();
    if (action === "launch-shortcut" || meta?.entityType === "android-shortcut") return "";
    if (action !== "launch-app" && meta?.entityType !== "android-app") {
        return "";
    }
    return String(meta?.iconCacheKey || meta?.packageName || "").trim();
}

export function isLauncherAppSpeedDialItem(item: { id: string; action?: string }): boolean {
    const meta = getSpeedDialMeta(item.id);
    const action = String(meta?.action || item.action || "").trim();
    if (action === "launch-shortcut" || meta?.entityType === "android-shortcut") return true;
    return getLauncherAppTileCacheKey(item).length > 0;
}

/** Fetch pinned-shortcut icon (document thumbnail / type icon), not the app icon. */
export async function ensureShortcutIconObjectUrl(
    pkg: string,
    shortcutId: string,
    size = 96
): Promise<string> {
    const packageName = String(pkg || "").trim();
    const id = String(shortcutId || "").trim();
    if (!packageName || !id) return "";
    const sz = Math.max(16, Math.min(512, Math.round(Number(size) || 96)));
    const key = `shortcut:${packageName}/${id}@${sz}`;
    const cached = shortcutIconObjectUrlCache.get(key);
    if (cached) return cached;

    return enqueueLauncherIcon({
        resultKey: key,
        kind: "shortcut",
        packageName,
        shortcutId: id,
        size: sz,
        variant: "default",
        pack: "",
        drawable: ""
    });
}

export function getCachedShortcutIconObjectUrl(
    pkg: string,
    shortcutId: string,
    size = 96
): string {
    const packageName = String(pkg || "").trim();
    const id = String(shortcutId || "").trim();
    if (!packageName || !id) return "";
    const sz = Math.max(16, Math.min(512, Math.round(Number(size) || 96)));
    return shortcutIconObjectUrlCache.get(`shortcut:${packageName}/${id}@${sz}`) || "";
}

/** Fetch native icon once, convert data: URL → blob: object URL for WebView. */
export async function ensureLauncherIconObjectUrl(
    cacheKey: string,
    size = 96,
    variant: AndroidIconVariant | string = "default",
    pack: string = "",
    drawable: string = ""
): Promise<string> {
    const pkg = String(cacheKey || "").trim();
    if (!pkg) return "";
    const shortcut = parseShortcutCacheKey(pkg);
    if (shortcut) {
        return ensureShortcutIconObjectUrl(shortcut.packageName, shortcut.shortcutId, size);
    }
    const v = normalizeAndroidIconVariant(variant);
    const packPkg = String(pack || "").trim();
    const draw = String(drawable || "").trim();
    const sz = Math.max(16, Math.min(512, Math.round(Number(size) || 96)));
    const key = androidIconCacheKey(pkg, v, packPkg, draw, sz);
    const cached = launcherIconObjectUrlCache.get(key);
    if (cached) return cached;

    return enqueueLauncherIcon({
        resultKey: key,
        kind: "app",
        packageName: pkg,
        shortcutId: "",
        size: sz,
        variant: v,
        pack: packPkg,
        drawable: draw
    });
}

/** Resolve durable `android-icon:` ref (or return plain URL as-is). */
export async function resolveIconResourceUrl(raw: unknown, size = 96): Promise<string> {
    const u = String(raw || "").trim();
    if (!u || u.startsWith("blob:")) return "";
    const parsed = parseAndroidIconRef(u);
    if (parsed) {
        return ensureLauncherIconObjectUrl(
            parsed.packageName,
            size,
            parsed.variant,
            parsed.pack || "",
            parsed.drawable || ""
        );
    }
    return u;
}

export function getCachedIconResourceObjectUrl(raw: unknown, size = 96): string {
    const parsed = parseAndroidIconRef(raw);
    if (!parsed) return "";
    return getCachedLauncherIconObjectUrl(
        parsed.packageName,
        size,
        parsed.variant,
        parsed.pack || "",
        parsed.drawable || ""
    );
}

export {
    formatAndroidIconRef,
    isAndroidIconRef,
    parseAndroidIconRef,
    normalizeAndroidIconVariant
};

export function getLauncherBridgeForSpeedDialSync(): LauncherBridgeSpeedDialApi | null {
    return registeredLauncherBridge;
}

export function applyLauncherIconToImg(host: HTMLImageElement, objectUrl: string): void {
    const url = String(objectUrl || "").trim();
    if (!url) return;
    if (host.src !== url) host.src = url;
    host.removeAttribute("data-icon-pending");
    host.toggleAttribute("data-launcher-icon-ready", true);
}

/** Host injects launcher IPC when dynamic `com/routing/native/launcher-bridge` is unavailable. */
export function setLauncherBridgeForSpeedDial(api: LauncherBridgeSpeedDialApi | null): void {
    registeredLauncherBridge = api;
}

async function resolveLauncherBridgeForSpeedDial(): Promise<LauncherBridgeSpeedDialApi | null> {
    if (registeredLauncherBridge) return registeredLauncherBridge;
    try {
        return (await import("com/routing/native/launcher-bridge")) as LauncherBridgeSpeedDialApi;
    } catch {
        return null;
    }
}

export async function getLauncherBridgeForSpeedDial(): Promise<LauncherBridgeSpeedDialApi | null> {
    return resolveLauncherBridgeForSpeedDial();
}

/** Launch a sibling ecosystem APK by SKU (launcher HOME only). */
export async function launchEcosystemSku(sku: string): Promise<boolean> {
    const { androidPackageForSku, isCwspSku } = await import(
        "../../../../subsystem/src/other/config/ecosystem-skus.ts"
    );
    if (!isCwspSku(sku)) return false;
    const pkg = androidPackageForSku(sku);
    if (!pkg) return false;
    const bridge = await resolveLauncherBridgeForSpeedDial();
    if (!bridge?.launcherLaunch) return false;
    return bridge.launcherLaunch(pkg);
}

/** Native launcher APK only — web `u2re.space` opens explorer/document/process in-process. */
export async function tryLaunchSiblingView(view: string): Promise<boolean> {
    try {
        const { isCwspNativeHost, readCwspSku, siblingSkuForView } = await import(
            "../../../../subsystem/src/other/config/ecosystem-skus.ts"
        );
        if (!isCwspNativeHost()) return false;
        const sku = readCwspSku();
        if (sku !== "launcher" && sku !== "explorer") return false;
        const sibling = siblingSkuForView(view);
        if (!sibling) return false;
        return launchEcosystemSku(sibling);
    } catch {
        return false;
    }
}

const viewIdForLinkTarget = (target: string): string => {
    if (target === "document") return "viewer";
    if (target === "transfer") return "network";
    return target;
};

/** Launch CWSP-document / process / transfer / explorer APK when the tile asks for that SKU. */
const tryLaunchLinkTargetSku = async (target: string): Promise<boolean> => {
    if (target === "viewer") return false;
    if (target === "document") return tryLaunchSiblingView("viewer");
    if (target === "transfer") return tryLaunchSiblingView("network");
    if (target === "workcenter" || target === "explorer") return tryLaunchSiblingView(target);
    return false;
};

/** Explorer virtual path → CwsStorageHost `/sdcard/` `/saf/`. */
export const nativeStorageVirtualPath = (raw: string): string => {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (/^\/(?:sdcard|saf)(?:\/|$)/i.test(s)) return s;
    if (/^(?:sdcard|saf)(?:\/|$)/i.test(s)) return `/${s}`;
    let stripped = s.replace(/^file:\/\/(?:localhost)?/i, "");
    try {
        stripped = decodeURIComponent(stripped);
    } catch {
        /* keep */
    }
    if (/^\/(?:sdcard|saf)(?:\/|$)/i.test(stripped)) return stripped;
    const mapped = stripped.replace(
        /^(?:\/storage\/emulated\/0|\/mnt\/sdcard|storage\/emulated\/0|mnt\/sdcard)(?=\/|$)/i,
        "/sdcard"
    );
    return /^\/sdcard(?:\/|$)/i.test(mapped) ? mapped : "";
};

const collectItemNativePath = (meta: any, item: any, extra = ""): string =>
    nativeStorageVirtualPath(
        String(meta?.path || item?.path || extra || meta?.href || item?.href || "")
    );

const SKU_ANDROID_PACKAGE: Record<string, string> = {
    document: "space.u2re.document",
    viewer: "space.u2re.document",
    workcenter: "space.u2re.process",
    transfer: "space.u2re.transfer",
    explorer: "space.u2re.explorer"
};

const packageForLinkTarget = async (target: string): Promise<string> => {
    try {
        const { androidPackageForSku } = await import("com/config/ecosystem-skus");
        if (target === "document" || target === "viewer") return androidPackageForSku("document") || SKU_ANDROID_PACKAGE.document;
        if (target === "workcenter") return androidPackageForSku("process") || SKU_ANDROID_PACKAGE.workcenter;
        if (target === "transfer") return androidPackageForSku("transfer") || SKU_ANDROID_PACKAGE.transfer;
        if (target === "explorer") return androidPackageForSku("explorer") || SKU_ANDROID_PACKAGE.explorer;
    } catch {
        /* home-view symlink / web */
    }
    return SKU_ANDROID_PACKAGE[target] || "";
};

/**
 * WHY: `/sdcard/note.md` has no scheme — Cap `openUri` rejects it. FileProvider + SEND/VIEW
 * through `storage:open` is the one hop that reaches Document / Process / the system sheet.
 */
const openNativeStorageByLinkTarget = async (
    path: string,
    linkTarget: string,
    mimeType?: string
): Promise<boolean> => {
    const virtual = nativeStorageVirtualPath(path);
    if (!virtual) return false;
    try {
        /* WHY: home-view is a symlink of this file — relative `../explorer/` resolves under views/, not fl.ui. */
        const { openNativeStorageFile } = await import("fl-ui/explorer/storage-bridge");
        const declared = String(mimeType || "").trim();
        /* WHY: system sheet (QuickEdit, …) matches text/plain, not text/markdown. */
        const systemMime =
            !declared ||
            /^text\/(?:x-)?markdown$/i.test(declared) ||
            /^application\/json$/i.test(declared) ||
            (declared.startsWith("text/") && declared !== "text/html")
                ? "text/plain"
                : declared;
        const mime = String(mimeType || "").trim();
        if (
            linkTarget === "external-app" ||
            linkTarget === "new-tab" ||
            linkTarget === "native-window"
        ) {
            return openNativeStorageFile(virtual, { chooser: true, mimeType: systemMime, title: "Open with" });
        }
        if (linkTarget === "inline") {
            const looksDoc = /\.(md|markdown|txt|pdf|png|jpe?g|gif|webp|svg|html?)$/i.test(virtual);
            if (looksDoc) {
                const pkg = await packageForLinkTarget("document");
                if (
                    pkg &&
                    (await openNativeStorageFile(virtual, {
                        packageName: pkg,
                        chooser: false,
                        mimeType: mime,
                        title: "Open"
                    }))
                ) {
                    return true;
                }
            }
            return openNativeStorageFile(virtual, { chooser: true, mimeType: systemMime, title: "Open with" });
        }
        const pkg = await packageForLinkTarget(linkTarget);
        if (
            pkg &&
            (await openNativeStorageFile(virtual, {
                packageName: pkg,
                chooser: false,
                mimeType: mime,
                title: "Open"
            }))
        ) {
            return true;
        }
        return openNativeStorageFile(virtual, { chooser: true, mimeType: systemMime, title: "Open with" });
    } catch {
        return false;
    }
};

/** Apply fetched Android icon to a launcher `ui-icon` via resource + presentation mode. */
export function applyLauncherIconToUiIcon(
    host: HTMLElement,
    objectUrl: string,
    mode: "colored" | "masked" | "masked-inverse" | "auto" = "colored"
): void {
    const url = String(objectUrl || "").trim();
    if (!url) return;
    host.setAttribute("icon-padding", "0");
    host.style.setProperty("--icon-padding", "0px");
    host.style.setProperty("--icon-size", "100%");
    host.toggleAttribute("data-launcher-icon", true);

    const apply = (): boolean => {
        const icon = host as HTMLElement & {
            setResourceIcon?: (u: string, m?: string) => unknown;
            setBitmapPresentationMode?: (m: string, locked?: boolean) => unknown;
        };
        if (typeof icon.setResourceIcon !== "function") return false;
        icon.setResourceIcon(url, mode === "auto" ? "auto" : mode);
        if (mode !== "auto" && typeof icon.setBitmapPresentationMode === "function") {
            icon.setBitmapPresentationMode(mode, true);
        }
        host.removeAttribute("data-icon-pending");
        host.toggleAttribute("data-launcher-icon-ready", true);
        return true;
    };

    if (apply()) return;

    void customElements.whenDefined("ui-icon").then(() => {
        if (!host.isConnected) return;
        apply();
    });
}

/** Create a launcher `ui-icon` host (`data-launcher-icon`). */
export function createLauncherUiIconElement(): HTMLElement {
    const host = document.createElement("ui-icon");
    host.className = "ui-ws-item-icon-native";
    host.dataset.launcherIcon = "1";
    host.setAttribute("icon-source", "resource");
    host.setAttribute("icon-padding", "0");
    host.style.setProperty("--icon-padding", "0px");
    host.style.setProperty("--icon-size", "100%");
    host.setAttribute("aria-hidden", "true");
    host.toggleAttribute("data-icon-pending", true);
    return host;
}

/** @deprecated Prefer {@link createLauncherUiIconElement} + {@link applyLauncherIconToUiIcon}. */
export function applyLauncherIconImgUrl(host: HTMLImageElement, dataUrl: string): void {
    const url = String(dataUrl || "").trim();
    if (!url) return;
    host.src = url;
    host.removeAttribute("data-icon-pending");
    host.toggleAttribute("data-launcher-icon-ready", true);
}

/** @deprecated WebView often ignores `mask-image: var(--url)` — prefer {@link applyLauncherIconImgUrl}. */
export function applyLauncherIconMaskUrl(host: HTMLElement, dataUrl: string): void {
    const url = String(dataUrl || "").trim();
    if (!url) return;
    const safe = url.replace(/"/g, '\\"');
    const maskValue = `url("${safe}")`;
    host.style.setProperty("-webkit-mask-image", maskValue);
    host.style.setProperty("mask-image", maskValue);
    host.toggleAttribute("data-launcher-icon-ready", true);
}

/** Create a launcher app icon `<img>` host (`data-launcher-icon`). */
export function createLauncherIconImgElement(): HTMLImageElement {
    const host = document.createElement("img");
    host.className = "ui-ws-item-icon-img";
    host.dataset.launcherIcon = "1";
    host.alt = "";
    host.decoding = "async";
    host.draggable = false;
    host.referrerPolicy = "no-referrer";
    host.toggleAttribute("data-icon-pending", true);
    return host;
}

/** Create a launcher app icon mask host (`data-launcher-icon`). */
export function createLauncherIconMaskElement(): HTMLElement {
    const host = document.createElement("span");
    host.className = "ui-ws-item-icon-mask";
    host.dataset.launcherIcon = "1";
    host.setAttribute("aria-hidden", "true");
    return host;
}

/** Load Android app / pinned-shortcut icon into a SpeedDial tile. */
export async function hydrateLauncherAppTileIcon(
    el: HTMLElement,
    item: { id: string; action?: string; iconDisplay?: string; iconUrl?: string }
): Promise<void> {
    const shortcut = getLauncherShortcutRef(item);
    const cacheKey = getLauncherAppTileCacheKey(item);
    if (!cacheKey) return;

    const readDisplay = (): string =>
        String(item.iconDisplay || el.getAttribute("data-icon-display") || "")
            .trim()
            .toLowerCase();

    const isGlyph = (d: string): boolean =>
        d === "glyph" || d === "phosphor" || d === "name";

    /* WHY: launch-shortcut starts as a folder glyph; skip would leave no file icon. */
    if (!shortcut && isGlyph(readDisplay())) return;

    const meta = getSpeedDialMeta(item.id);
    const fetchSize = tileIconFetchSize((meta as { iconScale?: unknown } | undefined)?.iconScale);

    // blob: is session-ephemeral — ignore so we re-fetch the launcher bitmap.
    const explicitUrl = (() => {
        const u = String(item.iconUrl || "").trim();
        if (!u || u.startsWith("blob:")) return "";
        return u;
    })();

    const paintOnUiIcon = (
        url: string,
        mode: "colored" | "masked" | "masked-inverse"
    ): void => {
        el.querySelectorAll("img.ui-ws-item-icon-img, img[data-launcher-icon], .ui-ws-item-icon-mask").forEach(
            (n) => n.remove()
        );
        let icon = el.querySelector<HTMLElement>("ui-icon");
        if (!icon) {
            icon = createLauncherUiIconElement();
            el.prepend(icon);
        }
        icon.setAttribute("resource", url);
        applyLauncherIconToUiIcon(icon, url, mode);
        if (!isGlyph(readDisplay())) el.setAttribute("data-icon-display", mode);
    };

    if (explicitUrl) {
        const display = readDisplay();
        const applyResolved = (url: string): void => {
            if (!url || (!shortcut && isGlyph(readDisplay()))) return;
            if (display === "masked" || display === "masked-inverse") {
                paintOnUiIcon(url, display);
                return;
            }
            paintOnUiIcon(url, "colored");
        };
        if (isAndroidIconRef(explicitUrl)) {
            const cached = getCachedIconResourceObjectUrl(explicitUrl, fetchSize);
            if (cached) applyResolved(cached);
            void resolveIconResourceUrl(explicitUrl, fetchSize).then(applyResolved);
            return;
        }
        applyResolved(explicitUrl);
        return;
    }

    const objectUrl = shortcut
        ? await ensureShortcutIconObjectUrl(shortcut.packageName, shortcut.shortcutId, fetchSize)
        : await ensureLauncherIconObjectUrl(cacheKey, fetchSize);
    if (!objectUrl || !el.isConnected) {
        if (shortcut) {
            el.querySelectorAll("ui-icon[data-icon-pending]").forEach((n) =>
                n.removeAttribute("data-icon-pending")
            );
        }
        return;
    }

    const display = readDisplay();
    if (!shortcut && isGlyph(display)) return;
    if (String(item.iconUrl || "").trim() && !String(item.iconUrl).startsWith("blob:")) return;

    if (display === "masked" || display === "masked-inverse") {
        paintOnUiIcon(objectUrl, display);
        return;
    }

    paintOnUiIcon(objectUrl, "colored");
}

/*
 * Markdown-view family alias normalization (inlined from
 * `modules/views/window-frame/src/views/markdown-view-window.ts`).
 * WHY: fl.ui must stay standalone — the relative import `../../../window-frame/...`
 * does not resolve from this package. The alias set is tiny and stable, so we keep
 * a private copy here to avoid a broken cross-package dependency.
 * INVARIANT: keep this set in sync with the source-of-truth module if it changes.
 */
const MARKDOWN_VIEW_MANAGED_WINDOW_KEY = "viewer" as const;
const MARKDOWN_VIEW_ALIASES = new Set([
    "markdown",
    "markdown-view",
    "markdown-viewer",
    "reader",
    /* `ui-taskbar` / `makeTask("#env-viewer")` — hash becomes this id. */
    "env-viewer"
]);
/**
 * Strip legacy desktop typos, normalize markdown family → {@link MARKDOWN_VIEW_MANAGED_WINDOW_KEY};
 * leave all other ids unchanged (`explorer`, `settings`, …).
 */
const normalizeMarkdownViewWindowId = (raw: string): string => {
    let id = String(raw ?? "").trim().toLowerCase();
    id = id.replace(/^#/, "");
    const todo = /^todo:\s*(.*)$/i.exec(id);
    if (todo) id = String(todo[1] ?? "").trim().toLowerCase();
    id = id.replace(/\s+/g, "");
    if (!id) return "";
    if (id === MARKDOWN_VIEW_MANAGED_WINDOW_KEY || MARKDOWN_VIEW_ALIASES.has(id)) {
        return MARKDOWN_VIEW_MANAGED_WINDOW_KEY;
    }
    return id;
};

/**
 * Resolve speed-dial / shortcut `meta.view` and desktop `viewId` strings to a canonical `ViewId`.
 * WHY: Persisted rows may store the human label ("Markdown", "Plan") or legacy ids; {@link normalizeMarkdownViewWindowId}
 * only covers the markdown family.
 */
export function resolveOpenViewTarget(raw: string | undefined | null): string {
    const t = String(raw ?? "").trim();
    if (!t) return "";
    const tLower = t.toLowerCase().replace(/^#/, "");
    const byShortcut = NAVIGATION_SHORTCUTS.find(
        (s) =>
            String(s.view).toLowerCase() === tLower ||
            String(s.label).trim().toLowerCase() === tLower
    );
    if (byShortcut) return String(byShortcut.view);
    const md = normalizeMarkdownViewWindowId(t);
    return md || t.replace(/^#/, "").trim();
}

/** Same arity as handlers invoked from SpeedDial.runItemAction. */
export type SpeedDialActionHandler = (context: any, second?: any, third?: HTMLElement) => any;

const actionRegistry = new Map<string, SpeedDialActionHandler>();
const labelsPerAction = new Map<string, (entityDesc: any) => string>();
const iconsPerAction = new Map<string, string>();

let builtinsInstalled = false;

/**
 * Prefer content/file/http data over `intent:` that embeds the publisher package.
 * Also unwrap `intent:content://…#Intent;…` / `intent://…#Intent;scheme=https;…`.
 */
const preferDataUriOverIntent = (
    href: string,
    meta?: { href?: string; intentUri?: string } | null
): string => {
    const candidates = [
        String(href || "").trim(),
        String(meta?.href || "").trim(),
        String((meta as { intentUri?: string } | null | undefined)?.intentUri || "").trim()
    ].filter(Boolean);
    for (const c of candidates) {
        if (/^(content:|file:|https?:)/i.test(c)) return c;
    }
    const intentish = candidates.find((c) => /^intent:/i.test(c)) || "";
    if (!intentish) return String(href || "").trim();

    const direct =
        intentish.match(/^intent:(content:[^#]+)/i) ||
        intentish.match(/^intent:(file:[^#]+)/i) ||
        intentish.match(/^intent:(https?:[^#]+)/i);
    if (direct?.[1]) return direct[1];

    const dataParam = intentish.match(/;data=((?:content|file|https?):[^;]+)/i);
    if (dataParam?.[1]) {
        try {
            return decodeURIComponent(dataParam[1]);
        } catch {
            return dataParam[1];
        }
    }

    /* intent://host/path#Intent;scheme=content|https;… */
    const schemeMatch = intentish.match(/;scheme=([a-zA-Z][a-zA-Z0-9+.-]*)/i);
    const pathMatch = intentish.match(/^intent:([^#]*)#/i);
    if (schemeMatch?.[1] && pathMatch) {
        const sch = schemeMatch[1].toLowerCase();
        if (sch === "http" || sch === "https" || sch === "content" || sch === "file") {
            let rest = String(pathMatch[1] || "");
            if (rest.startsWith("//")) return `${sch}:${rest}`;
            if (rest.startsWith("/")) return `${sch}:/${rest}`; /* rare */
            if (rest) return `${sch}://${rest}`;
        }
    }
    return String(href || "").trim();
};

const guessMimeFromHrefOrLabel = (href: string, label: string): string => {
    const name = `${label} ${href}`.toLowerCase();
    if (/\.txt(\b|$|[?#])/i.test(name) || /\.log(\b|$|[?#])/i.test(name) || /\.csv(\b|$|[?#])/i.test(name)) {
        return "text/plain";
    }
    if (/\.md(\b|$|[?#])/i.test(name) || /\.markdown(\b|$|[?#])/i.test(name)) return "text/markdown";
    if (/\.pdf(\b|$|[?#])/i.test(name)) return "application/pdf";
    if (/\.png(\b|$|[?#])/i.test(name)) return "image/png";
    if (/\.jpe?g(\b|$|[?#])/i.test(name)) return "image/jpeg";
    if (/\.gif(\b|$|[?#])/i.test(name)) return "image/gif";
    if (/\.webp(\b|$|[?#])/i.test(name)) return "image/webp";
    if (/\.mp4(\b|$|[?#])/i.test(name)) return "video/mp4";
    if (/\.mp3(\b|$|[?#])/i.test(name)) return "audio/mpeg";
    if (/\.html?(\b|$|[?#])/i.test(name)) return "text/html";
    if (/\.json(\b|$|[?#])/i.test(name)) return "application/json";
    if (/\.zip(\b|$|[?#])/i.test(name)) return "application/zip";
    return "";
};

/**
 * Turn bare view tokens (`settings`, `#workcenter`, `/viewer`) into absolute
 * mono-app URLs (`https://host/settings?shell=environment&native=1&view=settings`).
 * External http(s)/mailto links pass through unchanged.
 */
export const normalizeSpeedDialOpenHref = (raw: string): string => {
    const input = String(raw || "").trim();
    if (!input) return "";
    if (/^(mailto:|blob:|data:|content:|file:|intent:|package:|android-app:)/i.test(input)) {
        return input;
    }
    /* Other absolute schemes (custom providers) — do not rewrite to mono views. */
    if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https?:/i.test(input)) {
        return input;
    }

    const asView = (candidate: string): string => {
        const view = resolveOpenViewTarget(candidate);
        return view ? buildSpeedDialViewPathHref(view, true, { native: true }) : "";
    };

    /* Already absolute http(s). */
    if (/^https?:\/\//i.test(input)) {
        try {
            const u = new URL(input);
            if (typeof location !== "undefined" && u.origin === location.origin) {
                const seg = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
                const mono = asView(seg);
                if (mono) return mono;
            }
            return u.href;
        } catch {
            return input;
        }
    }

    if (input.startsWith("/")) {
        const seg = input.replace(/^\//, "").split(/[/?#]/)[0];
        const mono = asView(seg);
        if (mono) return mono;
        try {
            return new URL(input, location.href).href;
        } catch {
            return input;
        }
    }

    const token = input.replace(/^#/, "").split(/[/?#]/)[0].trim();
    const mono = asView(token);
    if (mono && !/[.:]/.test(token)) return mono;

    try {
        return new URL(input, location.href).href;
    } catch {
        return input;
    }
};

const copyTextToClipboard = async (text: string): Promise<void> => {
    const t = String(text || "").trim();
    if (!t.length) throw new Error("empty");
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        return;
    }
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
};

const ensureHashNavigation = (view: string, viewMaker?: any, props?: Record<string, string>): void => {
    if (!view || typeof window === "undefined") return;
    if (typeof viewMaker === "function") {
        viewMaker(view, props);
        return;
    }
    const opener = getSpeedDialViewOpener();
    if (opener) {
        opener(view, props);
        return;
    }
    const hash = `#${String(view).replace(/^#/, "")}`;
    if (location.hash !== hash) navigate(hash);
};

const installBuiltins = (): void => {
    if (builtinsInstalled) return;
    builtinsInstalled = true;

    iconsPerAction.set("open-view", "compass");
    iconsPerAction.set("open-link", "arrow-square-out");
    iconsPerAction.set("copy-link", "copy");
    iconsPerAction.set("copy-state-desc", "brackets-curly");

    labelsPerAction.set("open-view", (d: any) => `Open ${d?.label || "view"}`);
    labelsPerAction.set("open-link", (d: any) => (d?.label ? `Open ${d.label}` : "Open link"));
    labelsPerAction.set("copy-link", () => "Copy link");
    labelsPerAction.set("copy-state-desc", () => "Copy shortcut");

    actionRegistry.set("open-view", async (context: any, entityDesc?: any) => {
        const item = context?.items?.find?.((i: SpeedDialItem) => i?.id === context?.id) || null;
        const metaMap = context?.meta as SpeedDialMetaRegistry | undefined;
        const meta = item && metaMap?.get ? metaMap.get(item.id) : null;
        const linkTarget =
            context?.openLinkTarget != null
                ? normalizeOpenLinkTarget(context.openLinkTarget)
                : meta?.openLinkTarget != null && String(meta.openLinkTarget).trim()
                  ? normalizeOpenLinkTarget(meta.openLinkTarget)
                  : "inline";
        const nativePath = collectItemNativePath(meta, item || entityDesc);
        /* WHY: Open-in Document/Process on an open-view tile used to launch an empty sibling APK. */
        if (nativePath && !nativePath.endsWith("/")) {
            const mime = guessMimeFromHrefOrLabel(
                nativePath,
                String(meta?.description || item?.label || entityDesc?.label || "")
            );
            if (await openNativeStorageByLinkTarget(nativePath, linkTarget, mime)) return;
            showError("Allow all-files access, then open again");
            return;
        }
        const rawTarget = meta?.view || entityDesc?.view || entityDesc?.type || "";
        const targetView = resolveOpenViewTarget(String(rawTarget || ""));
        if (!targetView) {
            showError("No view target");
            return;
        }
        if (!nativePath && (await tryLaunchSiblingView(targetView))) return;
        const viewMaker = context?.viewMaker ?? getSpeedDialViewOpener();
        /*
         * Explicit per-tile / menu Native → new PWA/app window (same as open-link native).
         * Default open-view stays inline in the current environment shell.
         */
        if (
            linkTarget === "viewer" ||
            linkTarget === "document" ||
            linkTarget === "explorer" ||
            linkTarget === "workcenter" ||
            linkTarget === "transfer"
        ) {
            if (await tryLaunchLinkTargetSku(linkTarget)) return;
            ensureHashNavigation(viewIdForLinkTarget(linkTarget), viewMaker, {});
            return;
        }
        if (linkTarget === "native-window") {
            const href = buildSpeedDialViewPathHref(targetView, true, { native: true });
            if (!href) {
                showError("Link is missing");
                return;
            }
            if (!openInDetachedBrowserWindow(href)) {
                showError("Unable to open native window");
            }
            return;
        }
        if (linkTarget === "new-tab") {
            const href = buildSpeedDialViewPathHref(targetView, true, { native: false });
            if (!href) {
                showError("Link is missing");
                return;
            }
            if (!openInNewBrowserTab(href)) {
                showError("Unable to open new tab");
            }
            return;
        }
        ensureHashNavigation(targetView, viewMaker, {});
    });

    actionRegistry.set("open-link", async (context: any) => {
        const item = context?.items?.find?.((i: SpeedDialItem) => i?.id === context?.id) || null;
        const metaMap = context?.meta as SpeedDialMetaRegistry | undefined;
        const meta = item && metaMap?.get ? metaMap.get(item.id) : null;
        /*
         * - native-window → PWA app window when installed (mono `?native=1`); else detached
         * - inline → floating env window (app view) or iframe browser for http(s)
         * - new-tab → ordinary browser tab (`target=_blank`) for http(s)/www or app URL
         */
        const raw = meta?.href || (item as any)?.href || context?.href || resolveSpeedDialItemHref(item);
        const nativePath = nativeStorageVirtualPath(
            String(meta?.path || (item as { path?: string } | null)?.path || raw || "")
        );
        const viewFromMeta = resolveOpenViewTarget(String(meta?.view || ""));
        const externalHref = isExternalWebHref(raw) ? normalizeExternalWebHref(raw) || normalizeSpeedDialOpenHref(String(raw || "")) : "";
        const view = externalHref
            ? ""
            : resolveOpenViewTarget(parseSpeedDialViewFromHref(String(raw || ""))) || viewFromMeta;
        const linkTarget =
            context?.openLinkTarget != null
                ? normalizeOpenLinkTarget(context.openLinkTarget)
                : resolveItemOpenLinkTarget(meta);
        const opener = context?.viewMaker ?? getSpeedDialViewOpener();

        /* WHY: `/sdcard/…` is not a URL — openUri needs FileProvider. Do not launch an empty sibling APK. */
        if (nativePath) {
            const mime = guessMimeFromHrefOrLabel(
                nativePath,
                String(meta?.description || item?.label || "")
            );
            if (await openNativeStorageByLinkTarget(nativePath, linkTarget, mime)) return;
            showError("Allow all-files access, then open again");
            return;
        }

        /* Inline: http(s) → iframe browser first (never markdown viewer). */
        if (linkTarget === "inline") {
            if (externalHref && typeof opener === "function") {
                try {
                    /* Flat params — HomeView spreads into ViewOptions.params. */
                    opener("browser", { url: externalHref, href: externalHref });
                    return;
                } catch (e) {
                    console.warn("[speed-dial] inline browser open failed", e);
                }
            }
            if (view && typeof opener === "function") {
                try {
                    opener(view, {});
                    return;
                } catch (e) {
                    console.warn("[speed-dial] inline openView failed; falling back to URL", e);
                }
            }
            if (externalHref && openInNewBrowserTab(externalHref)) {
                showError("Inline embed unavailable — opened in a new tab");
                return;
            }
            showError(externalHref ? "Unable to open link inline" : "Link is missing");
            return;
        }

        const openViaNativeUri = async (
            href: string,
            opts: { chooser: boolean }
        ): Promise<boolean> => {
            const bridge = await resolveLauncherBridgeForSpeedDial();
            if (!bridge?.launcherOpenUri) return false;
            const mimeType = String(
                (meta as { mimeType?: string } | null)?.mimeType ||
                    guessMimeFromHrefOrLabel(href, String(meta?.description || item?.label || ""))
            ).trim();
            try {
                return await bridge.launcherOpenUri(href, {
                    chooser: opts.chooser,
                    title: opts.chooser ? "Open with" : undefined,
                    ...(mimeType ? { mimeType } : {})
                });
            } catch {
                return false;
            }
        };

        if (
            linkTarget === "viewer" ||
            linkTarget === "document" ||
            linkTarget === "explorer" ||
            linkTarget === "workcenter" ||
            linkTarget === "transfer"
        ) {
            const src = externalHref || normalizeSpeedDialOpenHref(String(raw || ""));
            const viewId = viewIdForLinkTarget(linkTarget);
            if (src) {
                try {
                    const { stashSkuHandoff } = await import(
                        "../../../../subsystem/src/other/config/ecosystem-skus.ts"
                    );
                    stashSkuHandoff({ dest: viewId, src, filename: String(item?.label || "") });
                } catch {
                    /* web / no session */
                }
            }
            if (await tryLaunchLinkTargetSku(linkTarget)) return;
            if (typeof opener === "function") {
                try {
                    opener(viewId, {
                        src,
                        url: src,
                        href: src,
                        path: src,
                        filename: String(item?.label || meta?.description || "")
                    });
                    return;
                } catch (e) {
                    console.warn("[speed-dial] view-sink open failed", e);
                }
            }
            ensureHashNavigation(viewId, opener, { src, url: src, href: src, path: src });
            return;
        }

        /* Android/Cap: system chooser (Chrome, YouTube, …). Web → new tab. */
        if (linkTarget === "external-app") {
            const href = externalHref
                ? externalHref
                : view
                  ? buildSpeedDialViewPathHref(view, true, { native: false })
                  : normalizeSpeedDialOpenHref(String(raw || ""));
            if (!href) {
                showError("Link is missing");
                return;
            }
            /* Prefer plain content/file/http over intent: that embeds publisher package. */
            const openHref = preferDataUriOverIntent(href, meta);
            /* WHY: a shared workspace link should open in Chrome when it is installed. */
            if (externalHref && canUseNativeOpenUri()) {
                const bridge = await resolveLauncherBridgeForSpeedDial();
                if (bridge?.launcherOpenUri) {
                    const inChrome = await bridge.launcherOpenUri(openHref, {
                        packageName: "com.android.chrome",
                        chooser: false,
                        title: "Chrome"
                    }).catch(() => false);
                    if (inChrome) return;
                }
            }
            if (canUseNativeOpenUri() && (await openViaNativeUri(openHref, { chooser: true }))) return;
            if (!openInNewBrowserTab(href)) {
                showError("Unable to open in app");
            }
            return;
        }

        /* New browser tab — keep external URLs as-is; app views open without native=1. */
        if (linkTarget === "new-tab") {
            const href = externalHref
                ? externalHref
                : view
                  ? buildSpeedDialViewPathHref(view, true, { native: false })
                  : normalizeSpeedDialOpenHref(String(raw || ""));
            if (!href) {
                showError("Link is missing");
                return;
            }
            /* WHY: do not await Cap bridge on web — that drops the click gesture and blocks the tab. */
            if (canUseNativeOpenUri() && externalHref && (await openViaNativeUri(href, { chooser: false }))) return;
            if (!openInNewBrowserTab(href)) {
                showError("Unable to open new tab");
            }
            return;
        }

        /* Native / detached window: mono boot for app views; Cap http(s) → chooser. */
        const href = externalHref
            ? externalHref
            : view
              ? buildSpeedDialViewPathHref(view, true, { native: true })
              : normalizeSpeedDialOpenHref(String(raw || ""));
        if (!href) {
            showError("Link is missing");
            return;
        }
        if (externalHref && (await openViaNativeUri(href, { chooser: true }))) return;
        if (!openInDetachedBrowserWindow(href)) {
            showError("Unable to open native window (popup blocked?)");
        }
    });

    actionRegistry.set("copy-link", async (context: any) => {
        const item = context?.items?.find?.((i: SpeedDialItem) => i?.id === context?.id) || null;
        const metaMap = context?.meta as SpeedDialMetaRegistry | undefined;
        const meta = item && metaMap?.get ? metaMap.get(item.id) : null;
        const raw = meta?.href || (item as any)?.href || context?.href || resolveSpeedDialItemHref(item);
        const href = normalizeSpeedDialOpenHref(String(raw || ""));
        if (!href) {
            showError("Nothing to copy");
            return;
        }
        try {
            await copyTextToClipboard(String(href));
            showSuccess("Link copied");
        } catch (e) {
            console.warn(e);
            showError("Failed to copy link");
        }
    });

    actionRegistry.set("copy-state-desc", async (context: any) => {
        const item = context?.items?.find?.((i: SpeedDialItem) => i?.id === context?.id) || null;
        if (!item) {
            showError("Nothing to copy");
            return;
        }
        try {
            await copySpeedDialItemToClipboard(item);
            showSuccess("Shortcut copied");
        } catch (e) {
            console.warn(e);
            showError("Failed to copy shortcut");
        }
    });

    /*
     * Task 3 — open a virtual path (directory or file) from a mirror tile.
     *
     * WHY: mirror tiles carry `path` (PathRouter virtual path) and optionally
     * `href` (Chrome bookmark URL). Directories open the Explorer at that
     * path; `.md`/`.txt`/image files open the viewer; URL hrefs delegate to
     * `open-link`. The Explorer view reads `params.path` into `initialPath`
     * (see environment-shell explorer runtime.ts `loadLastPath`).
     *
     * INVARIANT: never `location.assign` — go through the registered view
     * opener so the shell controls window/tab placement.
     */
    iconsPerAction.set("launch-app", "device-mobile");
    labelsPerAction.set("launch-app", (d: any) => `Launch ${d?.label || d?.packageName || "app"}`);
    actionRegistry.set("launch-app", async (context: any, entityDesc?: any) => {
        const item =
            context?.items?.find?.((i: SpeedDialItem) => i?.id === context?.id) ||
            (entityDesc?.id ? entityDesc : null);
        const metaMap = context?.meta as SpeedDialMetaRegistry | undefined;
        const itemId = String(entityDesc?.id || context?.id || item?.id || "").trim();
        const meta =
            (itemId && metaMap?.get ? metaMap.get(itemId) : null) ||
            entityDesc?.meta ||
            null;
        /* WHY: old pins wrongly stored Material Files as launch-app — upgrade if shortcutId present. */
        const shortcutId = String(
            (meta as { shortcutId?: string } | null)?.shortcutId || entityDesc?.shortcutId || ""
        ).trim();
        const pkg = String(meta?.packageName || entityDesc?.packageName || "").trim();
        if (shortcutId && pkg) {
            const bridge = await resolveLauncherBridgeForSpeedDial();
            if (bridge?.launcherStartShortcut) {
                const ok = await bridge.launcherStartShortcut(pkg, shortcutId);
                if (ok) return;
            }
        }
        if (!pkg) {
            showError("App missing");
            return;
        }
        const bridge = await resolveLauncherBridgeForSpeedDial();
        if (!bridge?.launcherLaunch) {
            showError("Unable to launch app");
            return;
        }
        const spec = resolveAppLaunchSpec(pkg);
        const component =
            spec.componentName ||
            String(meta?.componentName || entityDesc?.componentName || "").trim() ||
            undefined;
        const ok = await bridge.launcherLaunch(
            pkg,
            component,
            isLauncherLaunchSpecEmpty(spec) ? undefined : spec
        );
        if (!ok) showError("Unable to launch app");
    });

    iconsPerAction.set("launch-shortcut", "folder");
    labelsPerAction.set(
        "launch-shortcut",
        (d: any) => `Open ${d?.label || d?.shortcutId || "shortcut"}`
    );
    actionRegistry.set("launch-shortcut", async (context: any, entityDesc?: any) => {
        const item =
            context?.items?.find?.((i: SpeedDialItem) => i?.id === context?.id) ||
            (entityDesc?.id ? entityDesc : null);
        const metaMap = context?.meta as SpeedDialMetaRegistry | undefined;
        const itemId = String(entityDesc?.id || context?.id || item?.id || "").trim();
        const meta =
            (itemId && metaMap?.get ? metaMap.get(itemId) : null) ||
            entityDesc?.meta ||
            null;
        const pkg = String(meta?.packageName || entityDesc?.packageName || "").trim();
        const shortcutId = String(
            (meta as { shortcutId?: string } | null)?.shortcutId || entityDesc?.shortcutId || ""
        ).trim();
        const linkTarget =
            context?.openLinkTarget != null
                ? normalizeOpenLinkTarget(context.openLinkTarget)
                : resolveItemOpenLinkTarget(meta);
        const nativePath = collectItemNativePath(meta, item || entityDesc);
        if (nativePath && !nativePath.endsWith("/")) {
            const mime = guessMimeFromHrefOrLabel(
                nativePath,
                String(meta?.description || item?.label || "")
            );
            if (await openNativeStorageByLinkTarget(nativePath, linkTarget, mime)) return;
        }
        if (!pkg || !shortcutId) {
            showError("Shortcut missing");
            return;
        }
        const bridge = await resolveLauncherBridgeForSpeedDial();
        if (!bridge?.launcherStartShortcut) {
            showError("Unable to open shortcut");
            return;
        }
        const ok = await bridge.launcherStartShortcut(pkg, shortcutId);
        if (!ok) showError("Unable to open shortcut");
    });

    iconsPerAction.set("open-path", "folder");
    labelsPerAction.set("open-path", (d: any) => `Open ${d?.label || d?.path || "path"}`);
    actionRegistry.set("open-path", async (context: any, entityDesc?: any) => {
        const metaMap = context?.meta as SpeedDialMetaRegistry | undefined;
        const itemId = String(entityDesc?.id || context?.id || "").trim();
        const item = context?.items?.find?.((row: SpeedDialItem) => row?.id === itemId) || null;
        const meta = (itemId && metaMap?.get ? metaMap.get(itemId) : null) || entityDesc?.meta || null;
        const path = String(
            entityDesc?.path ||
                meta?.path ||
                (item as { path?: string } | null)?.path ||
                context?.path ||
                meta?.href ||
                ""
        ).trim();
        if (!path) {
            showError("Path is missing");
            return;
        }
        const opener = context?.viewMaker || getSpeedDialViewOpener();
        const linkTarget =
            context?.openLinkTarget != null
                ? normalizeOpenLinkTarget(context.openLinkTarget)
                : resolveItemOpenLinkTarget(meta);
        const isDirectory = path.endsWith("/") || entityDesc?.kind === "directory" || meta?.kind === "directory";
        const nativePath = nativeStorageVirtualPath(path);
        /* INVARIANT: Capacitor `/sdcard/` files go through storage:open — WebView cannot fetch them. */
        if (nativePath && !isDirectory) {
            const mime = guessMimeFromHrefOrLabel(nativePath, String(meta?.description || item?.label || ""));
            if (await openNativeStorageByLinkTarget(nativePath, linkTarget, mime)) return;
            showError("Allow all-files access, then open again");
            return;
        }
        if (isDirectory) {
            if (linkTarget === "explorer" && (await tryLaunchLinkTargetSku("explorer"))) return;
            await opener?.("explorer", { path, initialPath: path } as any);
            return;
        }
        if (/\.(md|markdown|txt)$/i.test(path) || (entityDesc?.type && String(entityDesc.type).startsWith("text/"))) {
            await opener?.("viewer", { src: path, path } as any);
            return;
        }
        if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(path)) {
            await opener?.("viewer", { src: path, path } as any);
            return;
        }
        // fallback: explorer parent
        await opener?.("explorer", { path, initialPath: path } as any);
    });

    for (const shortcut of NAVIGATION_SHORTCUTS) {
        const actionId = `open-view-${shortcut.view}`;
        if (!iconsPerAction.has(actionId)) iconsPerAction.set(actionId, shortcut.icon);
        if (!labelsPerAction.has(actionId)) labelsPerAction.set(actionId, () => `Open ${shortcut.label}`);
        if (!actionRegistry.has(actionId)) {
            actionRegistry.set(actionId, async (context: any) => {
                return actionRegistry.get("open-view")?.(context, {
                    label: shortcut.label,
                    type: shortcut.view,
                    view: shortcut.view,
                    DIR: "/"
                });
            });
        }
    }

    /*
     * WHY: `NAVIGATION_SHORTCUTS` registers `open-view-viewer` only; persisted grids / older builds used
     * `open-view-markdown` or `open-view-reader`. Re-map to canonical `viewer` (markdown-view module).
     */
    const viewerAliasActions: Array<{ alias: string; label: string }> = [
        { alias: "markdown", label: "Markdown" },
        { alias: "reader", label: "Markdown" }
    ];
    for (const { alias, label } of viewerAliasActions) {
        const actionId = `open-view-${alias}`;
        if (actionRegistry.has(actionId)) continue;
        iconsPerAction.set(actionId, "article");
        labelsPerAction.set(actionId, () => `Open ${label}`);
        actionRegistry.set(actionId, async (context: any) => {
            return actionRegistry.get("open-view")?.(context, {
                label,
                type: MARKDOWN_VIEW_MANAGED_WINDOW_KEY,
                view: MARKDOWN_VIEW_MANAGED_WINDOW_KEY,
                DIR: "/"
            });
        });
    }
};

/** Override or add a launcher action (e.g. host-specific). */
export function registerSpeedDialAction(id: string, handler: SpeedDialActionHandler): void {
    installBuiltins();
    actionRegistry.set(id, handler);
}

export function getSpeedDialActionRegistry(): Map<string, SpeedDialActionHandler> {
    installBuiltins();
    return actionRegistry;
}

export function getSpeedDialActionLabels(): Map<string, (entityDesc: any) => string> {
    installBuiltins();
    return labelsPerAction;
}

export function getSpeedDialActionIcons(): Map<string, string> {
    installBuiltins();
    return iconsPerAction;
}
