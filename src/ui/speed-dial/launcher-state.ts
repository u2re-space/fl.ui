/*
 * Filename: launcher-state.ts
 * FullPath: modules/projects/fl.ui/src/ui/speed-dial/launcher-state.ts
 * Change date and time: 22.36.00_23.08.2026
 * Reason for changes: Keep tile appearance across Side switch / reload (do not wipe inactive metas).
 *
 * Speed-dial / launcher persistence for fl.ui only (no core).
 * Storage keys match CWSP-shell `StateStorage` so shells sharing one origin keep one grid.
 */

import { JSOX } from "jsox";
import { makeObjectAssignable, observe, stringRef, safe } from "@fest-lib/object";
import {
    findNearestFreeRect,
    markOccupiedSpan,
    normalizeSpan,
    relocateItemsToLayout,
    normalizeOrient,
    pointToLogicalCell,
    type GridSpan
} from "./layout.ts";
import { decodeDesktopState, loadDesktopRaw, makeUIState, saveUIState } from "@fest-lib/lure";
import {
    createOpfsLinkStoreIo,
    migrateLocalStorageToOpfsIfNeeded,
    readLinkStore,
    writeLinkStore,
    packLinksFromSpeedDial,
    mergeMetaFile,
    buildMirrorSpeedDialItems,
    LS_ITEMS_KEY,
    LS_META_KEY,
    LS_MIGRATED_KEY,
    type LinkStoreIo,
    type LinkStoreItem,
    type LinkStoreMetaFile,
    type MirrorSpeedDialItem
} from "./link-store.ts";
/*
 * WHY (final review #1/#5): import PathRouter via the `fl-ui/explorer/path-router`
 * package alias instead of the relative `../explorer/path-router.ts`. fl.ui is
 * hardlinked into several host trees (e.g. `modules/views/home-view/src/ts/`),
 * where the relative path resolves to a non-existent `../explorer/…` folder.
 * The `fl-ui/*` alias is declared in both fl.ui's and CRX's tsconfig and maps
 * to the canonical `modules/projects/fl.ui/src/ui/*` tree, so every host
 * (CRX boot, Explorer, SpeedDial, hardlinked copies) resolves to ONE module
 * instance — no dual PathRouter registry.
 */
import { resolveFsBackend, subscribeFsBackendRegister } from "#fl-ui/explorer/path-router";
import { defaultIconScaleForDisplay } from "./tile-icon.ts";

/*
 * WHY: fl.ui must stay standalone — it cannot import `core/routing/core/views`
 * (that module only exists inside CWSP-shell / CrossWord hosts). Hosts may
 * register a build-time view enablement check; when none is registered we
 * allow every view so the speed-dial grid renders identically in isolation.
 */
type ViewEnabledCheck = (view: string) => boolean;
let viewEnabledCheck: ViewEnabledCheck | null = null;
/** Hosts (CWSP/CrossWord) may register build-time view enablement. Default: allow all. */
export function setSpeedDialViewEnabledCheck(fn: ViewEnabledCheck | null): void {
    viewEnabledCheck = typeof fn === "function" ? fn : null;
}
const isEnabledView = (view: string): boolean =>
    viewEnabledCheck ? viewEnabledCheck(String(view || "").trim()) : true;

export type GridCell = [number, number];

export interface SpeedDialItemMeta {
    action?: string;
    view?: string;
    href?: string;
    description?: string;
    shape?: string;
    /**
     * Icon presentation:
     * - `glyph` — Phosphor name in `item.icon`
     * - `masked` / `masked-inverse` / `colored` — resource in `iconUrl` (URL / data / blob)
     */
    iconDisplay?: string;
    /** Resource for masked / masked-inverse / colored (URL, data:, blob:). */
    iconUrl?: string;
    /**
     * Per-tile launcher/pack bitmap zoom inside the plate.
     * `auto` / omit → Workspace default; else `fit` | `fill` | `zoom` | `max`.
     */
    iconScale?: string;
    /** In-grid widget: `clock` | `search` | `android`. */
    widgetKind?: string;
    /** AppWidgetHost id after bind (Capacitor). */
    androidWidgetId?: number;
    androidProvider?: string;
    spanCols?: number;
    spanRows?: number;
    /** Clock widget: `24h` | `12h`. */
    clockFormat?: string;
    /** Search widget URL template; `%s` is the query. */
    searchUrl?: string;
    /**
     * Open destination:
     * - `native-window` — new browser window / mono native immersive
     * - `inline` — in-session floating window (same browser tab)
     * - `new-tab` — new browser tab (http/https/www and app deep links)
     */
    openLinkTarget?: OpenLinkTarget | string;
    /** Android package id for `launch-app` / `launch-shortcut` tiles (launcher SKU). */
    packageName?: string;
    /** Pinned ShortcutInfo id (`launch-shortcut`) — often a file path. */
    shortcutId?: string;
    /** Android activity component for `launch-app` tiles. */
    componentName?: string;
    /** Launcher icon cache key (matches AppMenu / launcher-bridge). */
    iconCacheKey?: string;
    /** e.g. `android-app` for launcher shortcuts. */
    entityType?: string;
    tags?: string[];
    [key: string]: any;
}

/**
 * How Open link / Open opens a destination.
 * - `native-window` — new **PWA app window** when installed (`?native=1`); else detached window
 * - `inline` — same tab, floating `ui-window` (app views or iframe for http(s))
 * - `new-tab` — ordinary browser **tab** (`target=_blank`) for http(s)/www or app URL
 * - `external-app` — Android/Cap: ACTION_VIEW chooser (Chrome, YouTube, …); web: same as new-tab
 * - `viewer` — Markdown in this shell
 * - `document` / `explorer` / `workcenter` / `transfer` — sibling CWSP SKU (or in-process view)
 * COMPAT: persisted `in-shell` → `inline`. Literal `new-tab` is the browser-tab mode again.
 */
export type OpenLinkTarget =
    | "native-window"
    | "inline"
    | "new-tab"
    | "external-app"
    | "viewer"
    | "document"
    | "explorer"
    | "workcenter"
    | "transfer";

const OPEN_LINK_TARGET_KEY = "rs-open-link-target";

export const normalizeOpenLinkTarget = (raw: unknown): OpenLinkTarget => {
    const v = String(raw || "").trim().toLowerCase();
    /* WHY: empty/unknown → inline (same-tab env window); native only when explicit. */
    if (!v) return "inline";
    if (v === "inline" || v === "in-shell" || v === "env" || v === "shell") {
        return "inline";
    }
    if (
        v === "new-tab" ||
        v === "newtab" ||
        v === "tab" ||
        v === "browser" ||
        v === "browser-tab" ||
        v === "external-tab"
    ) {
        return "new-tab";
    }
    if (
        v === "external-app" ||
        v === "app" ||
        v === "chooser" ||
        v === "open-with" ||
        v === "open-in-app" ||
        v === "intent"
    ) {
        return "external-app";
    }
    if (v === "viewer" || v === "markdown") return "viewer";
    if (v === "document" || v === "cwsp-document") return "document";
    if (v === "explorer" || v === "files") return "explorer";
    if (v === "workcenter" || v === "process" || v === "cwsp-process") return "workcenter";
    if (v === "transfer" || v === "cwsp" || v === "cwsp-transfer" || v === "network") return "transfer";
    if (v === "native-window" || v === "native" || v === "window" || v === "app-window") {
        return "native-window";
    }
    return "inline";
};

/** True for http(s), protocol-relative, or bare `www.` hosts (not app view paths). */
export const isExternalWebHref = (raw: unknown): boolean => {
    const s = String(raw || "").trim();
    if (!s || /^(mailto:|blob:|data:|javascript:)/i.test(s)) return false;
    if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) return true;
    if (/^www\./i.test(s)) return true;
    /* Bare host.tld[/…] — not a single view token like `settings`. */
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#]|$)/i.test(s) && !s.startsWith("/") && !s.startsWith("#")) {
        return true;
    }
    return false;
};

/** Normalize `www…` / `//…` / bare host into an absolute http(s) URL. */
export const normalizeExternalWebHref = (raw: unknown): string => {
    const s = String(raw || "").trim();
    if (!s) return "";
    try {
        if (/^https?:\/\//i.test(s)) return new URL(s).href;
        if (/^\/\//.test(s)) return new URL(`https:${s}`).href;
        if (/^www\./i.test(s) || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#]|$)/i.test(s)) {
            return new URL(`https://${s.replace(/^\/+/, "")}`).href;
        }
    } catch {
        return "";
    }
    return "";
};

/** Global default (Settings / localStorage); per-tile meta.openLinkTarget wins. */
export const getDefaultOpenLinkTarget = (): OpenLinkTarget => {
    try {
        const stored = localStorage.getItem(OPEN_LINK_TARGET_KEY);
        if (stored == null || !String(stored).trim()) {
            /* Cap/Android: system chooser. Views stay inline; http(s) uses defaultOpenLinkTargetForHref. */
            return prefersExternalAppOpenLink() ? "external-app" : "inline";
        }
        return normalizeOpenLinkTarget(stored);
    } catch {
        return prefersExternalAppOpenLink() ? "external-app" : "inline";
    }
};

/** http(s) tiles open in a new tab (or Cap chooser). App views stay inline unless set. */
export const defaultOpenLinkTargetForHref = (href?: unknown): OpenLinkTarget => {
    if (prefersExternalAppOpenLink()) return "external-app";
    if (isExternalWebHref(href)) return "new-tab";
    return getDefaultOpenLinkTarget();
};

/** Capacitor / coarse launcher — Open in app (chooser) beats inline iframe. */
const prefersExternalAppOpenLink = (): boolean => {
    try {
        const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        if (typeof c?.isNativePlatform === "function" && c.isNativePlatform()) return true;
    } catch {
        /* ignore */
    }
    try {
        const launcher =
            document.documentElement.dataset.cwspShellRole === "launcher" ||
            (globalThis as { __RS_SHELL_ROLE__?: string }).__RS_SHELL_ROLE__ === "launcher";
        if (!launcher) return false;
        return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    } catch {
        return false;
    }
};

export const setDefaultOpenLinkTarget = (target: OpenLinkTarget): void => {
    try {
        localStorage.setItem(OPEN_LINK_TARGET_KEY, normalizeOpenLinkTarget(target));
    } catch {
        /* private mode */
    }
};

export const resolveItemOpenLinkTarget = (meta?: SpeedDialItemMeta | null): OpenLinkTarget => {
    const raw = meta?.openLinkTarget != null ? String(meta.openLinkTarget).trim() : "";
    if (raw) return normalizeOpenLinkTarget(raw);
    return defaultOpenLinkTargetForHref(meta?.href);
};

/** True only on Capacitor native — web must not await the bridge before window.open. */
export const canUseNativeOpenUri = (): boolean => {
    try {
        const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        return typeof c?.isNativePlatform === "function" && !!c.isNativePlatform();
    } catch {
        return false;
    }
};

export interface SpeedDialPersistedItem {
    id: string;
    /** Runtime uses observe([x,y]); packed storage uses a plain `[x,y]` tuple. */
    cell: GridCell | ReturnType<typeof observe<GridCell>>;
    icon: string;
    label: string;
    action: string;
    meta?: SpeedDialItemMeta;
}

type SpeedDialRecord = Omit<SpeedDialPersistedItem, "meta">;

export interface SpeedDialItem {
    id: string;
    cell: ReturnType<typeof observe>;
    icon: ReturnType<typeof stringRef>;
    label: ReturnType<typeof stringRef>;
    action: string;
}

const NAVIGATION_SHORTCUTS_ALL = [
    { view: "home", label: "Home", icon: "house-line" },
    { view: "network", label: "Network", icon: "wifi-high" },
    { view: "viewer", label: "Markdown", icon: "books" },
    { view: "explorer", label: "Explorer", icon: "folder" },
    { view: "workcenter", label: "Work Center", icon: "briefcase" },
    { view: "history", label: "History", icon: "clock-counter-clockwise" },
    { view: "settings", label: "Settings", icon: "gear-six" },
    { view: "apps", label: "Apps", icon: "squares-four" }
] as const;

/** WHY: document PWA disables Network at build time — hide it from add-shortcut menus too. */
export const NAVIGATION_SHORTCUTS = NAVIGATION_SHORTCUTS_ALL.filter((shortcut) =>
    isEnabledView(shortcut.view)
);

const STORAGE_KEY = "cw::workspace::speed-dial";
const META_STORAGE_KEY = `${STORAGE_KEY}::meta`;
/** User mutations use this to keep the active workspace snapshot authoritative. */
export const SPEED_DIAL_MUTATION_EVENT = "cwsp:speed-dial-mutation";

export const emitSpeedDialMutation = (kind: "add" | "update" | "remove", id: string): void => {
    try {
        window.dispatchEvent(new CustomEvent(SPEED_DIAL_MUTATION_EVENT, { detail: { kind, id } }));
    } catch {
        /* non-browser test/runtime */
    }
};

const fallbackClone = <T>(value: T): T => {
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(safe(value));
        } catch {
            /* proxies / non-cloneable */
        }
    }
    try {
        return JSON.parse(JSON.stringify(safe(value) as any)) as T;
    } catch {
        return value;
    }
};

const ICON_BLOB_LS = "cw::speed-dial::icon-blob::";
const ICON_PTR = "sd-icon:";
const APPEARANCE_META_KEYS = ["shape", "iconDisplay", "iconUrl", "iconScale", "iconCacheKey"] as const;

const isInlineIconUrl = (url: string): boolean => /^data:/i.test(url);
const isEphemeralIconUrl = (url: string): boolean => /^blob:/i.test(url);

/** Plain meta for persist/snapshots — observe proxies must not leak into LS/catalog. */
export const packSpeedDialMetaPlain = (meta?: SpeedDialItemMeta | null): SpeedDialItemMeta => {
    const src = (meta ? (safe(meta) as Record<string, unknown>) : {}) || {};
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(src)) {
        if (raw == null || raw === "") continue;
        let value: unknown = raw;
        if (typeof raw === "object" && raw && "value" in (raw as object)) {
            value = (raw as { value: unknown }).value;
            if (value == null || value === "") continue;
        }
        out[key] = value;
    }
    const url = String(out.iconUrl || "");
    if (isEphemeralIconUrl(url)) delete out.iconUrl;
    return out as SpeedDialItemMeta;
};

export const persistSpeedDialIconBlob = (id: string, iconUrl: string): string => {
    const itemId = String(id || "").trim();
    const url = String(iconUrl || "").trim();
    if (!itemId || !isInlineIconUrl(url)) return url;
    try {
        localStorage.setItem(ICON_BLOB_LS + itemId, url);
        return ICON_PTR + itemId;
    } catch {
        return ICON_PTR + itemId;
    }
};

export const resolveSpeedDialIconUrl = (id: string, iconUrl?: string): string => {
    const url = String(iconUrl || "").trim();
    const itemId = (url.startsWith(ICON_PTR) ? url.slice(ICON_PTR.length) : String(id || "")).trim();
    if (url.startsWith(ICON_PTR) || (!url && itemId)) {
        try {
            const stored = localStorage.getItem(ICON_BLOB_LS + itemId);
            if (stored) return stored;
        } catch {
            /* private mode */
        }
    }
    return url;
};

export const forgetSpeedDialIconBlob = (id: string): void => {
    const itemId = String(id || "").trim();
    if (!itemId) return;
    try {
        localStorage.removeItem(ICON_BLOB_LS + itemId);
    } catch {
        /* ignore */
    }
};

const mergeMetaKeepingAppearance = (
    existing: SpeedDialItemMeta | null | undefined,
    incoming: SpeedDialItemMeta
): SpeedDialItemMeta => {
    const prev = packSpeedDialMetaPlain(existing);
    const next = packSpeedDialMetaPlain(incoming);
    const out: SpeedDialItemMeta = { ...prev, ...next };
    for (const key of APPEARANCE_META_KEYS) {
        const keep = String((prev as Record<string, unknown>)[key] || "").trim();
        const put = String((next as Record<string, unknown>)[key] || "").trim();
        if (!put && keep) (out as Record<string, unknown>)[key] = keep;
    }
    const prevUrl = String(prev.iconUrl || "");
    const nextUrl = String(next.iconUrl || "");
    if (prevUrl && (!nextUrl || nextUrl.startsWith(ICON_PTR)) && !nextUrl.startsWith("android-icon:")) {
        if (isInlineIconUrl(prevUrl) || prevUrl.startsWith(ICON_PTR)) out.iconUrl = prevUrl;
    }
    return out;
};

const durableMetaForPersist = (id: string, meta?: SpeedDialItemMeta | null): SpeedDialItemMeta => {
    const packed = packSpeedDialMetaPlain(meta);
    const url = String(packed.iconUrl || "");
    if (isInlineIconUrl(url)) packed.iconUrl = persistSpeedDialIconBlob(id, url);
    return packed;
};

const generateItemId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sd-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000)}`;
};

const EXTERNAL_SHORTCUTS: SpeedDialPersistedItem[] = [
    /*
     * WHY: Out-of-box tiles for sibling VDS host apps (manifest hosts).
     * INVARIANT: `.md` → md.u2re.space (CWSP-document); `.cwsp` → cwsp.u2re.space (CWSP-transfer).
     * ensureExternalShortcuts() merges these into persisted grids on next load.
     */
];

/*
 * WHY: Explorer / Settings / Markdown ship on the Core Rail — not as default grid tiles.
 * EXTERNAL_SHORTCUTS may still seed sibling-host deep links when defined.
 */
const DEFAULT_SPEED_DIAL_DATA_ALL: SpeedDialPersistedItem[] = [...EXTERNAL_SHORTCUTS];

/** Drop view shortcuts that this host build disabled (e.g. Network on CWSP-document). */
const isSpeedDialViewAllowed = (
    meta?: SpeedDialItemMeta,
    id?: string
): boolean => {
    if (id === "shortcut-network" && !isEnabledView("network")) return false;
    const view = String(meta?.view || "").trim();
    if (!view) return true;
    return isEnabledView(view);
};

const DEFAULT_SPEED_DIAL_DATA: SpeedDialPersistedItem[] = DEFAULT_SPEED_DIAL_DATA_ALL.filter((entry) =>
    isSpeedDialViewAllowed(entry.meta, entry.id)
);

const splitDefaultEntries = (entries: SpeedDialPersistedItem[]) => {
    const records: SpeedDialRecord[] = [];
    const metaEntries: Array<[string, SpeedDialItemMeta]> = [];
    entries.forEach((entry) => {
        const { meta, ...record } = entry;
        records.push(record as SpeedDialRecord);
        const normalizedMeta: SpeedDialItemMeta = { action: entry.action, ...(meta || {}) };
        metaEntries.push([entry.id, normalizedMeta]);
    });
    return { records, metaEntries };
};

const { records: DEFAULT_SPEED_DIAL_RECORDS, metaEntries: DEFAULT_META_ENTRIES } = splitDefaultEntries(DEFAULT_SPEED_DIAL_DATA);
const legacyMetaBuffer: Array<[string, SpeedDialItemMeta]> = [];

/** Ids historically injected onto the Speed Dial grid (now Core Rail only). */
const CORE_RAIL_GRID_IDS = new Set([
    "shortcut-explorer",
    "shortcut-settings",
    "shortcut-viewer",
    "shortcut-markdown",
    "shortcut-apps",
    "apps",
    "explorer",
    "settings",
    "viewer",
    "markdown"
]);
const CORE_RAIL_GRID_VIEWS = new Set(["apps", "explorer", "settings", "viewer", "markdown", "reader"]);
const CORE_RAIL_GRID_LABELS = new Set(["apps", "explorer", "settings", "markdown", "viewer"]);

const unwrapPersistedLabel = (label: unknown): string => {
    if (label && typeof label === "object" && "value" in (label as object)) {
        return String((label as { value?: unknown }).value || "").trim().toLowerCase();
    }
    return String(label || "").trim().toLowerCase();
};

/**
 * True when a curated / persisted tile belongs on the Core Rail only
 * (Explorer / Settings / Markdown) — never on the freeform Speed Dial grid.
 */
export const isCoreRailGridTile = (
    item: { id?: string; action?: string; label?: unknown } | null | undefined,
    meta?: SpeedDialItemMeta | null
): boolean => {
    if (!item?.id) return false;
    const id = String(item.id || "").trim().toLowerCase();
    if (CORE_RAIL_GRID_IDS.has(id)) return true;
    const action = String(meta?.action || item.action || "open-view")
        .trim()
        .toLowerCase();
    if (action && action !== "open-view") return false;
    const view = String(meta?.view || "")
        .trim()
        .toLowerCase();
    if (view && CORE_RAIL_GRID_VIEWS.has(view)) return true;
    const label = unwrapPersistedLabel(item.label);
    return Boolean(label) && CORE_RAIL_GRID_LABELS.has(label);
};

const isCoreRailPersistedEntry = (entry: SpeedDialPersistedItem): boolean =>
    isCoreRailGridTile(
        { id: entry.id, action: entry.action, label: entry.label },
        { action: entry.action, ...(entry.meta || {}) }
    );

const ensureCell = (cell?: ReturnType<typeof observe<GridCell>>): ReturnType<typeof observe<GridCell>> => {
    if (cell && Array.isArray(cell) && cell.length >= 2) {
        return observe([Number(cell[0]) || 0, Number(cell[1]) || 0]);
    }
    return observe([0, 0]);
};

const createMetaState = (meta: SpeedDialItemMeta = {}) => {
    const kind = String(meta.widgetKind || "").toLowerCase();
    /*
     * WHY: Properties used to stamp `widgetKind: clock` on shortcuts. Infer
     * `widget` only from search/android — clock alone is not proof.
     */
    const inferredAction =
        String(meta.action || "").trim() ||
        (kind === "search" || kind === "android" ? "widget" : "open-view");
    return makeObjectAssignable(observe({
        view: meta.view || "",
        href: meta.href || "",
        description: meta.description || "",
        entityType: meta.entityType || "",
        tags: Array.isArray(meta.tags) ? [...meta.tags] : [],
        ...meta,
        action: inferredAction
    }));
};

export type SpeedDialMetaEntry = ReturnType<typeof createMetaState>;
export type SpeedDialMetaRegistry = Map<string, SpeedDialMetaEntry>;

const registryFromEntries = (entries: Iterable<[string, SpeedDialItemMeta]>) => {
    const registry = new Map<string, SpeedDialMetaEntry>();
    for (const [id, meta] of entries) {
        registry.set(id, createMetaState(meta));
    }
    return registry as SpeedDialMetaRegistry;
};

const normalizeMetaEntries = (raw?: any): Array<[string, SpeedDialItemMeta]> => {
    if (!raw) return [];
    if (raw instanceof Map) {
        return Array.from(raw.entries());
    }
    if (Array.isArray(raw)) {
        return raw
            .map((entry: any) => {
                if (entry && typeof entry === "object" && "id" in entry) {
                    return [entry.id, (entry.meta || entry) as SpeedDialItemMeta] as [string, SpeedDialItemMeta];
                }
                return null;
            })
            .filter(Boolean) as Array<[string, SpeedDialItemMeta]>;
    }
    if (typeof raw === "object") {
        return Object.entries(raw as Record<string, SpeedDialItemMeta>) as Array<[string, SpeedDialItemMeta]>;
    }
    return [];
};

const packMetaRegistry = (registry: SpeedDialMetaRegistry) => {
    const payload: Record<string, SpeedDialItemMeta> = {};
    registry?.forEach((meta, id) => {
        payload[id] = durableMetaForPersist(id, meta);
    });
    return payload;
};

const createInitialMetaRegistry = () => registryFromEntries(DEFAULT_META_ENTRIES);
const unpackMetaRegistry = (raw?: any) => {
    const entries = normalizeMetaEntries(raw);
    return registryFromEntries(entries.length ? entries : DEFAULT_META_ENTRIES);
};

const unwrapRef = (value: any, fallback?: string) => {
    if (value && typeof value === "object" && "value" in value) {
        return value.value ?? fallback;
    }
    return value ?? fallback;
};

const serializeItemState = (item: SpeedDialItem): SpeedDialRecord => {
    // WHY: pack must be plain POJO — observe proxies in storage break migrate/custom checks and roundtrips.
    return {
        id: item.id,
        cell: [Number(item.cell?.[0]) || 0, Number(item.cell?.[1]) || 0] as GridCell,
        icon: unwrapRef(item.icon, "sparkle"),
        label: unwrapRef(item.label, "Shortcut"),
        action: item.action
    };
};

const createStatefulItem = (config: SpeedDialRecord): SpeedDialItem => {
    return observe({
        id: config.id || generateItemId(),
        cell: observe(ensureCell(config.cell)),
        icon: stringRef(config.icon || "sparkle"),
        label: stringRef(config.label || "Shortcut"),
        action: config.action || "open-view"
    }) as any;
};

const createInitialState = () => observe(DEFAULT_SPEED_DIAL_RECORDS.map(createStatefulItem));
const unpackState = (raw?: SpeedDialPersistedItem[]) => {
    // WHY: strip persisted Network (etc.) tiles when this host build disabled the view.
    // WHY (CRX): chrome.storage.local hydrates async AFTER boot strip — filter here so
    // Explorer/Settings/Markdown never reappear from chrome.storage or dual StateStorage writers.
    const source = (Array.isArray(raw) && raw.length ? raw : DEFAULT_SPEED_DIAL_DATA).filter(
        (entry) =>
            isSpeedDialViewAllowed(entry.meta, entry.id) && !isCoreRailPersistedEntry(entry)
    );
    const records = source.map((entry) => {
        const { meta, ...record } = entry;
        if (meta) {
            legacyMetaBuffer.push([entry.id, { action: entry.action, ...meta }]);
        } else {
            legacyMetaBuffer.push([entry.id, { action: entry.action }]);
        }
        return record as SpeedDialRecord;
    });
    return observe(records.map(createStatefulItem));
};
const packState = (collection: SpeedDialItem[]) =>
    collection
        .filter((item) => {
            try {
                return !isCoreRailGridTile(item, speedDialMeta?.get?.(item.id) ?? null);
            } catch {
                return !isCoreRailGridTile(item, null);
            }
        })
        .map(serializeItemState);

/**
 * WHY: Vite `preserveSymlinks` can load this file via fl.ui and home-view paths as
 * two module graphs. Without a process singleton, idle-save from the stale copy
 * overwrites user shortcuts with defaults after refresh.
 */
const SPEED_DIAL_ITEMS_BOOT = "__CWSP_SPEED_DIAL_ITEMS_V1__";
const SPEED_DIAL_META_BOOT = "__CWSP_SPEED_DIAL_META_V1__";

const bootSpeedDialMeta = (): SpeedDialMetaRegistry => {
    const g = globalThis as any;
    if (g[SPEED_DIAL_META_BOOT]) return g[SPEED_DIAL_META_BOOT] as SpeedDialMetaRegistry;
    const state = makeUIState(META_STORAGE_KEY, createInitialMetaRegistry, unpackMetaRegistry, packMetaRegistry) as unknown as SpeedDialMetaRegistry;
    g[SPEED_DIAL_META_BOOT] = state;
    return state;
};

const bootSpeedDialItems = (): SpeedDialItem[] => {
    const g = globalThis as any;
    if (g[SPEED_DIAL_ITEMS_BOOT]) return g[SPEED_DIAL_ITEMS_BOOT] as SpeedDialItem[];
    const state = makeUIState(STORAGE_KEY, createInitialState, unpackState, packState) as unknown as SpeedDialItem[];
    g[SPEED_DIAL_ITEMS_BOOT] = state;
    return state;
};

export const speedDialMeta = bootSpeedDialMeta();
export const speedDialItems = bootSpeedDialItems();

/*
 * OPFS-first persistence (Task 2).
 *
 * WHY: localStorage is the synchronous boot source so the grid renders instantly;
 * OPFS is the durable source-of-truth. On boot we (1) create OPFS IO, (2) migrate
 * LS → OPFS once, (3) hydrate the in-memory state from OPFS when present. Persists
 * write OPFS first (debounced) and mirror LS for one release so a backup exists.
 *
 * INVARIANT: public names `speedDialItems` / `speedDialMeta` /
 * `persistSpeedDialItems` / `persistSpeedDialMeta` are unchanged. OPFS failure is
 * non-fatal — we warn and keep LS as the persistence carrier.
 *
 * WHY (Cap pin flash): Vite can load this file via `./launcher-state` and
 * `fl-ui/speed-dial/launcher-state` as two module graphs. Items/meta already use
 * globalThis singletons; hydrate dirty/ready MUST too — otherwise pin marks dirty
 * on copy B while hydrate on copy A splices the shared array and the tile vanishes.
 */
const LINK_STORE_BOOT = "__CWSP_LINK_STORE_BOOT_V1__";

type LinkStoreBootSlot = {
    opfsIo: LinkStoreIo | null;
    opfsReady: Promise<void> | null;
    opfsFlushTimer: ReturnType<typeof setTimeout> | null;
    opfsHydrated: boolean;
    userEditedBeforeHydrate: boolean;
    /** WHY: bumped on every user edit so hydrate can abort even if dirty was already true. */
    editGen: number;
    /**
     * WHY: last-tile delete / empty workspace must wipe OPFS. Boot strips must
     * not — they also mark dirty and would otherwise erase curated files.
     */
    allowEmptyOpfsWrite: boolean;
};

const linkStoreBoot = (): LinkStoreBootSlot => {
    const g = globalThis as Record<string, LinkStoreBootSlot | undefined>;
    if (!g[LINK_STORE_BOOT]) {
        g[LINK_STORE_BOOT] = {
            opfsIo: null,
            opfsReady: null,
            opfsFlushTimer: null,
            opfsHydrated: false,
            userEditedBeforeHydrate: false,
            editGen: 0,
            allowEmptyOpfsWrite: false
        };
    }
    return g[LINK_STORE_BOOT]!;
};

const markIntentionalEmptyGrid = (): void => {
    const boot = linkStoreBoot();
    boot.allowEmptyOpfsWrite = true;
};

/*
 * Task 3 — Mirror mode state.
 *
 * WHY: `mirrorPath` lives in `meta.json` (LinkStoreMetaFile), not in the
 * per-id `speedDialMeta` registry. We keep a dedicated observe ref so the
 * SpeedDial grid can react to mode toggles, and persist it back into OPFS
 * `meta.json` via `packMetaFileFromState` (and an LS backup key for the
 * non-OPFS fallback path).
 *
 * INVARIANT: `mirrorSpeedDialItems` is a display-only observe array. It is
 * rebuilt by `refreshSpeedDialMirror()` from a PathRouter listing. Curated
 * `speedDialItems` remain the editable / draggable source-of-truth; mirror
 * tiles are appended below them in the grid (see SpeedDial.ts).
 */
const MIRROR_PATH_LS_KEY = "cw::workspace::speed-dial::mirror-path";
/*
 * WHY: `observe(null)` returns `null` (primitives are not wrapped) — then
 * `mirrorPathState.value` throws. Use `stringRef("")`; empty = no mirror path.
 */
export const mirrorPathState = stringRef("");
export const mirrorSpeedDialItems = observe<MirrorSpeedDialItem[]>([]);

export const isMirrorMode = (): boolean => Boolean(String(mirrorPathState.value || "").trim());

export function getSpeedDialMirrorPath(): string | null {
    const v = String(mirrorPathState.value || "").trim();
    return v ? v : null;
}

/**
 * Persist `mirrorPath` into OPFS `meta.json` (canonical) and an LS backup key.
 * WHY: OPFS is async + durable; LS keeps the value when OPFS is unavailable
 * (private mode / quota) so the mode survives reloads on hosts without OPFS.
 */
export function setSpeedDialMirrorPath(path: string | null): void {
    const normalized = path ? String(path).trim() : "";
    if (normalized === String(mirrorPathState.value || "").trim()) return;
    markUserEditedBeforeHydrate();
    mirrorPathState.value = normalized;
    try {
        if (typeof localStorage !== "undefined") {
            if (normalized) localStorage.setItem(MIRROR_PATH_LS_KEY, normalized);
            else localStorage.removeItem(MIRROR_PATH_LS_KEY);
        }
    } catch { /* private mode */ }
    persistSpeedDialMeta();
    void refreshSpeedDialMirror();
}

/**
 * Rebuild `mirrorSpeedDialItems` from the current `mirrorPath` via PathRouter.
 *
 * WHY: SpeedDial calls this on mount and whenever the mirror path changes. If
 * no backend is registered for the path (e.g. tests without OPFS/Chrome), we
 * surface a soft warning and keep an empty listing so the grid stays usable.
 *
 * Task 3 fix: pass curated `speedDialItems` cells to `buildMirrorSpeedDialItems`
 * so mirror tiles auto-place below the curated grid's max Y instead of
 * stacking at `[0,0]`. Meta per-id `cell` overrides still win.
 */
export async function refreshSpeedDialMirror(): Promise<void> {
    const path = getSpeedDialMirrorPath();
    if (!path) {
        mirrorSpeedDialItems.splice(0, mirrorSpeedDialItems.length);
        return;
    }
    try {
        const backend = resolveFsBackend(path);
        if (!backend) {
            console.warn(`[link-store] no fs backend for mirror path: ${path}`);
            mirrorSpeedDialItems.splice(0, mirrorSpeedDialItems.length);
            return;
        }
        const listing = await backend.list(path);
        // WHY: read the current meta so per-id cell/hidden overrides apply.
        const meta = packMetaFileFromState();
        // WHY: pass curated cells so mirror tiles auto-place below the curated
        // grid extent. Each curated item exposes its `cell` as `[x,y]`.
        const curated = (speedDialItems || []).map((item) => ({
            cell: Array.isArray(item?.cell) ? (item.cell as unknown as [number, number]) : undefined
        }));
        const items = buildMirrorSpeedDialItems(listing as any, meta, path, curated);
        mirrorSpeedDialItems.splice(0, mirrorSpeedDialItems.length);
        for (const item of items) mirrorSpeedDialItems.push(item);
    } catch (e) {
        console.warn(`[link-store] mirror list failed for ${path}`, e);
        mirrorSpeedDialItems.splice(0, mirrorSpeedDialItems.length);
    }
}

/*
 * Task 3 fix (nice-to-have) — refresh mirror when a backend registers.
 *
 * WHY: `ensureDefaultFsBackends()` runs at path-router module boot, but in
 * some load orders SpeedDial may mount before the registry is populated, or a
 * CRX backend may register late. Subscribing here means a newly-registered
 * backend (for the current mirror path) triggers a re-fetch so mirror tiles
 * appear without a manual mode toggle. The listener is module-scoped and
 * never unregistered (lifetime = tab lifetime).
 */
if (typeof globalThis !== "undefined") {
    subscribeFsBackendRegister((root) => {
        const path = getSpeedDialMirrorPath();
        if (!path) return;
        // WHY: only refresh when the registered root covers the mirror path.
        if (path === root || path.startsWith(root === "/" ? "/" : root)) {
            void refreshSpeedDialMirror();
        }
    });
}
/*
 * WHY: hydrate vs mid-boot edit race. The grid renders synchronously from LS,
 * then `initLinkStore` runs async (migrate + hydrate). If a user / UI edit
 * completes, the in-memory state already reflects newer data than OPFS
 * (which was just migrated from the same LS). Letting hydrate splice OPFS
 * data back in would clobber that edit. We record the dirty signal only on
 * user-initiated mutations (add/remove/move/edit helpers), not boot/init
 * persist paths (`flushLegacyMetaBuffer`, `ensureCoreViewShortcuts`, …).
 * The scheduled OPFS flush still runs (it awaits `opfsReady`) and writes
 * the newer state to OPFS when dirty.
 */
/**
 * WHY: always stamp dirty — even after hydrate flipped true mid-hydrate.
 * Pin/Share can land between the dirty re-check and the `splice`. Dirty is on
 * globalThis so dual Vite module graphs share the same signal.
 */
const markUserEditedBeforeHydrate = (): void => {
    const boot = linkStoreBoot();
    boot.userEditedBeforeHydrate = true;
    boot.editGen = (boot.editGen || 0) + 1;
};

/** True when pin/share/edit landed this session — Side snapshots must not splice over it. */
export const wasSpeedDialUserEdited = (): boolean => {
    const boot = linkStoreBoot();
    return boot.userEditedBeforeHydrate === true || (boot.editGen || 0) > 0;
};

const getLsLike = (): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null => {
    try {
        if (typeof localStorage === "undefined") return null;
        return localStorage;
    } catch {
        return null;
    }
};

/**
 * Pack the current in-memory state into a `LinkStoreMetaFile` for OPFS.
 * WHY: cells live in `speedDialItems` (state) while href/view/shape live in
 * `speedDialMeta` (registry); OPFS `meta.json` merges both per id.
 */
const packMetaFileFromState = (): LinkStoreMetaFile => {
    const perId: Record<string, Record<string, unknown>> = {};
    speedDialMeta?.forEach((meta, id) => {
        perId[id] = durableMetaForPersist(id, meta) as Record<string, unknown>;
    });
    (speedDialItems || []).forEach((item) => {
        const id = String(item?.id || "");
        if (!id) return;
        const cell = item?.cell;
        const x = Number(Array.isArray(cell) ? cell[0] : (cell as any)?.[0]) || 0;
        const y = Number(Array.isArray(cell) ? cell[1] : (cell as any)?.[1]) || 0;
        perId[id] = { ...(perId[id] || {}), cell: [x, y] as [number, number] };
    });
    return { version: 1, mirrorPath: getSpeedDialMirrorPath(), items: perId };
};

const flushLinkStoreToOpfs = async (): Promise<void> => {
    const boot = linkStoreBoot();
    if (!boot.opfsIo) return;
    // WHY: wait for init (migration + hydration) so a sync-boot persist can't
    // overwrite newer OPFS data with stale LS state before hydration reads it.
    try {
        await boot.opfsReady;
    } catch {
        return;
    }
    if (!boot.opfsIo) return;
    try {
        const items = packLinksFromSpeedDial(speedDialItems as any);
        /* WHY: href/path live in speedDialMeta registry, not on the item object. */
        for (const item of items) {
            const meta = speedDialMeta?.get?.(item.id);
            if (!meta) continue;
            if (!item.href && meta.href) item.href = String(meta.href);
            if (!item.path && (meta as { path?: string }).path) {
                item.path = String((meta as { path?: string }).path);
            }
            if (!item.action && meta.action) item.action = String(meta.action);
        }
        const meta = packMetaFileFromState();
        const allowEmpty = boot.allowEmptyOpfsWrite === true && !(speedDialItems?.length);
        await writeLinkStore(boot.opfsIo, items, meta, { allowEmpty });
        if (allowEmpty) boot.allowEmptyOpfsWrite = false;
    } catch (e) {
        console.warn("[link-store] OPFS write failed; localStorage remains primary", e);
    }
};

const scheduleOpfsFlush = (): void => {
    const boot = linkStoreBoot();
    /*
     * WHY: Cap Share / CONFIRM_PIN often lands before `createOpfsLinkStoreIo` finishes.
     * Do not require `opfsIo` here — `flushLinkStoreToOpfs` awaits `opfsReady` then writes.
     * Skipping the schedule left pin only in LS while a later hydrate/reload used stale OPFS.
     */
    if (boot.opfsFlushTimer) clearTimeout(boot.opfsFlushTimer);
    boot.opfsFlushTimer = setTimeout(() => {
        boot.opfsFlushTimer = null;
        void flushLinkStoreToOpfs();
    }, 150);
};

/**
 * Hydrate the in-memory state from OPFS after migration. Only runs when no
 * user edit has fired yet (module-load race window) and OPFS has data.
 *
 * WHY: if `persistSpeedDialItems` / `persistSpeedDialMeta` already ran before
 * hydrate completed, the in-memory state is newer than the just-migrated OPFS
 * snapshot. Splicing OPFS back in would clobber the edit, so we mark hydrated
 * and bail — the pending OPFS flush (awaiting `opfsReady`) will persist the
 * newer state instead.
 */
const hydrateFromOpfs = async (io: LinkStoreIo): Promise<void> => {
    const boot = linkStoreBoot();
    if (boot.opfsHydrated) return;
    if (boot.userEditedBeforeHydrate) {
        // WHY: user/UI already edited the boot state; keep it, skip the splice.
        // The scheduled flush will write the newer state to OPFS.
        boot.opfsHydrated = true;
        return;
    }
    const editGenAtStart = boot.editGen || 0;
    try {
        const got = await readLinkStore(io);
        if (!got || !got.items.length) {
            boot.opfsHydrated = true;
            return;
        }
        // WHY: re-check dirty + editGen after the async read — Cap pin can land mid-await.
        if (boot.userEditedBeforeHydrate || boot.editGen !== editGenAtStart) {
            boot.opfsHydrated = true;
            return;
        }
        const nextItems: SpeedDialItem[] = [];
        const nextMeta = new Map<string, SpeedDialItemMeta>();
        for (const raw of got.items) {
            const metaEntry = got.meta.items[raw.id] || {};
            const cell = Array.isArray((metaEntry as any).cell)
                ? ([(metaEntry as any).cell[0], (metaEntry as any).cell[1]] as [number, number])
                : (Array.isArray(raw.cell)
                    ? ([raw.cell[0], raw.cell[1]] as [number, number])
                    : ([0, 0] as [number, number]));
            const item = createStatefulItem({
                id: raw.id,
                cell: observe([Number(cell[0]) || 0, Number(cell[1]) || 0]),
                icon: raw.icon || "sparkle",
                label: raw.label || "Shortcut",
                action: raw.action || "open-view"
            });
            const meta: SpeedDialItemMeta = {
                action: raw.action || "open-view",
                ...(metaEntry as any),
                ...(raw.href ? { href: raw.href } : {}),
                ...(raw.path ? { path: raw.path } : {})
            };
            /* WHY: Core Rail apps must not reappear from legacy OPFS snapshots. */
            if (isCoreRailGridTile(item, meta)) continue;
            nextItems.push(observe(item) as any);
            nextMeta.set(item.id, meta);
        }
        if (!nextItems.length) {
            boot.opfsHydrated = true;
            /* Still flush a strip if LS boot state had cores and OPFS was empty-after-filter. */
            stripCoreRailTilesFromGrid({ markDirty: true });
            return;
        }
        /*
         * WHY: Share / CONFIRM_PIN_SHORTCUT often lands while we build `nextItems`.
         * Re-check immediately before splice — otherwise the new tile flashes then
         * vanishes and the pending OPFS flush persists the wipe.
         */
        if (boot.userEditedBeforeHydrate || boot.editGen !== editGenAtStart) {
            boot.opfsHydrated = true;
            return;
        }
        boot.opfsHydrated = true;
        if (got.meta.mirrorPath != null) {
            mirrorPathState.value = String(got.meta.mirrorPath || "");
        }
        /*
         * WHY: LS already painted appearance. OPFS is often a first-import
         * without iconDisplay/shape — splicing it reset tiles after reload.
         */
        if (speedDialItems?.length) {
            for (const [id, meta] of nextMeta) {
                if (!getSpeedDialMeta(id)) ensureSpeedDialMeta(id, packSpeedDialMetaPlain(meta));
            }
            stripCoreRailTilesFromGrid({ markDirty: true });
            return;
        }
        // WHY: never splice-to-empty first — a throw mid-loop used to persist an empty grid.
        speedDialItems.splice(0, speedDialItems.length, ...nextItems);
        for (const [id, meta] of nextMeta) {
            const merged = mergeMetaKeepingAppearance(getSpeedDialMeta(id), meta);
            ensureSpeedDialMeta(id, merged);
        }
        /* Defense in depth — strip any that slipped past the filter (label-only legacy). */
        stripCoreRailTilesFromGrid({ markDirty: true });
    } catch (e) {
        console.warn("[link-store] OPFS hydration failed; using localStorage boot state", e);
        linkStoreBoot().opfsHydrated = true;
        stripCoreRailTilesFromGrid({ markDirty: true });
    }
};

const skipLinkStoreOpfs = (): boolean => {
    try {
        const sku = String(document.documentElement?.dataset?.cwspSku || "").toLowerCase();
        if (sku === "document") return true;
        const host = String(location.hostname || "").toLowerCase();
        if (/(^|\.)md\.u2re\.space$/.test(host)) return true;
    } catch { /* no document */ }
    return false;
};

const initLinkStore = (): Promise<void> => {
    const boot = linkStoreBoot();
    if (boot.opfsReady) return boot.opfsReady;
    boot.opfsReady = (async () => {
        const ls = getLsLike();
        // WHY: md.u2re.space / document SKU has no Speed Dial; getDirectory hang
        // (800ms timeout) was racing markdown FSA bind and spamming the console.
        if (skipLinkStoreOpfs()) {
            boot.opfsIo = null;
            boot.opfsHydrated = true;
            return;
        }
        try {
            /* WHY: Cap WebView getDirectory() can hang forever; pin/home must not wait. */
            boot.opfsIo = await Promise.race([
                createOpfsLinkStoreIo(),
                new Promise<LinkStoreIo>((_, reject) => {
                    setTimeout(() => reject(new Error("[link-store] OPFS getDirectory timeout")), 800);
                })
            ]);
        } catch (e) {
            console.warn("[link-store] OPFS unavailable; using localStorage", e);
            boot.opfsIo = null;
            boot.opfsHydrated = true;
            return;
        }
        if (!boot.opfsIo) return;
        try {
            if (ls) {
                await migrateLocalStorageToOpfsIfNeeded(boot.opfsIo, ls);
            }
            await hydrateFromOpfs(boot.opfsIo);
            /* WHY: always re-strip after hydrate — legacy OPFS may still carry Core Rail tiles. */
            stripCoreRailTilesFromGrid({ markDirty: true });
            /*
             * WHY: pin during boot marks dirty and schedules flush, but the timer
             * used to no-op when `opfsIo` was still null. After hydrate aborts for
             * dirty, force a durable write so Cap shortcuts survive reload.
             */
            if (boot.userEditedBeforeHydrate) {
                await flushLinkStoreToOpfs();
            }
        } catch (e) {
            console.warn("[link-store] OPFS init failed; using localStorage boot state", e);
            boot.opfsHydrated = true;
        }
    })();
    return boot.opfsReady;
};

/**
 * Hosts may await this to know when OPFS migration/hydration is done. The grid
 * renders immediately from LS; this resolves after the async OPFS step.
 */
export const linkStoreReady = (): Promise<void> => initLinkStore();

/** Force durable OPFS write (Cap pin / Share) — do not wait for the 150ms debounce. */
export const flushSpeedDialLinkStore = (): Promise<void> => flushLinkStoreToOpfs();

/** True when `id` is still in the shared Speed Dial array (post-hydrate race check). */
export const hasSpeedDialItemId = (id: string): boolean =>
    Boolean(id && speedDialItems?.some?.((item) => String(item?.id) === id));

/** Live tile that already represents this Android pinned shortcut. */
export const findSpeedDialShortcutItem = (
    pkg: string,
    shortcutId: string
): SpeedDialItem | null => {
    const packageName = String(pkg || "").trim();
    const id = String(shortcutId || "").trim();
    if (!packageName || !id) return null;
    for (const item of speedDialItems || []) {
        const meta = getSpeedDialMeta(item.id);
        if (
            String(meta?.packageName || "").trim() === packageName &&
            String(meta?.shortcutId || "").trim() === id
        ) {
            return item;
        }
    }
    return null;
};

/*
 * WHY: Android keeps Files pins on this launcher after Home Remove, so
 * `list-pinned` would recreate the tile (and reset iconDisplay). Persist the
 * user's delete; only a fresh CONFIRM_PIN forgets it.
 */
const DISMISSED_PINS_KEY = "cw::launcher::dismissed-pins";
const DISMISSED_PINS_BOOT = "__CWSP_DISMISSED_PINS_V1__";

type DismissedPinsSlot = { at: Map<string, number> };

const dismissedPinKey = (pkg: string, sid: string): string =>
    `${String(pkg || "").trim()}::${String(sid || "").trim()}`;

const dismissedPinsSlot = (): DismissedPinsSlot => {
    const g = globalThis as Record<string, DismissedPinsSlot | undefined>;
    if (g[DISMISSED_PINS_BOOT]) return g[DISMISSED_PINS_BOOT]!;
    const at = new Map<string, number>();
    try {
        const raw = localStorage.getItem(DISMISSED_PINS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
            for (const row of parsed) {
                if (typeof row === "string") {
                    const k = row.trim();
                    if (k && k !== "::") at.set(k, 1);
                    continue;
                }
                const k = String((row as { k?: string })?.k || "").trim();
                const t = Number((row as { t?: number })?.t || 0);
                if (k && k !== "::") at.set(k, t || 1);
            }
        }
    } catch {
        /* ignore */
    }
    g[DISMISSED_PINS_BOOT] = { at };
    return g[DISMISSED_PINS_BOOT]!;
};

const persistDismissedPins = (): void => {
    try {
        const rows = [...dismissedPinsSlot().at.entries()].map(([k, t]) => ({ k, t }));
        localStorage.setItem(DISMISSED_PINS_KEY, JSON.stringify(rows));
    } catch {
        /* quota / private mode */
    }
};

export const isAndroidShortcutDismissed = (pkg: string, sid: string): boolean =>
    androidShortcutDismissedAt(pkg, sid) > 0;

export const androidShortcutDismissedAt = (pkg: string, sid: string): number => {
    const key = dismissedPinKey(pkg, sid);
    if (key === "::") return 0;
    return Number(dismissedPinsSlot().at.get(key) || 0);
};

export const rememberDismissedAndroidShortcut = (pkg: string, sid: string): void => {
    const key = dismissedPinKey(pkg, sid);
    if (key === "::") return;
    dismissedPinsSlot().at.set(key, Date.now());
    persistDismissedPins();
    (globalThis as { __CWSP_ACK_PIN_AFTER_REMOVE__?: boolean }).__CWSP_ACK_PIN_AFTER_REMOVE__ = true;
};

export const forgetDismissedAndroidShortcut = (pkg: string, sid: string): void => {
    const key = dismissedPinKey(pkg, sid);
    if (key === "::") return;
    if (!dismissedPinsSlot().at.delete(key)) return;
    persistDismissedPins();
};

/*
 * WHY: hydrate mirrorPath from the LS backup key synchronously so the grid
 * renders in mirror mode before OPFS hydration resolves (OPFS path overrides
 * this value when it lands). Then trigger the initial mirror listing fetch.
 */
if (typeof globalThis !== "undefined") {
    try {
        if (typeof localStorage !== "undefined") {
            const lsMirror = localStorage.getItem(MIRROR_PATH_LS_KEY);
            if (lsMirror && !mirrorPathState.value) mirrorPathState.value = lsMirror;
        }
    } catch { /* private mode */ }
    void initLinkStore().then(() => { void refreshSpeedDialMirror(); });
}

export const persistSpeedDialItems = () => {
    scheduleOpfsFlush();
    try {
        saveUIState(STORAGE_KEY);
        return;
    } catch { /* fall through */ }
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(STORAGE_KEY, JSOX.stringify(packState(speedDialItems as any)));
    } catch { /* quota / private mode */ }
};

export const persistSpeedDialMeta = () => {
    scheduleOpfsFlush();
    try {
        saveUIState(META_STORAGE_KEY);
        return;
    } catch { /* fall through */ }
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(META_STORAGE_KEY, JSOX.stringify(packMetaRegistry(speedDialMeta)));
    } catch { /* quota / private mode */ }
};

/** Packed grid used by multi-page workspaces. */
export type SpeedDialSnapshot = {
    items: SpeedDialPersistedItem[];
};

export const packSpeedDialItem = (item: SpeedDialItem): SpeedDialPersistedItem => {
    const packed = serializeItemState(item);
    const meta = getSpeedDialMeta(item.id);
    return {
        ...packed,
        ...(meta ? { meta: durableMetaForPersist(item.id, meta) } : {})
    };
};

export const captureSpeedDialSnapshot = (): SpeedDialSnapshot => ({
    items: (speedDialItems || []).map((item) => packSpeedDialItem(item))
});

export const applySpeedDialSnapshot = (snapshot: SpeedDialSnapshot | null | undefined): void => {
    markUserEditedBeforeHydrate();
    const rows = Array.isArray(snapshot?.items) ? snapshot!.items : [];
    const nextItems: SpeedDialItem[] = [];
    for (const raw of rows) {
        if (!raw?.id) continue;
        const item = createStatefulItem({
            id: raw.id,
            cell: observe([Number((raw.cell as any)?.[0]) || 0, Number((raw.cell as any)?.[1]) || 0]),
            icon: raw.icon || "sparkle",
            label: raw.label || "Shortcut",
            action: raw.action || "open-link"
        });
        nextItems.push(observe(item) as any);
    }
    speedDialItems.splice(0, speedDialItems.length, ...nextItems);
    if (!nextItems.length) markIntentionalEmptyGrid();
    /*
     * WHY: other Sides keep their metas in this registry. Deleting "stale"
     * ids wiped iconDisplay/shape/iconUrl; persist then sealed the reset.
     */
    for (const raw of rows) {
        if (!raw?.id) continue;
        const incoming: SpeedDialItemMeta = {
            action: raw.action,
            ...packSpeedDialMetaPlain(raw.meta)
        };
        incoming.iconUrl = persistSpeedDialIconBlob(raw.id, String(incoming.iconUrl || ""));
        const merged = mergeMetaKeepingAppearance(getSpeedDialMeta(raw.id), incoming);
        ensureSpeedDialMeta(raw.id, merged);
    }
    persistSpeedDialItems();
    persistSpeedDialMeta();
};

const metaNumber = (value: unknown, fallback: number): number => {
    let cur: unknown = value;
    if (cur && typeof cur === "object" && "value" in (cur as object)) {
        cur = (cur as { value: unknown }).value;
    }
    const n = Number(cur);
    return Number.isFinite(n) && n >= 1 ? n : fallback;
};

export const defaultWidgetSpan = (kind: string): GridSpan => {
    const id = String(kind || "").toLowerCase();
    if (id === "search") return [2, 1];
    if (id === "clock") return [2, 1];
    if (id === "android") return [2, 2];
    return [1, 1];
};

export const getItemSpan = (id?: string | null): GridSpan => {
    const meta = id ? getSpeedDialMeta(id) : null;
    const item = id ? (speedDialItems || []).find((it) => it?.id === id) : null;
    /* INVARIANT: item.action === widget wins over a stale meta.action (CRX hydrate). */
    const isWidget =
        String(item?.action || "").toLowerCase() === "widget" ||
        String(meta?.action || "").toLowerCase() === "widget";
    const kind = isWidget ? String(meta?.widgetKind || "").toLowerCase() : "";
    const fallback = kind
        ? defaultWidgetSpan(kind)
        : isWidget
          ? defaultWidgetSpan("clock")
          : ([1, 1] as GridSpan);
    return normalizeSpan([
        metaNumber(meta?.spanCols, fallback[0]),
        metaNumber(meta?.spanRows, fallback[1])
    ]);
};

export const setItemSpan = (id: string, span: GridSpan | readonly number[]): GridSpan => {
    const next = normalizeSpan(span);
    const meta = ensureSpeedDialMeta(id);
    meta.spanCols = next[0];
    meta.spanRows = next[1];
    persistSpeedDialMeta();
    emitSpeedDialMutation("update", id);
    return next;
};

export const createWidgetSpeedDialItem = (
    kind: "clock" | "search" | "android",
    cell?: GridCell,
    extra?: SpeedDialItemMeta
): SpeedDialItem => {
    const span = normalizeSpan([
        extra?.spanCols ?? defaultWidgetSpan(kind)[0],
        extra?.spanRows ?? defaultWidgetSpan(kind)[1]
    ]);
    const item = createStatefulItem({
        id: generateItemId(),
        cell: cell || findNextFreeSpeedDialCell(span),
        icon: kind === "clock" ? "clock" : kind === "search" ? "magnifying-glass" : "squares-four",
        label:
            String(extra?.description || "").trim() ||
            (kind === "clock" ? "Clock" : kind === "search" ? "Search" : "Widget"),
        action: "widget"
    });
    ensureSpeedDialMeta(item.id, {
        action: "widget",
        widgetKind: kind,
        shape: getDefaultTileShape(),
        spanCols: span[0],
        spanRows: span[1],
        ...(extra || {})
    });
    return item;
};

export const getSpeedDialMeta = (id?: string | null) => {
    if (!id) return null;
    return speedDialMeta?.get?.(id) ?? null;
};

export const ensureSpeedDialMeta = (id: string, defaults: SpeedDialItemMeta = {}) => {
    let meta = speedDialMeta?.get?.(id);
    if (!meta) {
        meta = createMetaState(defaults);
        speedDialMeta?.set?.(id, meta);
        persistSpeedDialMeta();
        return meta;
    }
    let changed = false;
    for (const [key, value] of Object.entries(defaults)) {
        if (value == null || value === "") continue;
        /* INVARIANT: defaults must not demote a live widget to open-view. */
        if (
            key === "action" &&
            String((meta as Record<string, unknown>).action || "").toLowerCase() === "widget" &&
            String(value || "").toLowerCase() !== "widget"
        ) {
            continue;
        }
        if ((meta as Record<string, unknown>)[key] !== value) {
            (meta as Record<string, unknown>)[key] = value;
            changed = true;
        }
    }
    if (changed) persistSpeedDialMeta();
    return meta;
};

export const removeSpeedDialMeta = (id: string) => {
    const removed = speedDialMeta?.delete?.(id);
    if (removed) {
        forgetSpeedDialIconBlob(id);
        persistSpeedDialMeta();
    }
    return removed;
};

const syncMetaActionFromItem = (item?: SpeedDialItem | null) => {
    if (!item) return false;
    const desiredAction = item.action || "open-view";
    const meta = ensureSpeedDialMeta(item.id, { action: desiredAction });
    if (meta.action !== desiredAction) {
        meta.action = desiredAction;
        return true;
    }
    return false;
};

const syncMetaActionsForAllItems = () => {
    let changed = false;
    speedDialItems?.forEach?.((item) => {
        if (syncMetaActionFromItem(item)) {
            changed = true;
        }
    });
    if (changed) {
        persistSpeedDialMeta();
    }
};

const flushLegacyMetaBuffer = () => {
    if (!legacyMetaBuffer.length) return;
    legacyMetaBuffer.forEach(([id, meta]) => {
        const target = ensureSpeedDialMeta(id, meta);
        Object.assign(target, meta);
    });
    legacyMetaBuffer.length = 0;
    persistSpeedDialMeta();
};

flushLegacyMetaBuffer();
syncMetaActionsForAllItems();

const ensureExternalShortcuts = () => {
    let changed = false;
    EXTERNAL_SHORTCUTS.forEach((shortcut) => {
        const exists = speedDialItems?.find?.((item) => item?.id === shortcut.id);
        if (!exists) {
            const item = createStatefulItem(shortcut);
            if (shortcut.label && item.label && typeof item.label === "object" && "value" in item.label) {
                item.label.value = shortcut.label;
            }
            if (shortcut.icon && item.icon && typeof item.icon === "object" && "value" in item.icon) {
                item.icon.value = shortcut.icon;
            }

            speedDialItems.push(observe(item) as any);
            ensureSpeedDialMeta(item.id, shortcut.meta);
            changed = true;
        } else {
            const currentMeta = getSpeedDialMeta(shortcut.id);
            if (shortcut.meta && currentMeta) {
                const nextHref = String(shortcut.meta.href ?? "");
                if (nextHref !== String(currentMeta.href ?? "")) {
                    currentMeta.href = nextHref;
                    changed = true;
                }
                const nextDesc = String(shortcut.meta.description ?? "");
                if (nextDesc !== String(currentMeta.description ?? "")) {
                    currentMeta.description = nextDesc;
                    changed = true;
                }
            } else if (shortcut.meta && !currentMeta) {
                ensureSpeedDialMeta(shortcut.id, shortcut.meta);
                changed = true;
            }
        }
    });
    if (changed) {
        persistSpeedDialItems();
        persistSpeedDialMeta();
    }
};
ensureExternalShortcuts();

/**
 * WHY: Explorer / Settings / Markdown live on the Core Rail only.
 * Strip them from the curated grid and persist — including after OPFS hydrate,
 * which otherwise re-injects the legacy OPFS snapshot.
 */
export const stripCoreRailTilesFromGrid = (opts?: { markDirty?: boolean }): boolean => {
    try {
        let changed = false;
        const matches = (speedDialItems || []).filter((item) =>
            isCoreRailGridTile(item, getSpeedDialMeta(item?.id))
        );
        for (const item of matches) {
            const idx = speedDialItems.findIndex((it) => it?.id === item.id);
            if (idx >= 0) {
                speedDialItems.splice(idx, 1);
                removeSpeedDialMeta(item.id);
                changed = true;
            }
        }
        if (changed) {
            /* WHY: boot strip must abort OPFS hydrate that still has these tiles. */
            if (opts?.markDirty !== false) markUserEditedBeforeHydrate();
            persistSpeedDialItems();
            persistSpeedDialMeta();
        }
        return changed;
    } catch (e) {
        console.warn("[speed-dial] core rail strip failed", e);
        return false;
    }
};

/** Boot: remove legacy Core Rail tiles from LS-backed grid before/around hydrate. */
const ensureCoreViewShortcuts = () => {
    stripCoreRailTilesFromGrid({ markDirty: true });
};
ensureCoreViewShortcuts();

/*
 * WHY (CRX): chrome.storage.local.get is async and completes after the boot strip.
 * Re-strip + persist shortly after so the cleaned grid is written back to chrome.storage
 * and dual idle-savers cannot keep resurrecting Explorer/Settings/Markdown.
 */
try {
    const hasChrome =
        typeof chrome !== "undefined" && !!(chrome as any)?.storage?.local;
    if (hasChrome) {
        const rewrite = () => {
            stripCoreRailTilesFromGrid({ markDirty: true });
            persistSpeedDialItems();
            persistSpeedDialMeta();
        };
        scheduler?.yield?.()?.then?.(rewrite);
        setTimeout(rewrite, 0);
        setTimeout(rewrite, 300);
        setTimeout(rewrite, 1200);
    }
} catch {
    /* ignore */
}

/**
 * WHY: Past merges left both legacy `settings` and `shortcut-settings` (same view) on disk.
 * Keep the preferred default id when present; otherwise keep the first match.
 */
const dedupeCoreOpenViewTiles = () => {
    let changed = false;
    const core = DEFAULT_SPEED_DIAL_DATA_ALL.filter(
        (entry) => entry.action === "open-view" && isSpeedDialViewAllowed(entry.meta, entry.id)
    );
    const getItemLabel = (item: any): string => {
        const raw = item?.label;
        if (raw && typeof raw === "object" && "value" in raw) return String(raw.value || "").trim().toLowerCase();
        return String(raw || "").trim().toLowerCase();
    };
    for (const shortcut of core) {
        const view = String(shortcut.meta?.view || "").trim().toLowerCase();
        const label = String(shortcut.label || "").trim().toLowerCase();
        if (!view && !label) continue;
        const matches = (speedDialItems || []).filter((item) => {
            const metaView = String(getSpeedDialMeta(item.id)?.view || "").trim().toLowerCase();
            const action = String(getSpeedDialMeta(item.id)?.action || item?.action || "open-view").toLowerCase();
            if (action !== "open-view") return false;
            if (view && metaView === view) return true;
            /* WHY: legacy tiles may lack meta.view but share the same visible label. */
            return Boolean(label) && getItemLabel(item) === label;
        });
        if (matches.length <= 1) continue;
        const keep = matches.find((item) => item.id === shortcut.id) || matches[0];
        for (const item of matches) {
            if (item === keep) continue;
            const idx = speedDialItems.findIndex((row) => row?.id === item.id);
            if (idx >= 0) {
                speedDialItems.splice(idx, 1);
                changed = true;
            }
        }
    }
    if (changed) {
        persistSpeedDialItems();
        persistSpeedDialMeta();
    }
};
dedupeCoreOpenViewTiles();

/** Router mount prefix (`/cwsp`, `/markdown`, …) when present on `<html>`. */
const getSpeedDialRouterBase = (): string => {
    try {
        return String(document.documentElement?.dataset?.cwspRouterBase || "")
            .trim()
            .replace(/\/+$/, "");
    } catch {
        return "";
    }
};

/**
 * Entry URL for a view deep link: `/settings?shell=environment[&native=1]&view=settings`
 * WHY: address-bar readable path; environment keeps `/${view}` (not root `/?view=`).
 * INVARIANT: open with this path; `preserveNativeDeepLink` must not strip it to `/`.
 */
export const buildSpeedDialViewPathHref = (
    viewId: string,
    absolute = false,
    opts?: { native?: boolean }
): string => {
    const id = String(viewId || "")
        .trim()
        .replace(/^#/, "")
        .replace(/^\/+/, "")
        .split(/[/?#]/)[0]
        .toLowerCase();
    if (!id) return "";
    const useNative = opts?.native === true;
    const base = getSpeedDialRouterBase().replace(/\/+$/, "") || "";
    const path = `${base}/${id}`.replace(/\/{2,}/g, "/") || `/${id}`;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const withQuery = useNative
        ? `${normalized}?shell=environment&native=1&view=${encodeURIComponent(id)}`
        : `${normalized}?shell=environment&view=${encodeURIComponent(id)}`;
    if (!absolute || typeof location === "undefined") return withQuery;
    try {
        const url = new URL(location.href);
        url.pathname = normalized;
        url.hash = "";
        url.search = "";
        url.searchParams.set("shell", "environment");
        url.searchParams.set("view", id);
        if (useNative) {
            url.searchParams.set("native", "1");
        } else {
            url.searchParams.delete("native");
        }
        return url.href;
    } catch {
        return withQuery;
    }
};

/**
 * Open `href` in a **new browser tab** without navigating the current tab.
 * WHY: `window.open(url, "_blank", "noopener")` returns `null` by spec even when the
 * window opened — our old `if (!opened) location.assign(href)` hijacked the desktop.
 * INVARIANT: never `location.assign` / `location.href =` from native/open-link paths.
 */
export const openInNewBrowserTab = (href: string): boolean => {
    const url = String(href || "").trim();
    if (!url || typeof window === "undefined") return false;
    try {
        let target = "_blank";
        try {
            if (typeof (window as unknown as { fence?: unknown }).fence === "object") {
                target = "_unfencedTop";
            }
        } catch {
            target = "_blank";
        }
        /*
         * WHY: `_unfencedTop` only works in fenced frames. A normal iframe
         * (`self !== top`) used to swallow the click and open nothing.
         */
        window.open(url, target, "noreferrer,noopener");
        return true;
    } catch (e) {
        console.warn("[home-view] openInNewBrowserTab failed", e);
        return false;
    }
};

/** @deprecated alias — prefer {@link openInNewBrowserTab} or {@link openInDetachedBrowserWindow}. */
export const openInNewBrowserWindow = openInNewBrowserTab;

/** True when this browsing context is an installed-like PWA (WCO / standalone / …). */
export const isInstalledPwaDisplayContext = (): boolean => {
    if (typeof globalThis === "undefined") return false;
    try {
        const nav = globalThis.navigator as Navigator & {
            windowControlsOverlay?: { visible?: boolean };
        };
        if (nav?.windowControlsOverlay?.visible) return true;
    } catch {
        /* ignore */
    }
    if (typeof globalThis.matchMedia !== "function") return false;
    try {
        for (const q of [
            "(display-mode: window-controls-overlay)",
            "(display-mode: standalone)",
            "(display-mode: fullscreen)",
            "(display-mode: minimal-ui)"
        ]) {
            if (globalThis.matchMedia(q).matches) return true;
        }
    } catch {
        /* ignore */
    }
    return false;
};

/**
 * Open a **detached window** for native-window mode (never a browser tab).
 *
 * INVARIANT:
 * - Do **not** use bare `window.open(url, "_blank")` — Chromium/Edge treat that as a **tab**.
 * - Do **not** fall back to {@link openInNewBrowserTab} (that is the `new-tab` mode).
 * - Do **not** request `menubar`/`toolbar`/`location` — those force full browser chrome
 *   and break PWA/WCO when the window is captured as an app window.
 * - Use a unique window name + `popup=yes,width,height` so each Native open is a
 *   separate window. From an installed PWA, size features still open another app window.
 *
 * Never hijack the opener via `location.assign`.
 */
let windowOpenThrottled = Date.now();
export const openInDetachedBrowserWindow = (href: string): boolean => {
    const url = String(href || "").trim();
    if (!url || typeof window === "undefined") return false;
    try {
        /* Do NOT put noopener in the features string — that forces a null return even on success. */
        const name = `cwsp-native-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const features = "popup,menubar=false,toolbar=false,location=false,width=1280,height=800";
        const opened = ((Date.now() - windowOpenThrottled) > 200) ? window.open(url, name, features) : null;
        windowOpenThrottled = Date.now();
        if (opened) {
            try {
                opened.opener = null;
            } catch {
                /* ignore */
            }
            return true;
        }
    } catch (e) {
        console.warn("[home-view] openInDetachedBrowserWindow failed", e);
    }
    /* WHY: native-window ≠ new-tab — surface failure instead of silently opening a tab. */
    return false;
};

/** True when href is (or resolves to) a same-origin app view path / bare view token. */
export const parseSpeedDialViewFromHref = (raw: string): string => {
    const input = String(raw || "").trim();
    if (!input || /^(mailto:|blob:|data:)/i.test(input)) return "";
    try {
        if (/^https?:\/\//i.test(input)) {
            const u = new URL(input);
            if (typeof location !== "undefined" && u.origin !== location.origin) return "";
            const seg = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
            const id = seg.toLowerCase();
            if (!id || id === "home") return "";
            return id === "markdown" ? "viewer" : id;
        }
    } catch {
        return "";
    }
    if (input.startsWith("/")) {
        const seg = input.replace(/^\//, "").split(/[/?#]/)[0].toLowerCase();
        if (!seg || seg === "home") return "";
        return seg === "markdown" ? "viewer" : seg;
    }
    const token = input.replace(/^#/, "").split(/[/?#]/)[0].trim().toLowerCase();
    if (!token || token === "home" || /[.:]/.test(token)) return "";
    return token === "markdown" ? "viewer" : token;
};

/**
 * Prefer explicit `meta.href`; for view tiles synthesize path deep links
 * (`/settings`, `/workcenter`, …) for Open link → new tab / native window.
 */
export const resolveSpeedDialItemHref = (item?: SpeedDialItem | null): string => {
    if (!item?.id) return "";
    const meta = getSpeedDialMeta(item.id);
    const explicit = String(meta?.href || (item as any)?.href || "").trim();
    if (explicit) return explicit;
    const view = String(meta?.view || "").trim().replace(/^#/, "");
    if (!view) return "";
    return buildSpeedDialViewPathHref(view, true);
};

export const findSpeedDialItem = (id?: string | null) => {
    if (!id) return null;
    return speedDialItems?.find?.((item) => item?.id === id) || null;
};

export const createEmptySpeedDialItem = (
    cell: ReturnType<typeof observe<GridCell>> = observe([0, 0]) as ReturnType<typeof observe<GridCell>>
): SpeedDialItem => {
    const action = getDefaultSpeedDialAction();
    const item = createStatefulItem({
        id: generateItemId(),
        cell,
        icon: "sparkle",
        label: "New shortcut",
        action
    });
    ensureSpeedDialMeta(item.id, {
        action,
        href: "",
        description: "",
        shape: getDefaultTileShape(),
        iconDisplay: "glyph",
        iconScale: "compact",
        openLinkTarget: getDefaultOpenLinkTarget()
    });
    return item;
};

export const addSpeedDialItem = (item: SpeedDialItem) => {
    markUserEditedBeforeHydrate();
    speedDialItems?.push?.(observe(item) as any);
    syncMetaActionFromItem(item);
    // INVARIANT: always flush both carriers — meta holds href/view for open-link tiles.
    persistSpeedDialItems();
    persistSpeedDialMeta();
    emitSpeedDialMutation("add", item.id);
    return item;
};

export type LauncherAppPinPayload = {
    packageName: string;
    label: string;
    componentName: string;
    iconCacheKey: string;
};

/** JSON drag envelope for AppMenu → SpeedDial (launcher design spec). */
export function buildLauncherAppDragEnvelope(app: LauncherAppPinPayload): string {
    return JSON.stringify({
        state: { icon: "device-mobile", label: app.label },
        desc: {
            action: "launch-app",
            meta: {
                packageName: app.packageName,
                componentName: app.componentName,
                entityType: "android-app",
                iconCacheKey: app.iconCacheKey || app.packageName
            }
        }
    });
}

/** First unoccupied logical origin that fits `span`. */
export function findNextFreeSpeedDialCell(span: GridSpan | readonly number[] = [1, 1]): GridCell {
    const columns = Math.max(1, Math.min(16, Number(gridLayoutState?.columns) || 4));
    const rows = Math.max(1, Math.min(16, Number(gridLayoutState?.rows) || 8));
    const occupied = new Set<string>();
    for (const item of speedDialItems || []) {
        if (!item?.id) continue;
        const origin: GridCell = [Number(item?.cell?.[0]) || 0, Number(item?.cell?.[1]) || 0];
        markOccupiedSpan(occupied, origin, getItemSpan(item.id));
    }
    return findNearestFreeRect([0, 0], span, occupied, [columns, rows]);
}

/** First free cell inside a packed workspace snapshot (Side B/C while A is live). */
export function findNextFreeCellInSnapshot(
    snapshot: SpeedDialSnapshot | null | undefined,
    prefer?: GridCell,
    span: GridSpan | readonly number[] = [1, 1]
): GridCell {
    const columns = Math.max(1, Math.min(16, Number(gridLayoutState?.columns) || 4));
    const rows = Math.max(1, Math.min(16, Number(gridLayoutState?.rows) || 8));
    const occupied = new Set<string>();
    for (const raw of snapshot?.items || []) {
        if (!raw) continue;
        const origin: GridCell = [Number((raw.cell as number[])?.[0]) || 0, Number((raw.cell as number[])?.[1]) || 0];
        const packedSpan = normalizeSpan([
            Number((raw.meta as { spanCols?: number } | undefined)?.spanCols) || 1,
            Number((raw.meta as { spanRows?: number } | undefined)?.spanRows) || 1
        ]);
        markOccupiedSpan(occupied, origin, packedSpan);
    }
    return findNearestFreeRect(prefer || [0, 0], span, occupied, [columns, rows]);
}

const querySpeedDialGridElement = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('#home .speed-dial-grid[data-grid-layer="icons"]') ||
    document.querySelector<HTMLElement>("#home .speed-dial-grid:last-of-type") ||
    document.querySelector<HTMLElement>("#home .speed-dial-grid");

const readSpeedDialGridLayout = (): [number, number] => [
    Math.max(1, Math.min(16, Number(gridLayoutState?.columns) || 4)),
    Math.max(1, Math.min(16, Number(gridLayoutState?.rows) || 8))
];

/** Map viewport coordinates to a logical SpeedDial cell (null when grid is absent). */
export function resolveSpeedDialCellFromClientPoint(clientX: number, clientY: number): GridCell | null {
    const grid = querySpeedDialGridElement();
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const styles = getComputedStyle(grid);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const size: [number, number] = [
        Math.max(1, rect.width - paddingLeft - paddingRight),
        Math.max(1, rect.height - paddingTop - paddingBottom)
    ];
    const point: [number, number] = [
        clientX - rect.left - paddingLeft,
        clientY - rect.top - paddingTop
    ];
    const root = grid.closest<HTMLElement>(".speed-dial-root") || document.getElementById("home");
    const orientRaw = root?.getAttribute?.("data-orient") ?? root?.dataset?.orient ?? "0";
    return pointToLogicalCell(point, size, readSpeedDialGridLayout(), normalizeOrient(orientRaw));
}

export function isClientPointOverSpeedDial(clientX: number, clientY: number): boolean {
    const hit = document.elementFromPoint(clientX, clientY);
    return !!hit?.closest?.("#home, .speed-dial-root");
}

/** Create a persisted `launch-app` tile from an AppMenu entry. */
export function pinLauncherAppEntry(app: LauncherAppPinPayload, cell?: GridCell): SpeedDialItem | null {
    const targetCell = cell ?? findNextFreeSpeedDialCell();
    const item = parseSpeedDialItemFromJSON(buildLauncherAppDragEnvelope(app), targetCell);
    if (!item) return null;
    addSpeedDialItem(item);
    return item;
}

export const upsertSpeedDialItem = (item: SpeedDialItem) => {
    markUserEditedBeforeHydrate();
    const existingIndex = speedDialItems?.findIndex?.((entry) => entry?.id === item?.id) ?? -1;
    if (existingIndex === -1) {
        speedDialItems?.push?.(observe(item) as any);
    } else if (speedDialItems[existingIndex] !== item) {
        speedDialItems.splice(existingIndex, 1, observe(item) as any);
    }
    syncMetaActionFromItem(item);
    persistSpeedDialItems();
    persistSpeedDialMeta();
    emitSpeedDialMutation("update", item.id);
    return item;
};

export const removeSpeedDialItem = (id: string) => {
    markUserEditedBeforeHydrate();
    const index = speedDialItems?.findIndex?.((entry) => entry?.id === id) ?? -1;
    if (index === -1) return false;
    const meta = getSpeedDialMeta(id);
    const dismissPkg = String(meta?.packageName || "").trim();
    const dismissSid = String(meta?.shortcutId || "").trim();
    const dismissAction = String(meta?.action || speedDialItems[index]?.action || "").trim();
    speedDialItems.splice(index, 1);
    if (!speedDialItems.length) markIntentionalEmptyGrid();
    if ((dismissAction === "launch-shortcut" || Boolean(dismissSid)) && dismissPkg && dismissSid) {
        rememberDismissedAndroidShortcut(dismissPkg, dismissSid);
    }
    removeSpeedDialMeta(id);
    persistSpeedDialItems();
    emitSpeedDialMutation("remove", id);
    return true;
};

/** WHY: cell drag in SpeedDial calls `persistSpeedDialItems` directly — mark the hydrate race. */
export const markSpeedDialUserEditBeforeHydrate = markUserEditedBeforeHydrate;

export const snapshotSpeedDialItem = (item: SpeedDialItem) => {
    const meta = getSpeedDialMeta(item.id);
    const resolvedAction = meta?.action || item.action;
    const metaSnapshot = packSpeedDialMetaPlain((meta ?? {}) as SpeedDialItemMeta);
    if (!metaSnapshot.action) {
        metaSnapshot.action = resolvedAction;
    }
    return {
        state: {
            id: item.id,
            cell: [Number(item.cell?.[0]) || 0, Number(item.cell?.[1]) || 0] as GridCell,
            icon: unwrapRef(item.icon, ""),
            label: unwrapRef(item.label, "")
        },
        desc: {
            action: resolvedAction,
            meta: metaSnapshot
        }
    };
};

/** Clone a tile without keeping the source id (paste / Side B/C must not collide). */
export const cloneSpeedDialItemPacked = (item: SpeedDialItem, cell?: GridCell): SpeedDialPersistedItem => {
    const snap = snapshotSpeedDialItem(item);
    const meta = packSpeedDialMetaPlain((snap.desc?.meta || {}) as SpeedDialItemMeta);
    const action = String(snap.desc?.action || item.action || "open-view");
    meta.action = action;
    const nextId = generateItemId();
    const resolved = resolveSpeedDialIconUrl(item.id, String(meta.iconUrl || ""));
    if (isInlineIconUrl(resolved)) meta.iconUrl = persistSpeedDialIconBlob(nextId, resolved);
    return {
        id: nextId,
        cell: cell
            ? [Number(cell[0]) || 0, Number(cell[1]) || 0]
            : [Number(item.cell?.[0]) || 0, Number(item.cell?.[1]) || 0],
        icon: String(snap.state?.icon || unwrapRef(item.icon, "sparkle") || "sparkle"),
        label: String(snap.state?.label || unwrapRef(item.label, "Shortcut") || "Shortcut"),
        action,
        meta
    };
};

export const addClonedSpeedDialItem = (source: SpeedDialItem, cell?: GridCell): SpeedDialItem | null => {
    const packed = cloneSpeedDialItemPacked(source, cell);
    const item = createStatefulItem(packed);
    ensureSpeedDialMeta(item.id, { action: packed.action, ...(packed.meta || {}) });
    if (!cell) {
        const free = findNextFreeSpeedDialCell(getItemSpan(item.id));
        item.cell[0] = free[0];
        item.cell[1] = free[1];
    }
    addSpeedDialItem(item);
    return item;
};

const WALLPAPER_KEY = "cw::workspace::wallpaper";
export const wallpaperState = makeUIState(WALLPAPER_KEY, () => observe({
    src: "/assets/wallpaper.jpg",
    opacity: 1,
    blur: 0
}), (raw) => observe(raw || {
    src: "/assets/wallpaper.jpg",
    opacity: 1,
    blur: 0
}), (state) => ({ ...state })) as unknown as { src: string; opacity: number; blur: number };

export const persistWallpaper = () => (wallpaperState as any)?.$save?.();

export type GridShape =
    | "square"
    | "squircle"
    | "circle"
    | "rounded"
    | "hexagon"
    | "diamond"
    | "wavy"
    | "shapeless";

export interface GridLayoutSettings {
    columns: number;
    rows: number;
    shape: GridShape;
    /** Default click action for newly created tiles (`open-link` / `open-view`). */
    defaultAction?: string;
    /**
     * Launcher / pack bitmap scale inside the plate.
     * `compact` 0.78 · `fit` 1.0 · `fill` 1.28 (adaptive default) · `zoom` 1.5 · `max` 1.75
     */
    iconScale?: IconBitmapScale;
}

export type IconBitmapScale = "compact" | "fit" | "fill" | "zoom" | "max";

/** Per-tile: `auto` inherits Workspace default. */
export type ItemIconBitmapScale = IconBitmapScale | "auto";

const ICON_SCALE_VALUES: Record<IconBitmapScale, string> = {
    compact: "0.78",
    fit: "1",
    fill: "1.28",
    zoom: "1.5",
    max: "1.75"
};

export const ICON_BITMAP_SCALE_OPTIONS: Array<{ value: ItemIconBitmapScale; label: string }> = [
    { value: "auto", label: "Auto (workspace default)" },
    { value: "compact", label: "Compact (0.78)" },
    { value: "fit", label: "Fit (1.0 — no zoom)" },
    { value: "fill", label: "Fill (1.28 — adaptive)" },
    { value: "zoom", label: "Zoom (1.5)" },
    { value: "max", label: "Max (1.75)" }
];

export function normalizeIconBitmapScale(raw: unknown, fallback: IconBitmapScale = "fill"): IconBitmapScale {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "compact" || v === "small" || v === "0.78") return "compact";
    if (v === "fit" || v === "1" || v === "contain") return "fit";
    if (v === "fill" || v === "adaptive" || v === "1.28") return "fill";
    if (v === "zoom" || v === "1.5") return "zoom";
    if (v === "max" || v === "large" || v === "1.75") return "max";
    return fallback;
}

/** Empty / auto → inherit workspace; otherwise a concrete scale. */
export function normalizeItemIconBitmapScale(raw: unknown): ItemIconBitmapScale {
    const v = String(raw || "").trim().toLowerCase();
    if (!v || v === "auto" || v === "default" || v === "inherit") return "auto";
    return normalizeIconBitmapScale(v, "fill");
}

export function iconBitmapScaleCss(raw: unknown): string {
    return ICON_SCALE_VALUES[normalizeIconBitmapScale(raw)];
}

export function packIconBitmapScaleCss(raw: unknown): string {
    /* Same curve as launcher — milder pack curve made Fit/Fill look identical. */
    return iconBitmapScaleCss(raw);
}

/** Resolve item (`auto`) → concrete workspace/id scale factor string. */
export function resolveIconScaleFactor(rawItemScale?: unknown): string {
    const item = normalizeItemIconBitmapScale(rawItemScale);
    const id = item === "auto" ? normalizeIconBitmapScale(gridLayoutState?.iconScale, "fill") : item;
    return ICON_SCALE_VALUES[id];
}

/**
 * Set scale CSS vars on the plate AND inline `transform` on painted icon nodes.
 * WHY: Cap WebView often ignores `transform: scale(var(--x))` — inline scale is reliable.
 */
export function applyItemIconScaleToElement(el: HTMLElement | null | undefined, raw: unknown): void {
    if (!el) return;
    const item = normalizeItemIconBitmapScale(raw);
    const factor = resolveIconScaleFactor(raw);
    el.dataset.iconScale = item === "auto" ? "auto" : item;
    el.style.setProperty("--sd-item-icon-scale", factor);
    el.style.setProperty("--sd-item-pack-icon-scale", factor);
}

/** Inline transform on current icon children (call again after replacing img/ui-icon). */
export function applyIconScaleToPaintedNodes(
    el: HTMLElement | null | undefined,
    factor?: string
): void {
    if (!el) return;
    const n = String(factor || el.style.getPropertyValue("--sd-item-icon-scale") || "").trim() || "1.28";
    const t = `scale(${n})`;
    el.querySelectorAll<HTMLElement>(
        "img.ui-ws-item-icon-img, img[data-launcher-icon], img[data-bookmark-favicon], ui-icon, .ui-ws-item-icon-mask"
    ).forEach((node) => {
        /* WHY: Cap/WebView often drops CSS `scale(var(--x))` — pin inline with !important. */
        node.style.setProperty("transform", t, "important");
        node.style.setProperty("transform-origin", "center center", "important");
    });
}

/**
 * Native decode size so CSS zoom (scale × DPR) does not upscale a tiny bitmap.
 * WHY: tiles used to always fetch 96px then scale(1.5–1.75) → pixelation on retina.
 */
export function tileIconFetchSize(rawItemScale?: unknown, layoutCssPx = 96): number {
    const factor = Number(resolveIconScaleFactor(rawItemScale)) || 1.28;
    let dpr = 1;
    try {
        dpr = Math.min(3, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
    } catch {
        dpr = 1;
    }
    const base = Math.max(64, Math.round(Number(layoutCssPx) || 96));
    return Math.max(128, Math.min(512, Math.round(base * factor * dpr)));
}

const GRID_LAYOUT_KEY = "cw::workspace::grid-layout";
const WORKSPACE_GRID_EVENT = "cwsp:workspace-grid";
const TILE_SHAPES = new Set<string>([
    "square",
    "squircle",
    "circle",
    "rounded",
    "hexagon",
    "diamond",
    "wavy",
    "shapeless"
]);

export const normalizeTileShape = (raw: unknown, fallback: GridShape = "squircle"): GridShape => {
    const v = String(raw || "").trim().toLowerCase();
    return TILE_SHAPES.has(v) ? (v as GridShape) : fallback;
};

export const gridLayoutState = makeUIState(GRID_LAYOUT_KEY, () => observe({
    columns: 4,
    rows: 8,
    shape: "squircle" as GridShape,
    defaultAction: "open-link",
    iconScale: "fill" as IconBitmapScale
}), (raw) => observe(raw || {
    columns: 4,
    rows: 8,
    shape: "squircle" as GridShape,
    defaultAction: "open-link",
    iconScale: "fill" as IconBitmapScale
}), (state) => ({ ...state })) as unknown as GridLayoutSettings;

export const persistGridLayout = () => (gridLayoutState as any)?.$save?.();

export function getDefaultTileShape(): GridShape {
    return normalizeTileShape(gridLayoutState?.shape, "squircle");
}

export function setDefaultTileShape(shape: GridShape): void {
    gridLayoutState.shape = normalizeTileShape(shape, "squircle");
    persistGridLayout();
}

function normalizeDefaultAction(raw: unknown, fallback = "open-link"): string {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "open-view" || v === "view") return "open-view";
    if (v === "open-link" || v === "link") return "open-link";
    return fallback;
}

/** Default action id for newly created shortcuts (Settings → Workspace). */
export function getDefaultSpeedDialAction(): string {
    return normalizeDefaultAction(gridLayoutState?.defaultAction, "open-link");
}

export function setDefaultSpeedDialAction(action: string): void {
    gridLayoutState.defaultAction = normalizeDefaultAction(action, "open-link");
    persistGridLayout();
}

export function getIconBitmapScale(): IconBitmapScale {
    return normalizeIconBitmapScale(gridLayoutState?.iconScale, "fill");
}

export function setIconBitmapScale(scale: IconBitmapScale | string): void {
    gridLayoutState.iconScale = normalizeIconBitmapScale(scale, "fill");
    persistGridLayout();
    applyIconBitmapScaleCss(gridLayoutState.iconScale);
}

export function applyIconBitmapScaleCss(scale?: unknown): void {
    if (typeof document === "undefined") return;
    const id = normalizeIconBitmapScale(scale ?? gridLayoutState?.iconScale, "fill");
    const factor = iconBitmapScaleCss(id);
    document.documentElement.dataset.iconScale = id;
    document.documentElement.style.setProperty("--sd-launcher-icon-scale", factor);
    document.documentElement.style.setProperty("--sd-pack-icon-scale", factor);
}

const hasStoredValue = (key: string): boolean => {
    try {
        return typeof localStorage !== "undefined" && localStorage.getItem(key) !== null;
    } catch {
        return false;
    }
};

/**
 * Import the former orient-layer storage once. The renderer now has one state
 * model, but old users must not lose shortcuts when the new entrypoint mounts.
 */
const migrateLegacyDesktopState = (): void => {
    const legacy = loadDesktopRaw();
    const decoded = legacy ? decodeDesktopState(legacy) : null;
    if (!decoded?.items?.length) return;
    /*
     * INVARIANT: any stored grid, including an intentional empty array, is
     * authoritative. Re-importing the orient desktop here resurrects deleted
     * legacy tiles such as Network on every boot.
     */
    if (hasStoredValue(STORAGE_KEY)) return;

    const columns = Math.max(1, Math.min(32, Number(decoded.columns) || 4));
    const rows = Math.max(1, Math.min(32, Number(decoded.rows) || 8));
    const nextItems: SpeedDialItem[] = [];

    speedDialItems.splice(0, speedDialItems.length);
    speedDialMeta.clear();

    for (const raw of decoded.items as Array<Record<string, any>>) {
        const action = raw?.action === "open-link" ? "open-link" : "open-view";
        const item = createStatefulItem({
            id: String(raw?.id || generateItemId()),
            cell: observe([
                Number(raw?.cell?.[0]) || 0,
                Number(raw?.cell?.[1]) || 0
            ]),
            icon: String(raw?.icon || (action === "open-link" ? "link" : "sparkle")),
            label: String(raw?.label || "Shortcut"),
            action
        });
        const meta: SpeedDialItemMeta = {
            action,
            view: action === "open-view" ? String(raw?.viewId || "") : "",
            href: action === "open-link" ? String(raw?.href || "") : "",
            description: String(raw?.description || ""),
            shape: String(raw?.shape || "squircle"),
            iconSrc: String(raw?.iconSrc || "")
        };
        speedDialItems.push(item);
        ensureSpeedDialMeta(item.id, meta);
        nextItems.push(item);
    }

    if (!nextItems.length) return;

    gridLayoutState.columns = columns;
    gridLayoutState.rows = rows;
    gridLayoutState.shape = "square";
    persistSpeedDialItems();
    persistSpeedDialMeta();
    persistGridLayout();
};

migrateLegacyDesktopState();

export const applyGridSettings = (
    settings?: {
        grid?: Partial<GridLayoutSettings> & { defaultOpenLinkTarget?: string };
    },
    opts?: { relocate?: boolean }
) => {
    const gridConfig = settings?.grid || gridLayoutState;
    const columns = Math.max(1, Math.min(16, Number(gridConfig?.columns) || gridLayoutState.columns || 4));
    const rows = Math.max(1, Math.min(16, Number(gridConfig?.rows) || gridLayoutState.rows || 8));
    const shape = normalizeTileShape(gridConfig?.shape ?? gridLayoutState.shape, "squircle");
    const defaultAction = normalizeDefaultAction(
        gridConfig?.defaultAction ?? gridLayoutState.defaultAction,
        "open-link"
    );
    const iconScale = normalizeIconBitmapScale(
        (gridConfig as { iconScale?: unknown } | undefined)?.iconScale ?? gridLayoutState.iconScale,
        "fill"
    );

    /*
     * INVARIANT: relocate only when the user (or settings event) changes the
     * grid. Boot rAF used to run against default 4×8 before chrome.storage
     * hydrated the real layout — widgets (2×1) overflowed and persist sealed
     * everyone into the 4×8 origin pack.
     */
    const relocate = opts?.relocate === true || (opts?.relocate !== false && Boolean(settings?.grid));
    if (
        relocate &&
        relocateItemsToLayout(speedDialItems, [columns, rows], (item) =>
            getItemSpan((item as { id?: string }).id)
        )
    ) {
        persistSpeedDialItems();
    }

    if (gridLayoutState) {
        gridLayoutState.columns = columns;
        gridLayoutState.rows = rows;
        gridLayoutState.shape = shape;
        gridLayoutState.defaultAction = defaultAction;
        gridLayoutState.iconScale = iconScale;
        persistGridLayout();
    }

    const openTarget = (gridConfig as { defaultOpenLinkTarget?: string } | undefined)?.defaultOpenLinkTarget;
    if (openTarget != null && String(openTarget).trim()) {
        setDefaultOpenLinkTarget(normalizeOpenLinkTarget(openTarget));
    }

    if (typeof document === "undefined") {
        return;
    }

    // INVARIANT: visual `data-grid-columns/rows` on `.speed-dial-grid` belong to
    // syncGridLayout (orient-aware). Logical counts live on documentElement.
    document.documentElement.dataset.gridColumns = String(columns);
    document.documentElement.dataset.gridRows = String(rows);
    document.documentElement.dataset.gridShape = shape;
    applyIconBitmapScaleCss(iconScale);
    /* Re-apply per-tile scales (auto → new workspace factor) + re-fetch hi-res bitmaps. */
    try {
        document
            .querySelectorAll<HTMLElement>(".speed-dial-grid [data-speed-dial-item][data-layer='icons']")
            .forEach((tile) => {
                const id = tile.getAttribute("data-id") || "";
                const meta = id ? getSpeedDialMeta(id) : null;
                applyItemIconScaleToElement(
                    tile,
                    defaultIconScaleForDisplay(tile.getAttribute("data-icon-display"), meta?.iconScale)
                );
                applyIconScaleToPaintedNodes(tile);
                tile.dispatchEvent(new CustomEvent("cwsp:icon-bitmap-refresh"));
            });
    } catch {
        /* ignore */
    }
};

type WorkspaceGridEventDetail = Partial<GridLayoutSettings> & {
    defaultOpenLinkTarget?: string;
    query?: boolean;
    receive?: (grid: Partial<GridLayoutSettings> & { defaultOpenLinkTarget: OpenLinkTarget }) => void;
    ack?: () => void;
};

if (typeof window !== "undefined") {
    window.addEventListener(WORKSPACE_GRID_EVENT, (ev: Event) => {
        const detail = (ev as CustomEvent<WorkspaceGridEventDetail>).detail;
        if (!detail) return;
        if (detail.query && typeof detail.receive === "function") {
            detail.receive({
                columns: gridLayoutState.columns,
                rows: gridLayoutState.rows,
                shape: gridLayoutState.shape,
                defaultAction: getDefaultSpeedDialAction(),
                iconScale: getIconBitmapScale(),
                defaultOpenLinkTarget: getDefaultOpenLinkTarget()
            });
            return;
        }
        applyGridSettings({ grid: detail }, { relocate: true });
        detail.ack?.();
    });
}

if (typeof globalThis !== "undefined" && typeof document !== "undefined") {
    const run = () => applyGridSettings(undefined, { relocate: false });
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
    } else {
        scheduler?.yield?.()?.then?.(run);
    }
}

const looksLikeJsonObject = (raw: string): boolean => {
    const t = String(raw || "").trim();
    return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
};

export const SPEED_DIAL_CLIP_KIND = "cwsp.speed-dial.shortcut";

/** Pretty or compact shortcut JSON — not a single `{` line from stringify(..., 2). */
export const looksLikeSpeedDialShortcutJson = (raw: string): boolean => {
    const t = String(raw || "").trim();
    if (!t.startsWith("{") || !t.endsWith("}")) return false;
    return (
        /"kind"\s*:\s*"cwsp\.speed-dial\.shortcut"/.test(t) ||
        /"state"\s*:/.test(t) ||
        /"desc"\s*:/.test(t)
    );
};

/**
 * Explorer virtual paths (`/bookmarks/…`, `/user/…`, `/assets/…`).
 * WHY: drag from Explorer used to put these in `text/plain`; they are not JSON.
 */
export const isSpeedDialVirtualPath = (raw: string): boolean => {
    const p = String(raw || "").trim();
    if (!p.startsWith("/") || p.includes("://") || /\s/.test(p)) return false;
    return (
        p === "/" ||
        p === "/bookmarks" ||
        p.startsWith("/bookmarks/") ||
        p === "/user" ||
        p.startsWith("/user/") ||
        p === "/assets" ||
        p.startsWith("/assets/")
    );
};

export const parseSpeedDialItemFromVirtualPath = (
    pathText: string,
    suggestedCell?: GridCell,
    extras?: { label?: string; href?: string; kind?: string }
): SpeedDialItem | null => {
    const path = String(pathText || "").trim();
    if (!isSpeedDialVirtualPath(path)) return null;
    const href = String(extras?.href || "").trim();
    const isUrl = /^https?:\/\//i.test(href);
    const isDir = path.endsWith("/") || extras?.kind === "directory";
    const labelFromPath = path.split("/").filter(Boolean).pop() || path;
    const item = createStatefulItem({
        id: generateItemId(),
        cell: suggestedCell || [0, 0],
        icon: isUrl ? "link" : isDir ? "folder" : "file",
        label: String(extras?.label || "").trim() || labelFromPath,
        action: isUrl ? "open-link" : "open-path"
    });
    const meta: SpeedDialItemMeta = {
        action: isUrl ? "open-link" : "open-path",
        path,
        ...(isUrl ? { href } : {}),
        kind: extras?.kind || (isDir ? "directory" : "file"),
        iconDisplay: "glyph",
        iconScale: "compact"
    };
    ensureSpeedDialMeta(item.id, meta);
    return item;
};

export const parseSpeedDialItemFromJSON = (jsonText: string, suggestedCell?: GridCell): SpeedDialItem | null => {
    const raw = String(jsonText || "").trim();
    if (!raw) return null;
    // WHY: Explorer bookmark drags used to send `/bookmarks/…` here. That is
    // not JSON — parse as a virtual path instead of `JSON.parse` + console.warn.
    if (isSpeedDialVirtualPath(raw)) {
        return parseSpeedDialItemFromVirtualPath(raw, suggestedCell);
    }
    if (!looksLikeJsonObject(raw)) return null;
    try {
        const parsedRaw = JSON.parse(raw) as any;
        if (!parsedRaw || typeof parsedRaw !== "object") return null;

        const parsed =
            parsedRaw.kind === SPEED_DIAL_CLIP_KIND && parsedRaw.snapshot
                ? parsedRaw.snapshot
                : parsedRaw;

        const state = parsed.state || parsed;
        const desc = parsed.desc || parsed.meta || {};

        if (!state || typeof state !== "object") return null;

        /* WHY: paste must land on the click/pointer cell; keep source cell only when none given. */
        const cellValue = suggestedCell
            ? ([Number(suggestedCell[0]) || 0, Number(suggestedCell[1]) || 0] as GridCell)
            : state.cell && Array.isArray(state.cell) && state.cell.length >= 2
                ? [Number(state.cell[0]) || 0, Number(state.cell[1]) || 0] as GridCell
                : ([0, 0] as GridCell);

        const href = String(desc.href || desc.meta?.href || state.href || "").trim();
        const path = String(desc.path || desc.meta?.path || state.path || "").trim();
        const action =
            desc.action ||
            state.action ||
            (href ? "open-link" : path ? "open-path" : "open-view");

        const item = createStatefulItem({
            id: generateItemId(),
            cell: cellValue,
            icon:
                state.icon ||
                desc.icon ||
                (action === "launch-app" ? "device-mobile" : href ? "link" : path ? "folder" : "sparkle"),
            label: state.label || desc.label || "Shortcut",
            action
        });

        const meta: SpeedDialItemMeta = {
            action,
            ...(desc.meta || desc || {}),
            ...(state.meta || {}),
            ...(href ? { href } : {}),
            ...(path ? { path } : {})
        };
        meta.action = action;

        ensureSpeedDialMeta(item.id, meta);
        return item;
    } catch (e) {
        console.warn("Failed to parse JSON for speed dial item:", e);
        return null;
    }
};

/** Digits-only length for phone heuristics (E.164-ish). */
const PHONE_DIGIT_MIN = 7;
const PHONE_DIGIT_MAX = 15;

const digitsOnly = (s: string): string => String(s || "").replace(/\D+/g, "");

const looksLikePhoneNumber = (raw: string): boolean => {
    const t = String(raw || "").trim();
    if (!t || /\s{3,}/.test(t)) return false;
    if (/^tel:/i.test(t)) return true;
    /* Reject obvious URLs / emails. */
    if (/[@/]|https?:/i.test(t) && !/^tel:/i.test(t)) return false;
    const digits = digitsOnly(t);
    if (digits.length < PHONE_DIGIT_MIN || digits.length > PHONE_DIGIT_MAX) return false;
    /* Allow +, spaces, dashes, parens, dots. */
    return /^[+]?[\d\s().-]{7,24}$/.test(t);
};

const looksLikeEmail = (raw: string): boolean => {
    const t = String(raw || "").trim();
    if (!t) return false;
    if (/^mailto:/i.test(t)) return true;
    if (/\s/.test(t)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(t);
};

const looksLikeTelegramHandle = (raw: string): boolean => {
    const t = String(raw || "").trim();
    if (!t) return false;
    if (/^(tg:|telegram:)/i.test(t)) return true;
    if (/^(https?:\/\/)?(t\.me|telegram\.me)\//i.test(t)) return true;
    /* Bare @username */
    return /^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(t);
};

/**
 * Parse common calendar-ish fragments → Android calendar time URI when possible.
 * WHY: Cap openUri(ACTION_VIEW) on content://com.android.calendar/time/<ms> opens the day.
 */
const parseCalendarHref = (raw: string): { href: string; label: string } | null => {
    const t = String(raw || "").trim();
    if (!t) return null;
    if (/^content:\/\/com\.android\.calendar\//i.test(t)) {
        return { href: t, label: "Calendar" };
    }
    /* ISO date / datetime */
    const iso = t.match(
        /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?))?(?:Z|[+-]\d{2}:?\d{2})?$/
    );
    if (iso) {
        const d = new Date(iso[2] ? `${iso[1]}T${iso[2]}` : `${iso[1]}T12:00:00`);
        if (!Number.isNaN(d.getTime())) {
            return {
                href: `content://com.android.calendar/time/${d.getTime()}`,
                label: iso[1]
            };
        }
    }
    /* DD.MM.YYYY or DD/MM/YYYY */
    const dmy = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (dmy) {
        const day = Number(dmy[1]);
        const month = Number(dmy[2]) - 1;
        const year = Number(dmy[3]);
        const hh = dmy[4] != null ? Number(dmy[4]) : 12;
        const mm = dmy[5] != null ? Number(dmy[5]) : 0;
        const d = new Date(year, month, day, hh, mm, 0, 0);
        if (!Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month) {
            return {
                href: `content://com.android.calendar/time/${d.getTime()}`,
                label: `${String(day).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}.${year}`
            };
        }
    }
    return null;
};

const normalizeTelegramHref = (raw: string): { href: string; label: string } | null => {
    const t = String(raw || "").trim();
    if (!t) return null;
    if (/^tg:/i.test(t) || /^telegram:/i.test(t)) {
        return { href: t, label: "Telegram" };
    }
    const at = t.match(/^@([a-zA-Z][a-zA-Z0-9_]{3,31})$/);
    if (at) {
        return { href: `https://t.me/${at[1]}`, label: `@${at[1]}` };
    }
    try {
        const u = new URL(t.startsWith("http") ? t : `https://${t.replace(/^\/+/, "")}`);
        if (/^(t\.me|telegram\.me)$/i.test(u.hostname.replace(/^www\./, ""))) {
            const user = u.pathname.replace(/^\/+/, "").split("/")[0] || "Telegram";
            return { href: u.href, label: user.startsWith("+") ? user : `@${user}` };
        }
    } catch {
        /* ignore */
    }
    return null;
};

/**
 * Build a Speed Dial open-link tile for tel / mailto / telegram / calendar / smart text.
 * Prefer this before plain http(s) parsing when the clipboard is not a web URL.
 */
export const parseSpeedDialItemFromSmartText = (
    rawText: string,
    suggestedCell?: GridCell
): SpeedDialItem | null => {
    const text = String(rawText || "").trim();
    if (!text) return null;

    const firstLine =
        text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l && !l.startsWith("#")) || text;

    let candidate = firstLine;
    if (candidate.startsWith("<") && candidate.endsWith(">")) {
        candidate = candidate.slice(1, -1).trim();
    }

    const makeLinkItem = (opts: {
        href: string;
        label: string;
        icon: string;
        description?: string;
    }): SpeedDialItem => {
        const item = createStatefulItem({
            id: generateItemId(),
            cell: suggestedCell || [0, 0],
            icon: opts.icon,
            label: opts.label,
            action: "open-link"
        });
        /* WHY: paste defaults to Phosphor glyph; properties can still set iconUrl photo/avatar. */
        ensureSpeedDialMeta(item.id, {
            action: "open-link",
            href: opts.href,
            description: opts.description || opts.label,
            iconDisplay: "glyph",
            iconScale: "compact",
            openLinkTarget: defaultOpenLinkTargetForHref(opts.href)
        });
        return item;
    };

    /* Explicit schemes first */
    try {
        const u = new URL(candidate);
        const proto = (u.protocol || "").toLowerCase();
        if (proto === "tel:") {
            const num = decodeURIComponent(u.pathname || u.href.replace(/^tel:/i, "")).trim() || candidate;
            return makeLinkItem({
                href: `tel:${digitsOnly(num) ? (num.startsWith("+") ? `+${digitsOnly(num)}` : digitsOnly(num)) : num}`,
                label: num,
                icon: "phone",
                description: `Call ${num}`
            });
        }
        if (proto === "mailto:") {
            const addr = decodeURIComponent(u.pathname || u.username || "").trim() || candidate.replace(/^mailto:/i, "");
            return makeLinkItem({
                href: `mailto:${addr}`,
                label: addr,
                icon: "at",
                description: `Email ${addr}`
            });
        }
        if (proto === "tg:" || proto === "telegram:") {
            return makeLinkItem({
                href: u.href,
                label: "Telegram",
                icon: "telegram-logo",
                description: u.href
            });
        }
        if (proto === "content:" && /calendar/i.test(u.href)) {
            return makeLinkItem({
                href: u.href,
                label: "Calendar",
                icon: "calendar",
                description: u.href
            });
        }
    } catch {
        /* not an absolute URL */
    }

    if (looksLikePhoneNumber(candidate)) {
        const digits = digitsOnly(candidate);
        const hrefNum = candidate.trim().startsWith("+") ? `+${digits}` : digits;
        return makeLinkItem({
            href: `tel:${hrefNum}`,
            label: candidate.trim(),
            icon: "phone",
            description: `Call ${candidate.trim()}`
        });
    }

    if (looksLikeEmail(candidate)) {
        const addr = candidate.replace(/^mailto:/i, "").trim();
        return makeLinkItem({
            href: `mailto:${addr}`,
            label: addr,
            icon: "at",
            description: `Email ${addr}`
        });
    }

    if (looksLikeTelegramHandle(candidate)) {
        const tg = normalizeTelegramHref(candidate);
        if (tg) {
            return makeLinkItem({
                href: tg.href,
                label: tg.label,
                icon: "telegram-logo",
                description: `Telegram ${tg.label}`
            });
        }
    }

    const cal = parseCalendarHref(candidate);
    if (cal) {
        return makeLinkItem({
            href: cal.href,
            label: cal.label,
            icon: "calendar",
            description: `Calendar ${cal.label}`
        });
    }

    return null;
};

export const parseSpeedDialItemFromURL = (urlText: string, suggestedCell?: GridCell): SpeedDialItem | null => {
    try {
        const trimmed = urlText.trim();
        if (!trimmed) return null;

        /* Smart schemes / phone / email / telegram before generic http(s). */
        const smart = parseSpeedDialItemFromSmartText(trimmed, suggestedCell);
        if (smart) {
            try {
                const u = new URL(trimmed);
                if (/^https?:$/i.test(u.protocol) && !looksLikeTelegramHandle(trimmed)) {
                    /* Fall through — plain web URL uses `link` glyph + optional S2 iconUrl. */
                } else {
                    return smart;
                }
            } catch {
                return smart;
            }
            /* Telegram https://t.me/... already handled as smart. */
            if (looksLikeTelegramHandle(trimmed)) return smart;
        }

        let url: URL;
        try {
            url = new URL(trimmed);
        } catch {
            try {
                url = new URL(trimmed, globalThis?.location?.href);
            } catch {
                return parseSpeedDialItemFromSmartText(trimmed, suggestedCell);
            }
        }

        if (!/^https?:$/i.test(url.protocol)) {
            return parseSpeedDialItemFromSmartText(trimmed, suggestedCell);
        }

        /* Telegram web links */
        if (/^(t\.me|telegram\.me)$/i.test(url.hostname.replace(/^www\./, ""))) {
            return parseSpeedDialItemFromSmartText(trimmed, suggestedCell);
        }

        const hostname = url.hostname || "";
        const domain = hostname.replace(/^www\./, "");
        const pathname = url.pathname || "";
        const label = domain || url.host || "Link";
        let favicon = "";
        try {
            if (hostname) {
                favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=256`;
            }
        } catch {
            favicon = "";
        }

        const item = createStatefulItem({
            id: generateItemId(),
            cell: suggestedCell || [0, 0],
            icon: "link",
            label,
            action: "open-link"
        });

        const meta: SpeedDialItemMeta = {
            action: "open-link",
            href: url.href,
            description: `${label}${pathname ? ` - ${pathname}` : ""}`,
            /* WHY: paste shows Phosphor `link`; S2 stays on iconUrl for Properties → Colored. */
            iconDisplay: "glyph",
            iconScale: "compact",
            /* WHY: http(s) defaults to a new browser tab, not an inline iframe window. */
            openLinkTarget: defaultOpenLinkTargetForHref(url.href),
            ...(favicon ? { iconUrl: favicon } : {})
        };

        ensureSpeedDialMeta(item.id, meta);
        return item;
    } catch (e) {
        console.warn("Failed to parse URL for speed dial item:", e);
        return null;
    }
};

/** Pin an http(s) / content / file / app shortcut from Android Share / pin-shortcut. */
export function pinSpeedDialLinkFromIntent(
    raw: {
        url?: string;
        href?: string;
        label?: string;
        text?: string;
        source?: string;
        action?: string;
        packageName?: string;
        componentName?: string;
        intentUri?: string;
        mimeType?: string;
        shortcutId?: string;
        iconUrl?: string;
        iconDisplay?: string;
    },
    cell?: GridCell
): SpeedDialItem | null {
    const targetCell = cell ?? findNextFreeSpeedDialCell();
    const label = String(raw?.label || "").trim();
    const pkg = String(raw?.packageName || "").trim();
    const component = String(raw?.componentName || "").trim();
    const intentUri = String(raw?.intentUri || "").trim();
    const href = String(raw?.url || raw?.href || intentUri || "").trim();
    const actionHint = String(raw?.action || "").trim().toLowerCase();
    const shortcutId = String(raw?.shortcutId || "").trim();
    const mimeType = String(raw?.mimeType || "").trim() || guessMimeFromLabelOrHref(label, href);
    const rawIconUrl = String((raw as { iconUrl?: string })?.iconUrl || "").trim();
    /* WHY: data:/blob: in meta + Capacitor persist/img src took down WebView on .txt pins.
     * launch-shortcut hydrates via launcher:shortcut-icon. */
    const iconUrl = rawIconUrl && !/^(data:|blob:)/i.test(rawIconUrl) ? rawIconUrl : "";
    const iconDisplay =
        String((raw as { iconDisplay?: string })?.iconDisplay || "").trim() ||
        (rawIconUrl || iconUrl ? "colored" : "");

    /*
     * WHY: Material Files pin often has package+shortcutId and no content:// (Intent redacted).
     * Must use launch-shortcut — never treat as launch-app (that just opens Files).
     */
    if (
        actionHint === "launch-shortcut" ||
        (shortcutId && pkg && actionHint !== "launch-app")
    ) {
        if (!pkg || !shortcutId) return null;
        const existing = findSpeedDialShortcutItem(pkg, shortcutId);
        if (existing) return existing;
        const item = createStatefulItem({
            id: generateItemId(),
            cell: targetCell,
            icon: "folder",
            label: label || shortcutId,
            action: "launch-shortcut"
        });
        ensureSpeedDialMeta(item.id, {
            action: "launch-shortcut",
            packageName: pkg,
            shortcutId,
            entityType: "android-shortcut",
            /* WHY: never iconCacheKey=pkg — that duplicates the Files app icon. */
            description: label || shortcutId,
            iconDisplay: iconDisplay || "colored",
            ...(mimeType ? { mimeType } : {}),
            ...(iconUrl ? { iconUrl } : {})
        });
        addSpeedDialItem(item);
        return item;
    }

    /* App launch tile (no URI). */
    if (actionHint === "launch-app" || (pkg && !href && !shortcutId)) {
        if (!pkg) return null;
        const item = createStatefulItem({
            id: generateItemId(),
            cell: targetCell,
            icon: "device-mobile",
            label: label || pkg,
            action: "launch-app"
        });
        ensureSpeedDialMeta(item.id, {
            action: "launch-app",
            packageName: pkg,
            componentName: component || undefined,
            entityType: "android-app",
            iconCacheKey: pkg,
            description: label || pkg
        });
        addSpeedDialItem(item);
        return item;
    }

    if (!href) return null;

    /* Virtual Explorer paths. */
    if (isSpeedDialVirtualPath(href)) {
        const item = parseSpeedDialItemFromVirtualPath(href, targetCell, {
            label: label || undefined
        });
        if (!item) return null;
        addSpeedDialItem(item);
        return item;
    }

    /* http(s) / www */
    if (/^https?:\/\//i.test(href) || /^www\./i.test(href)) {
        const item = parseSpeedDialItemFromURL(href, targetCell);
        if (!item) return null;
        if (label) {
            try {
                item.label.value = label;
            } catch {
                /* ignore */
            }
            const meta = ensureSpeedDialMeta(item.id);
            if (meta) (meta as { description?: string }).description = label;
        }
        addSpeedDialItem(item);
        return item;
    }

    /* content://, file://, intent:, and other schemes → open via system VIEW. */
    /*
     * WHY: prefer the data URI (content/file/http) over `intent:` serialization.
     * `Intent.toUri` keeps the publishing app's package/component (Material Files),
     * so opening the intent URI launches Files instead of the document handler.
     */
    const dataHref = href;
    const openHref =
        /^(content:|file:|https?:)/i.test(dataHref)
            ? dataHref
            : (intentUri || dataHref);
    const item = createStatefulItem({
        id: generateItemId(),
        cell: targetCell,
        icon: /^content:|^file:/i.test(href) ? "folder" : "link",
        label: label || href.replace(/^[a-z][a-z0-9+.-]*:/i, "").split("/").filter(Boolean).pop() || "Shortcut",
        action: "open-link"
    });
    ensureSpeedDialMeta(item.id, {
        action: "open-link",
        href: openHref,
        description: label || href,
        openLinkTarget: "external-app",
        /* WHY: publisher package must not force ACTION_VIEW — only launch-app tiles need it. */
        ...(intentUri && intentUri !== openHref ? { intentUri } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(shortcutId ? { shortcutId } : {}),
        ...(pkg ? { publisherPackage: pkg } : {}),
        ...(iconDisplay ? { iconDisplay } : {}),
        ...(iconUrl ? { iconUrl } : {})
    });
    addSpeedDialItem(item);
    return item;
}

const guessMimeFromLabelOrHref = (label: string, href: string): string => {
    const name = `${label} ${href}`.toLowerCase();
    if (/\.txt(\b|$)/i.test(name) || /\.log(\b|$)/i.test(name) || /\.csv(\b|$)/i.test(name)) {
        return "text/plain";
    }
    if (/\.md(\b|$)/i.test(name) || /\.markdown(\b|$)/i.test(name)) return "text/markdown";
    if (/\.pdf(\b|$)/i.test(name)) return "application/pdf";
    if (/\.png(\b|$)/i.test(name)) return "image/png";
    if (/\.jpe?g(\b|$)/i.test(name)) return "image/jpeg";
    if (/\.gif(\b|$)/i.test(name)) return "image/gif";
    if (/\.webp(\b|$)/i.test(name)) return "image/webp";
    if (/\.mp4(\b|$)/i.test(name)) return "video/mp4";
    if (/\.mp3(\b|$)/i.test(name)) return "audio/mpeg";
    if (/\.html?(\b|$)/i.test(name)) return "text/html";
    if (/\.json(\b|$)/i.test(name)) return "application/json";
    if (/\.zip(\b|$)/i.test(name)) return "application/zip";
    return "";
};

const CLIPBOARD_READ_HOOK = "__CWSP_READ_CLIPBOARD_TEXT__";
const CLIPBOARD_WRITE_HOOK = "__CWSP_WRITE_CLIPBOARD_TEXT__";
const CAP_CLIPBOARD_PKGS = ["@capacitor/clipboard", "@supernotes/capacitor-clipboard"] as const;
const CLIP_TEXT_MAX = 80_000;

type SpeedDialClipEnvelope = {
    kind: typeof SPEED_DIAL_CLIP_KIND;
    v: 1;
    snapshot: ReturnType<typeof snapshotSpeedDialItem>;
};

let lastCopiedSpeedDial: SpeedDialClipEnvelope | null = null;

const isCapacitorNativeHost = (): boolean => {
    try {
        const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        return typeof c?.isNativePlatform === "function" && Boolean(c.isNativePlatform());
    } catch {
        return false;
    }
};

/** Cap WebView: navigator.clipboard is unreliable; prefer host hook / @capacitor/clipboard. */
const readClipboardTextNative = async (): Promise<string> => {
    const hook = (globalThis as Record<string, unknown>)[CLIPBOARD_READ_HOOK];
    if (typeof hook === "function") {
        try {
            const value = await (hook as () => Promise<unknown>)();
            if (typeof value === "string" && value.trim()) return value;
        } catch {
            /* fall through */
        }
    }
    if (!isCapacitorNativeHost()) return "";
    for (const pkg of CAP_CLIPBOARD_PKGS) {
        try {
            const mod = (await import(/* @vite-ignore */ pkg)) as {
                Clipboard?: { read: () => Promise<{ value?: string }> };
            };
            if (!mod?.Clipboard?.read) continue;
            const res = await mod.Clipboard.read();
            const value = res?.value;
            if (typeof value === "string" && value.trim()) return value;
        } catch {
            /* package missing in this shell */
        }
    }
    return "";
};

const writeClipboardTextNative = async (text: string): Promise<boolean> => {
    const hook = (globalThis as Record<string, unknown>)[CLIPBOARD_WRITE_HOOK];
    if (typeof hook === "function") {
        try {
            await (hook as (value: string) => Promise<unknown>)(text);
            return true;
        } catch {
            /* fall through */
        }
    }
    if (!isCapacitorNativeHost()) return false;
    for (const pkg of CAP_CLIPBOARD_PKGS) {
        try {
            const mod = (await import(/* @vite-ignore */ pkg)) as {
                Clipboard?: { write: (opts: { string: string }) => Promise<void> };
            };
            if (!mod?.Clipboard?.write) continue;
            await mod.Clipboard.write({ string: text });
            return true;
        } catch {
            /* package missing in this shell */
        }
    }
    return false;
};

const writeClipboardTextBrowser = async (text: string): Promise<void> => {
    if (await writeClipboardTextNative(text)) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    if (typeof document === "undefined") throw new Error("clipboard write unavailable");
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
};

export const copySpeedDialItemToClipboard = async (item: SpeedDialItem): Promise<void> => {
    const snapshot = snapshotSpeedDialItem(item);
    if (!snapshot) throw new Error("empty");
    const envelope: SpeedDialClipEnvelope = { kind: SPEED_DIAL_CLIP_KIND, v: 1, snapshot };
    lastCopiedSpeedDial = envelope;
    let text = JSON.stringify(envelope);
    if (text.length > CLIP_TEXT_MAX) {
        const slim = fallbackClone(envelope);
        const meta = slim.snapshot?.desc?.meta as { iconUrl?: string } | undefined;
        if (meta && typeof meta.iconUrl === "string" && /^(data:|blob:)/i.test(meta.iconUrl)) {
            delete meta.iconUrl;
        }
        text = JSON.stringify(slim);
    }
    try {
        await writeClipboardTextBrowser(text);
    } catch (e) {
        /* WHY: Cap/CRX OS clipboard can fail; in-session paste still uses lastCopiedSpeedDial. */
        console.warn("OS clipboard write failed; in-session paste still works", e);
    }
};

export const hasCopiedSpeedDialItem = (): boolean => lastCopiedSpeedDial != null;

const materializeCopiedSpeedDial = (suggestedCell?: GridCell): SpeedDialItem | null => {
    if (!lastCopiedSpeedDial) return null;
    return parseSpeedDialItemFromJSON(JSON.stringify(lastCopiedSpeedDial), suggestedCell);
};

const readClipboardTextBrowser = async (): Promise<{ ok: boolean; data?: string; error?: string }> => {
    try {
        const native = await readClipboardTextNative();
        if (native.trim()) return { ok: true, data: native };

        if (!navigator.clipboard?.readText) {
            return { ok: false, error: "clipboard.readText unavailable" };
        }
        const data = await navigator.clipboard.readText();
        return { ok: true, data: String(data ?? "") };
    } catch (e: any) {
        return { ok: false, error: String(e?.message || e) };
    }
};

export const createSpeedDialItemFromClipboard = async (suggestedCell?: GridCell): Promise<SpeedDialItem | null> => {
    const clipboardResult = await readClipboardTextBrowser();
    const clipboardText = clipboardResult.ok ? String(clipboardResult.data ?? "") : "";

    try {
        /* WHY: pretty JSON and href fields must win over URL scraping / first-line `{`. */
        if (looksLikeSpeedDialShortcutJson(clipboardText)) {
            const parsed = parseSpeedDialItemFromJSON(clipboardText, suggestedCell);
            if (parsed) return parsed;
        }

        if (!clipboardResult.ok) {
            const fromMemory = materializeCopiedSpeedDial(suggestedCell);
            if (fromMemory) return fromMemory;
            console.warn("Failed to read clipboard text:", clipboardResult.error);
            throw new Error(clipboardResult.error || "clipboard read failed");
        }

        if (!clipboardText.trim()) {
            const fromMemory = materializeCopiedSpeedDial(suggestedCell);
            if (fromMemory) return fromMemory;
            throw new Error("clipboard empty");
        }

        const firstLine =
            clipboardText
                .split(/\r?\n/)
                .map((l) => l.trim())
                .find((l) => l && !l.startsWith("#")) || clipboardText.trim();
        let trimmed = firstLine;
        if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
            trimmed = trimmed.slice(1, -1).trim();
        }

        /* tel / mailto / telegram / calendar before http(s) hostname tiles. */
        const smart = parseSpeedDialItemFromSmartText(clipboardText, suggestedCell);
        if (smart) return smart;

        // WHY: mobile browsers often put "Title\nhttps://…" or HTML <a href> — not a bare URL line.
        const absolute = extractHttpUrlFromClipboardText(clipboardText);
        if (absolute) {
            return parseSpeedDialItemFromURL(absolute, suggestedCell);
        }

        if (isSpeedDialVirtualPath(trimmed)) {
            return parseSpeedDialItemFromVirtualPath(trimmed, suggestedCell);
        }

        if (looksLikeJsonObject(clipboardText.trim()) || looksLikeJsonObject(trimmed)) {
            const parsed = parseSpeedDialItemFromJSON(
                looksLikeJsonObject(clipboardText.trim()) ? clipboardText : trimmed,
                suggestedCell
            );
            if (parsed) return parsed;
        }

        return materializeCopiedSpeedDial(suggestedCell);
    } catch (e) {
        console.warn("Failed to create speed dial item from clipboard:", e);
        if (/empty|failed|unavailable|denied|permission/i.test(String((e as Error)?.message || e || ""))) {
            throw e;
        }
        return materializeCopiedSpeedDial(suggestedCell);
    }
};

/** Mobile Chrome/Samsung often paste title+URL, HTML, or URI-list — find first usable http(s). */
const extractHttpUrlFromClipboardText = (raw: string): string | null => {
    const text = String(raw || "");
    if (!text.trim()) return null;

    const hrefMatch = text.match(/href\s*=\s*["'](https?:\/\/[^"']+)["']/i);
    if (hrefMatch?.[1]) {
        const n = normalizeExternalWebHref(hrefMatch[1]);
        if (n) return n;
    }

    for (const line of text.split(/\r?\n/)) {
        let trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
            trimmed = trimmed.slice(1, -1).trim();
        }
        const asUrl = normalizeExternalWebHref(trimmed);
        if (asUrl) return asUrl;
        try {
            const parsed = new URL(trimmed);
            if (/^https?:$/i.test(parsed.protocol)) return parsed.href;
        } catch {
            /* continue */
        }
    }

    const embedded = text.match(/https?:\/\/[^\s<>"')\]]+/i);
    if (embedded?.[0]) {
        const cleaned = embedded[0].replace(/[.,;:]+$/u, "");
        const n = normalizeExternalWebHref(cleaned);
        if (n) return n;
    }

    return null;
};
