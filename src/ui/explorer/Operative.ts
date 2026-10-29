/*
 * Filename: Operative.ts
 * FullPath: modules/projects/fl.ui/src/ui/explorer/Operative.ts
 * FIND:bookmarks
 * Change date and time: 11.10.00_30.08.2026
 * Reason for changes: Context Share + clipboard copies; context-action still bubbles.
 */

import { observe, iterated, ref, affected } from "@fest-lib/object";
import { isIdbScopePath, isUserScopePath } from "@fest-lib/core";

// PathRouter + FsBackend registry (Task 1). The router owns the virtual root
// listing; backends registered at init keep the existing `/user/` + `/assets/`
// behavior. `/bookmarks/` stays absent until a later task registers it.
import {
    registerFsBackend,
    resolveFsBackend,
    listVirtualRootEntriesFromRouter,
    normalizeVirtualPath,
    type FsBackend
} from "./path-router";
import { buildExplorerDragPayload } from "./fs-backend";
import {
    copyExplorerBase64Url,
    copyExplorerBlobUrl,
    copyExplorerImage,
    copyExplorerInlineText,
    copyExplorerRealPath,
    shareExplorerItem,
    shareExplorerToTarget
} from "./share-copy";
import { openBookmarkFieldsDialog } from "fl-ui/navigation/app-menu/app-actions";

// OPFS helpers
import {
    openDirectory,
    getMimeTypeByFilename,
    downloadFile,
    writeFile,
    remove,
    uploadFile,
    getFileHandle,
    getDirectoryHandle,
    copyFromOneHandlerToAnother,
    attachFile,
    provide,
    readFile,
    uploadDirectory,
    handleIncomingEntries,
    resolveRootHandle,
    asProvidedFile
} from "@fest-lib/lure";

//
export type EntryKind = "file" | "directory";
export interface FileEntryItem {
    name: string;
    kind: EntryKind;
    type?: string;
    size?: number;
    lastModified?: number;
    handle?: any;
    file?: File;
    /**
     * Canonical absolute path for backends that carry stable ids (e.g. Chrome
     * bookmarks `/bookmarks/<id>/`). When set, navigation/open must use this
     * path instead of the name-derived `path + name` form.
     */
    path?: string;
    /**
     * External URL for URL-like entries (e.g. Chrome bookmark URL nodes).
     * When set on a `file`-kind entry, opening should launch the URL rather
     * than require a `file` blob.
     */
    href?: string;
    /**
     * Stable backend id (e.g. Chrome bookmark id) for mutation routing.
     */
    bookmarkId?: string;
}

//
const handleCache = new WeakMap<any, any>();
const waitForClipboardFrame = (): Promise<void> =>
    new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
            return;
        }
        if (typeof MessageChannel !== "undefined") {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(undefined);
            return;
        }
        if (typeof scheduler?.yield == "function") {
            scheduler?.yield?.()?.then?.(resolve);
            return;
        }
        if (typeof queueMicrotask === "function") {
            queueMicrotask(() => resolve());
            return;
        }
        if (typeof setTimeout === "function") {
            setTimeout(() => resolve(), 0);
            return;
        }
        resolve();
    });

/**
 * Accept File objects from the page, an iframe, or a WebView realm.
 * `instanceof File` is not reliable across those realms.
 */
const isFileLike = (value: any): value is File =>
    Boolean(
        value &&
        typeof value === "object" &&
        typeof value.name === "string" &&
        typeof value.size === "number" &&
        (typeof value.arrayBuffer === "function" || typeof value.stream === "function")
    );

const ASSETS_ROOT = "/assets/";
const ASSET_SEED_PATHS = [
    "/assets/crossword.css",
    "/assets/icons/",
    "/assets/imgs/",
    "/assets/wallpapers/"
];
const ASSET_ICON_STYLES = ["thin", "light", "regular", "bold", "fill", "duotone"];
const ASSET_ICON_FALLBACK_NAMES = [
    "copy",
    "clipboard",
    "trash",
    "folder",
    "folder-open",
    "download",
    "upload",
    "arrow-up",
    "arrow-clockwise",
    "code",
    "eye",
    "gear",
    "printer",
    "file-doc",
    "file-text",
    "lightning",
    "pencil",
    "clock-counter-clockwise",
];

const normalizeDirectoryPath = (input?: string): string =>
    normalizeVirtualPath(input ?? "/", true);

const isAssetsPath = (path?: string): boolean => normalizeDirectoryPath(path).startsWith(ASSETS_ROOT);
const isVirtualRootPath = (path?: string): boolean => normalizeDirectoryPath(path) === "/";
const isReadonlyPath = (path?: string): boolean => isAssetsPath(path) || isVirtualRootPath(path);
const isIconsPath = (path?: string): boolean => normalizeDirectoryPath(path).startsWith("/assets/icons/");
const isUserPath = (path?: string): boolean => isUserScopePath(normalizeDirectoryPath(path));
const isIdbPath = (path?: string): boolean => isIdbScopePath(normalizeDirectoryPath(path));
const isWorkspacePath = (path?: string): boolean => isUserPath(path) || isIdbPath(path);

const BOOKMARKS_ROOT = "/bookmarks/";

export const isBookmarksPath = (path?: string): boolean =>
    normalizeDirectoryPath(path).startsWith(BOOKMARKS_ROOT);

/**
 * External ingress may target the virtual root, which is redirected to `/user/`.
 * Keep this predicate shared with the context-menu layer so Paste visibility
 * cannot drift from the actual drop/paste acceptance rules.
 */
export const canReceiveIncomingPath = (path?: string): boolean => {
    const normalized = normalizeDirectoryPath(path);
    return isVirtualRootPath(normalized) || isWorkspacePath(normalized) || isBookmarksPath(normalized);
};

const buildVirtualAssetPaths = (path: string): string[] => {
    const target = normalizeDirectoryPath(path);
    const paths = new Set<string>();
    if (!isIconsPath(target)) return [];

    // Always expose icon roots/styles even when nothing is cached yet.
    paths.add("/assets/icons/");
    paths.add("/assets/icons/phosphor/");
    paths.add("/assets/icons/duotone/");
    for (const style of ASSET_ICON_STYLES) {
        paths.add(`/assets/icons/phosphor/${style}/`);
        paths.add(`/assets/icons/${style}/`);
    }

    const addIconFiles = (base: string) => {
        for (const iconName of ASSET_ICON_FALLBACK_NAMES) {
            paths.add(`${base}${iconName}.svg`);
        }
    };

    if (target === "/assets/icons/" || target === "/assets/icons/duotone/") {
        addIconFiles("/assets/icons/duotone/");
    }

    if (target.startsWith("/assets/icons/phosphor/")) {
        const parts = target.split("/").filter(Boolean);
        if (parts.length >= 4) {
            const style = parts[3];
            if (ASSET_ICON_STYLES.includes(style)) {
                addIconFiles(`/assets/icons/phosphor/${style}/`);
            }
        }
    }

    if (target.startsWith("/assets/icons/")) {
        const parts = target.split("/").filter(Boolean);
        if (parts.length >= 3) {
            const style = parts[2];
            if (ASSET_ICON_STYLES.includes(style)) {
                addIconFiles(`/assets/icons/${style}/`);
            }
        }
    }

    return Array.from(paths);
};

//
export class FileOperative {
    // refs/state
    #entries = ref<FileEntryItem[]>([]);
    #loading = ref(false);
    #error = ref("");
    #fsRoot: any = null;
    #dirProxy: any = null;
    #loadLock = false;
    /** Coalesce overlapping loadPath calls onto the latest requested path. */
    #pendingLoadPath: any = null;
    #loadWaiters: Array<(value: this) => void> = [];
    #clipboard: { items: string[]; cut?: boolean } | null = null;
    #subscribed: any = null;
    #bookmarksInvalidationOff: (() => void) | null = null;
    #loaderDebounceTimer: any = null;
    #readonly = ref(false);

    //
    public host: HTMLElement | null = null;
    public pathRef = ref("/");

    //
    get path() { return this.pathRef?.value || "/"; }
    set path(value: string) { if (this.pathRef) this.pathRef.value = value || "/"; }
    get entries() { return this.#entries; }
    get readonly() { return this.#readonly?.value === true; }

    //
    constructor() {
        this.#entries = ref<FileEntryItem[]>([]);
        this.pathRef ??= ref("/");

        // Task 1: bind default `/user/` + `/assets/` FsBackends to this
        // operative so the PathRouter root listing shows user + assets only.
        ensureDefaultBackends(this);

        //
        affected(this.pathRef, (path) => {
            this.#readonly.value = isReadonlyPath(path || "/");
            this.loadPath(path || "/");
        });
        void resolveRootHandle("/user/").then((h) => {
            this.#fsRoot = h;
            void this.refreshList(this.path || "/");
        });
    }

    private async listAssetEntries(path: string): Promise<FileEntryItem[]> {
        const target = normalizeDirectoryPath(path);
        const knownPaths = new Set<string>(ASSET_SEED_PATHS);
        for (const virtualPath of buildVirtualAssetPaths(target)) {
            knownPaths.add(virtualPath);
        }

        try {
            const cacheNames = await caches.keys();
            for (const cacheName of cacheNames) {
                try {
                    const cache = await caches.open(cacheName);
                    const requests = await cache.keys();
                    for (const req of requests) {
                        const pathname = new URL(req.url).pathname;
                        if (pathname.startsWith(ASSETS_ROOT)) {
                            knownPaths.add(pathname);
                        }
                    }
                } catch {
                    // Ignore per-cache listing failures.
                }
            }
        } catch {
            // Cache API may be unavailable in some contexts.
        }

        const dirs = new Set<string>();
        const files: string[] = [];
        for (const full of knownPaths) {
            const normalized = full.startsWith("/") ? full : `/${full}`;
            if (!normalized.startsWith(target)) continue;
            const remainder = normalized.slice(target.length);
            if (!remainder) continue;
            const [firstSegment, ...rest] = remainder.split("/").filter(Boolean);
            if (!firstSegment) continue;
            if (rest.length > 0 || normalized.endsWith("/")) {
                dirs.add(firstSegment);
            } else {
                files.push(firstSegment);
            }
        }

        const directoryEntries = Array.from(dirs)
            .sort((a, b) => a.localeCompare(b))
            .map((name) => observe({ name, kind: "directory" as const }));

        const uniqueFiles = Array.from(new Set(files)).filter((name) => !dirs.has(name));
        const fileEntries = uniqueFiles
            .sort((a, b) => a.localeCompare(b))
            .map((name) => {
                const item: any = observe({ name, kind: "file" as const });
                item.type = getMimeTypeByFilename?.(name);
                return item;
            });

        return [...directoryEntries, ...fileEntries];
    }

    private listVirtualRootEntries(): FileEntryItem[] {
        // INVARIANT: virtual root rows come exclusively from the PathRouter
        // registry so backends registered later (e.g. `/bookmarks/` in CRX)
        // appear without touching this method again.
        return listVirtualRootEntriesFromRouter().map((e) =>
            observe({
                name: e.name,
                kind: e.kind,
                path: e.path || `/${e.name}/`
            })
        );
    }

    private detachDirectoryObservers() {
        if (this.#loaderDebounceTimer) {
            clearTimeout(this.#loaderDebounceTimer);
            this.#loaderDebounceTimer = null;
        }
        if (typeof this.#subscribed === "function") {
            this.#subscribed();
            this.#subscribed = null;
        }
        if (this.#bookmarksInvalidationOff) {
            this.#bookmarksInvalidationOff();
            this.#bookmarksInvalidationOff = null;
        }
        if (this.#dirProxy?.dispose) {
            this.#dirProxy.dispose();
        }
        this.#dirProxy = null;
    }

    private async collectDirectoryEntries(): Promise<FileEntryItem[]> {
        const source = await this.#dirProxy?.entries?.();
        let pairs: any[] = [];
        if (Array.isArray(source)) {
            pairs = source;
        } else if (source && typeof (source as any)[Symbol.iterator] === "function") {
            pairs = Array.from(source as Iterable<any>);
        } else if (source && typeof (source as any)[Symbol.asyncIterator] === "function") {
            // Fallback for async iterators in non-proxy directory implementations.
            for await (const pair of source as AsyncIterable<any>) {
                pairs.push(pair);
            }
        }
        const entries = (await Promise.all(
            (pairs || []).map(async ($pair: any) => {
                try {
                    const [name, handle] = $pair as any;
                    if (!name || !handle) return null;
                    const build = async () => {
                        const kind: EntryKind = handle?.kind || (name?.endsWith?.("/") ? "directory" : "file");
                        const item: any = observe({ name, kind, handle });
                        if (kind === "file") {
                            item.type = getMimeTypeByFilename?.(name);
                            try {
                                const f = await handle?.getFile?.();
                                item.file = f;
                                item.size = f?.size;
                                item.lastModified = f?.lastModified;
                                item.type = f?.type || item.type;
                            } catch {}
                        }
                        return item;
                    };
                    // Prefer WeakMap cache when the runtime polyfill is present; otherwise build directly.
                    if (typeof handleCache?.getOrInsertComputed === "function") {
                        return await handleCache.getOrInsertComputed(handle, build);
                    }
                    return await build();
                } catch (error) {
                    console.warn(error);
                    return null;
                }
            })
        ))?.filter?.(($item: any) => $item != null);
        return entries || [];
    }

    private async getDirectoryHandleByPath(path: string, create = false): Promise<any> {
        const root = this.#fsRoot || await this.getStorageRootHandle("/user/");
        if (!root) return null;
        const clean = normalizeDirectoryPath(path);
        const parts = clean.split("/").filter(Boolean);
        let current = root;
        for (const part of parts) {
            current = await current.getDirectoryHandle(part, { create });
        }
        return current;
    }

    private normalizeUserRelativePath(path: string): string {
        const normalized = normalizeDirectoryPath(path);
        if (normalized === "/user/" || normalized === "/idb/") return "/";
        if (normalized.startsWith("/user/")) return normalized.slice("/user".length);
        if (normalized.startsWith("/idb/")) return normalized.slice("/idb".length);
        return normalized;
    }

    private async getStorageRootHandle(path: string): Promise<any> {
        const virtual = isIdbPath(path) ? "/idb/" : "/user/";
        return resolveRootHandle(virtual, path);
    }

    private async getOpfsRootHandle(): Promise<any> {
        this.#fsRoot = await this.getStorageRootHandle("/user/");
        return this.#fsRoot;
    }

    private async getUserDirHandle(path: string, create = false): Promise<any> {
        const root = await this.getStorageRootHandle(path);
        if (!root) return null;
        const rel = this.normalizeUserRelativePath(path);
        const parts = rel.split("/").filter(Boolean);
        let current = root;
        for (const part of parts) {
            current = await current.getDirectoryHandle(part, { create });
        }
        return current;
    }

    private async writeUserFile(file: File, destPath: string = this.path): Promise<void> {
        // INVARIANT: `/bookmarks/**` is never a byte store. This guard is the
        // last line of defense: even if a future caller bypasses `onPaste` /
        // `requestUpload` routing and reaches here with a bookmarks path, we
        // reject loudly instead of silently writing into OPFS.
        if (isBookmarksPath(destPath)) {
            this.dispatchEvent(new CustomEvent("bookmarks-reject", {
                detail: {
                    reason: "bookmarks backend does not store file bytes",
                    path: destPath,
                    count: 1
                },
                bubbles: true,
                composed: true
            }));
            return;
        }
        const dir = await this.getUserDirHandle(destPath, true);
        if (!dir) return;
        const safeName = (file?.name || `file-${Date.now()}`).trim().replace(/\s+/g, "-");
        const fileHandle = await dir.getFileHandle(safeName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
    }

    /**
     * Select files without assuming the File System Access constructors exist.
     * Some shells expose a `showOpenFilePicker` polyfill that throws while
     * evaluating `FileSystemHandle`; a normal file input is the safe fallback.
     */
    private async pickFilesForUpload(): Promise<File[]> {
        const picker = (globalThis as any)?.showOpenFilePicker;
        const hasNativePicker =
            typeof picker === "function"
            && typeof (globalThis as any)?.FileSystemHandle === "function";

        if (hasNativePicker) {
            const handles = await picker({ multiple: true }).catch(() => []);
            const files: File[] = [];
            for (const handle of handles || []) {
                const file = await handle?.getFile?.().catch?.(() => null);
                if (isFileLike(file)) files.push(file);
            }
            return files;
        }

        if (typeof document === "undefined") return [];
        return new Promise<File[]>((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.style.cssText = "position:fixed;inline-size:1px;block-size:1px;opacity:0;pointer-events:none;";

            let settled = false;
            const finish = (files: File[] = []) => {
                if (settled) return;
                settled = true;
                input.remove();
                resolve(files);
            };

            input.addEventListener("change", () => {
                finish(Array.from(input.files || []).filter(isFileLike));
            }, { once: true });
            input.addEventListener("cancel", () => finish(), { once: true });
            (document.body || document.documentElement).appendChild(input);
            input.click();
        });
    }

    /**
     * Resolve the only writable destinations for external file ingress.
     * The virtual root is a navigation scope, so root drops/pastes are stored
     * in `/user/` and then surfaced by navigating there. `/bookmarks/` is a
     * live Chrome Bookmarks mount (CRX only) and accepts URI drops.
     */
    private incomingDestinationPath(): string | null {
        const currentPath = normalizeDirectoryPath(this.path);
        if (canReceiveIncomingPath(currentPath) && isWorkspacePath(currentPath)) return currentPath;
        if (isBookmarksPath(currentPath)) return currentPath;
        if (isVirtualRootPath(currentPath)) return "/user/";
        return null;
    }

    /**
     * Returns the registered bookmarks FsBackend for `path`, or `null` when
     * the path is not under `/bookmarks/` or the backend was never registered
     * (non-CRX hosts). WHY: mutation handlers branch on this so OPFS write
     * paths are never reached for `/bookmarks/**`.
     */
    private bookmarksBackendFor(path: string): FsBackend | null {
        const backend = resolveFsBackend(path);
        return backend && backend.root === BOOKMARKS_ROOT ? backend : null;
    }

    /**
     * Ingest a drop/paste into `/bookmarks/`. URI entries become Chrome
     * bookmarks via `createUrl`; raw File bytes are rejected with a
     * user-visible event since `/bookmarks/` is not a byte store.
     */
    private async ingestIntoBookmarks(
        data: any,
        destination: string
    ): Promise<void> {
        const backend = this.bookmarksBackendFor(destination);
        if (!backend?.createUrl) return;

        const files = await this.extractFilesFromData(data);
        if (files.length > 0) {
            // WHY: `/bookmarks/` only stores URL references; file bytes are
            // rejected with a user-facing event so the shell can toast it.
            this.dispatchEvent(new CustomEvent("bookmarks-reject", {
                detail: {
                    reason: "bookmarks backend does not store file bytes",
                    path: destination,
                    count: files.length
                },
                bubbles: true,
                composed: true
            }));
            return;
        }

        const getData = (type: string) => data?.getData?.(type) ?? "";
        const uriList = String(getData("text/uri-list") || "");
        const plainText = String(getData("text/plain") || "");
        const lines = (uriList || plainText)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"));

        for (const line of lines) {
            // Skip values that are clearly not URLs (e.g. internal `/user/...`
            // paths pasted from the file grid). Only http(s) URLs become bookmarks.
            if (!/^https?:\/\//i.test(line)) continue;
            const title = line;
            try {
                await backend.createUrl(destination, title, line);
            } catch (e) {
                console.warn(e);
            }
        }
    }

    /**
     * Capture directory-handle promises during the original drop event.
     *
     * WHY: Chromium exposes `getAsFileSystemHandle()` only during the same
     * event turn. Calling it after `extractFilesFromData()` has awaited, or
     * calling it from an insecure HTTP page, can terminate the renderer with
     * RESULT_CODE_KILLED_BAD_MESSAGE instead of throwing a normal exception.
     */
    private captureDirectoryHandlePromises(data: any): Promise<any>[] {
        if ((globalThis as any).isSecureContext !== true) return [];

        const promises: Promise<any>[] = [];
        for (const item of Array.from(data?.items ?? []) as any[]) {
            if (item?.kind !== "file" || typeof item?.getAsFileSystemHandle !== "function") continue;

            // Avoid the experimental API for ordinary files. The File object
            // path is handled by `extractFilesFromData()` and is more stable.
            let legacyEntry: any = null;
            try {
                legacyEntry = item.webkitGetAsEntry?.() ?? null;
            } catch { }
            if (legacyEntry && !legacyEntry.isDirectory) continue;

            if (!legacyEntry) {
                try {
                    if (isFileLike(item.getAsFile?.())) continue;
                } catch { }
            }

            // INVARIANT: invoke this before any async boundary in onDrop.
            try {
                promises.push(Promise.resolve(item.getAsFileSystemHandle()));
            } catch { }
        }
        return promises;
    }

    private async ingestIncomingData(
        data: any,
        destination: string,
        directoryHandlePromises: Promise<any>[] = []
    ): Promise<void> {
        const files = await this.extractFilesFromData(data);
        const directoryResults = await Promise.allSettled(directoryHandlePromises);
        const directories = directoryResults.flatMap((result) =>
            result.status === "fulfilled" && result.value?.kind === "directory"
                ? [result.value]
                : []
        );
        if (files.length > 0) {
            for (const file of files) {
                await this.writeUserFile(file, destination);
            }
        }

        for (const directory of directories) {
            const name = String(directory?.name || `folder-${Date.now()}`).trim().replace(/\s+/g, "-");
            const target = await getDirectoryHandle(this.#fsRoot, `${destination}${name}`, { create: true });
            if (target) await copyFromOneHandlerToAnother(directory, target, { create: true });
        }

        if (files.length > 0 || directories.length > 0) return;

        // Do not pass live DataTransfer items to the legacy helper: it calls
        // getAsFileSystemHandle() after an await and can recreate the Chromium
        // crash. URI text is safe to pass through a data-only facade.
        const transferItems = Array.from(data?.items ?? []);
        const getData = (type: string) => data?.getData?.(type) || "";
        const uriList = getData("text/uri-list");
        const plainText = getData("text/plain");
        if (transferItems.length > 0) {
            if (!uriList && !plainText) return;
            await handleIncomingEntries({ getData }, destination, this.#fsRoot);
            return;
        }

        await handleIncomingEntries(data, destination, this.#fsRoot);
    }

    private async finishIncoming(destination: string): Promise<void> {
        if (isVirtualRootPath(this.path)) this.path = destination;
        await this.refreshList(this.path);
    }

    /**
     * Imperative save API for shells/channels — writes into the OPFS-backed workspace folder.
     * Defaults to {@link FileOperative.path}; optional `destPath` overrides the parent directory.
     */
    async ingestFileIntoWorkspace(file: File, destPath?: string): Promise<void> {
        await this.writeUserFile(file, destPath ?? this.path);
    }

    private async removeUserEntry(absPath: string, recursive = true): Promise<boolean> {
        const root = await this.getStorageRootHandle(absPath);
        if (!root) return false;
        const rel = this.normalizeUserRelativePath(absPath).replace(/\/+$/g, "");
        const parts = rel.split("/").filter(Boolean);
        if (!parts.length) return false;
        const name = parts.pop() as string;
        let dir = root;
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: false });
        }
        await dir.removeEntry(name, { recursive });
        return true;
    }

    private async renameUserFile(absPath: string, newName: string): Promise<void> {
        const root = await this.getStorageRootHandle(absPath);
        if (!root) return;
        const rel = this.normalizeUserRelativePath(absPath).replace(/\/+$/g, "");
        const parts = rel.split("/").filter(Boolean);
        if (!parts.length) return;
        const oldName = parts.pop() as string;
        let dir = root;
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: false });
        }
        const oldHandle = await dir.getFileHandle(oldName, { create: false });
        const oldFile = await oldHandle.getFile();
        const safeName = (newName || "").trim().replace(/\s+/g, "-");
        if (!safeName || safeName === oldName) return;
        const newHandle = await dir.getFileHandle(safeName, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(oldFile);
        await writable.close();
        await dir.removeEntry(oldName);
    }

    private async extractFilesFromData(data: any): Promise<File[]> {
        const files: File[] = [];
        const now = Date.now();
        const extByMime = (mime: string) => {
            const m = (mime || "").toLowerCase();
            if (m.includes("css")) return "css";
            if (m.includes("json")) return "json";
            if (m.includes("markdown")) return "md";
            if (m.includes("svg")) return "svg";
            if (m.includes("png")) return "png";
            if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
            if (m.includes("gif")) return "gif";
            if (m.includes("webp")) return "webp";
            if (m.includes("plain")) return "txt";
            return "bin";
        };

        const nativeFiles = Array.from(data?.files ?? []).filter(isFileLike);
        files.push(...nativeFiles);

        const items = Array.from(data?.items ?? []);
        for (const item of items as any[]) {
            if (item?.kind === "file" && typeof item?.getAsFile === "function") {
                const f = item.getAsFile();
                if (isFileLike(f)) files.push(f);
                continue;
            }
            const types = Array.from(item?.types ?? []);
            if (typeof item?.getType === "function" && types.length > 0) {
                const type = String(types[0] || "");
                try {
                    const blob = await item.getType(type);
                    if (!blob) continue;
                    const ext = extByMime(blob.type || type);
                    files.push(new File([blob], `clipboard-${now}-${files.length}.${ext}`, {
                        type: blob.type || type,
                        lastModified: now
                    }));
                } catch {}
            }
        }
        return files;
    }

    private async readEntriesFromDirectory(dir: any): Promise<FileEntryItem[]> {
        if (!dir) return [];
        const entries: FileEntryItem[] = [];
        for await (const [name, handle] of dir.entries()) {
            const kind: EntryKind = handle?.kind || (name?.endsWith?.("/") ? "directory" : "file");
            const item: any = observe({ name, kind, handle });
            if (kind === "file") {
                item.type = getMimeTypeByFilename?.(name);
                try {
                    const f = await handle?.getFile?.();
                    item.file = f;
                    item.size = f?.size;
                    item.lastModified = f?.lastModified;
                    item.type = f?.type || item.type;
                } catch {}
            }
            entries.push(item);
        }
        return entries;
    }

    private async listUserEntriesDirect(path: string, createIfMissing = false): Promise<FileEntryItem[]> {
        const normalized = normalizeDirectoryPath(path);
        const strippedPath = normalized.replace(/^\/user\/?/, "/");
        const legacyPath = normalized; // Legacy layout may physically contain "/user/*" in OPFS.

        const dirs: any[] = [];
        const tryPush = (dir: any) => {
            if (!dir) return;
            if (!dirs.includes(dir)) dirs.push(dir);
        };

        tryPush(await this.getDirectoryHandleByPath(strippedPath, false).catch(() => null));
        if (legacyPath !== strippedPath) {
            tryPush(await this.getDirectoryHandleByPath(legacyPath, false).catch(() => null));
        }

        if (!dirs.length && createIfMissing) {
            tryPush(await this.getDirectoryHandleByPath(strippedPath, true).catch(() => null));
        }

        const merged = new Map<string, FileEntryItem>();
        for (const dir of dirs) {
            const chunk = await this.readEntriesFromDirectory(dir);
            for (const entry of chunk) {
                if (!entry?.name) continue;
                const key = `${entry.kind}:${entry.name}`;
                if (!merged.has(key)) merged.set(key, entry);
            }
        }
        return Array.from(merged.values());
    }

    private applyEntries(entries: FileEntryItem[]) {
        const unique = new Map<string, FileEntryItem>();
        for (const entry of entries || []) {
            if (!entry || !entry.name) continue;
            const key = `${entry.kind}:${entry.name}`;
            if (!unique.has(key)) unique.set(key, entry);
        }
        (this.#entries as any).value = Array.from(unique.values());
        this.dispatchEvent(new CustomEvent("entries-updated", {
            detail: { path: this.path, count: unique.size },
            bubbles: true,
            composed: true
        }));
    }

    //
    async itemAction(item: FileEntryItem, how: "click" | "dblclick" = "click") {
        const self: any = this;
        const itemPath: string = (item as any)?.path || "";
        // WHY: bookmarks entries carry a stable id-based absolute `path`
        // (`/bookmarks/<id>/` or `/bookmarks/<id>`). The name-derived form
        // `(self.path || "/") + item.name` is wrong for them: titles can
        // contain slashes/spaces and rename would break navigation. Prefer
        // `item.path` when present; fall back to name-append for OPFS/assets.
        const detailPath = itemPath || ((self.path || "/") + (item?.name || ""));
        const detail = { path: detailPath, item, originalEvent: null, how };
        const event = new CustomEvent("open-item", { detail, bubbles: true, composed: true, cancelable: true });
        this.host?.dispatchEvent(event);
        if (event.defaultPrevented) return;

        //
        if (item?.kind === "directory") {
            // INVARIANT: directories keep a trailing `/` in `item.path`
            // (chrome-bookmarks-backend `toEntry` enforces this). Fall back to
            // the legacy name-append only when the backend did not supply a
            // canonical path (OPFS / assets).
            const next = itemPath
                ? normalizeDirectoryPath(itemPath)
                : (self.path?.endsWith?.("/") ? self.path : self.path + "/") + (item?.name || "") + "/";
            self.path = next;
        } else {
            // URL bookmark entries: open the href directly instead of requiring
            // a `file` blob. `/bookmarks/**` file rows from the bookmarks
            // backend always carry `href`; OPFS/assets rows fall through to
            // the existing file/viewer path.
            const href: string | undefined = (item as any)?.href;
            if (href && /^https?:\/\//i.test(href)) {
                const openEvent = new CustomEvent("open-link", {
                    detail: { href, item, path: detailPath },
                    bubbles: true,
                    composed: true,
                    cancelable: true
                });
                this.host?.dispatchEvent(openEvent);
                if (openEvent.defaultPrevented) return;
                try {
                    if (typeof window !== "undefined" && typeof window.open === "function") {
                        window.open(href, "_blank", "noopener,noreferrer");
                    }
                } catch (e) { console.warn(e); }
                return;
            }
            const abs = (self.path || "/") + (item?.name || "");
            if (!item?.file) {
                const loadPath = itemPath || abs;
                const backend = resolveFsBackend(loadPath);
                if (typeof backend?.readFile === "function") {
                    item.file = await backend.readFile(loadPath).catch(() => null);
                }
                if (!item.file) {
                    item.file = asProvidedFile(await provide(loadPath).catch(() => null));
                }
                if (item.file) {
                    item.size = item.file.size;
                    item.lastModified = item.file.lastModified;
                    item.type = item.file.type || item.type;
                }
            }
            const openEvent = new CustomEvent("open", { detail, bubbles: true, composed: true });
            this.host?.dispatchEvent(openEvent);
        }
    }

    //
    async requestUse() {
        // TODO: implement
    }

    //
    async refreshList(path: any|string = this.path) {
        await this.loadPath(path);
        return this;
    }

    //
    async loadPath(path: any|string = this.path) {
        // INVARIANT: callers (drop/paste/upload/refresh) must await a completed
        // listing for the latest path. Overlapping loads coalesce onto the newest
        // request and resolve every waiter after that listing is applied.
        this.#pendingLoadPath = path;
        if (this.#loadLock) {
            return new Promise<this>((resolve) => {
                this.#loadWaiters.push(resolve);
            });
        }
        this.#loadLock = true;

        try {
            while (this.#pendingLoadPath != null) {
                const nextPath = this.#pendingLoadPath;
                this.#pendingLoadPath = null;
                await this.#loadPathNow(nextPath);
            }
        } finally {
            this.#loadLock = false;
            const waiters = this.#loadWaiters.splice(0, this.#loadWaiters.length);
            for (const resolve of waiters) resolve(this);
        }
        return this;
    }

    async #loadPathNow(path: any|string = this.path) {
        const self: any = this;

        try {
            this.#loading.value = true;
            this.#error.value = "";
            const rel = normalizeDirectoryPath(path?.value || path || this.path || "/");
            this.detachDirectoryObservers();
            if (isVirtualRootPath(rel)) {
                this.applyEntries(this.listVirtualRootEntries());
                return this;
            }
            if (isAssetsPath(rel)) {
                const backend = resolveFsBackend(rel);
                try {
                    const remote = await backend?.list?.(rel);
                    if (remote && remote.length) {
                        this.applyEntries(remote.map((e) => observe(e) as FileEntryItem));
                        return this;
                    }
                } catch { /* seed + cache fallback */ }
                this.applyEntries(await this.listAssetEntries(rel));
                return this;
            }

            if (isUserPath(rel)) {
                const entries = await this.listUserEntriesDirect(rel, true);
                this.applyEntries(entries);
                return this;
            }

            // PathRouter dispatch: any registered backend that is not the
            // default `/user/` or `/assets/` (e.g. `/bookmarks/` once
            // registered) takes over listing. `/bookmarks/` is intentionally
            // not registered in Task 1, so this branch is a no-op today.
            const backend = resolveFsBackend(rel);
            if (backend && backend.root !== "/user/" && backend.root !== "/assets/") {
                this.applyEntries((await backend.list(rel)).map((e) =>
                    observe(e) as FileEntryItem
                ));
                // WHY: bookmarks (and other live backends) emit invalidation
                // events when the underlying store changes externally. Reload
                // the current path so the Explorer stays in sync without a
                // manual refresh. `subscribeBookmarksInvalidation` is an
                // optional backend hook; only wire it when present.
                const subscribe = (backend as any).subscribeBookmarksInvalidation;
                if (typeof subscribe === "function" && !this.#bookmarksInvalidationOff) {
                    this.#bookmarksInvalidationOff = subscribe(() => {
                        // Coalesce: only reload if we are still on a path owned
                        // by this backend (avoid stomping a navigated-away view).
                        const current = normalizeDirectoryPath(this.path);
                        const currentBackend = resolveFsBackend(current);
                        if (currentBackend?.root === backend.root) {
                            void this.loadPath(current).catch(() => {});
                        }
                    });
                }
                return this;
            }

            //
            try {
                this.#dirProxy = openDirectory(this.#fsRoot, rel, { create: false });
                await this.#dirProxy;
            } catch (openErr) {
                // In /user scope we tolerate missing folders and create them on navigation.
                if (!isUserPath(rel)) throw openErr;
                this.#dirProxy = openDirectory(this.#fsRoot, rel, { create: true });
                await this.#dirProxy;
            }

            //
            const loader = async () => {
                const entries = await this.collectDirectoryEntries();
                if (entries?.length != null && entries?.length >= 0 && typeof entries?.length == "number") {
                    this.applyEntries(entries);
                }
            };

            //
            const debouncedLoader = () => {
                if (this.#loaderDebounceTimer) { clearTimeout(this.#loaderDebounceTimer); }
                this.#loaderDebounceTimer = setTimeout(() => loader(), 50);
            };

            //
            await loader()?.catch?.(console.warn.bind(console));
            this.#subscribed = affected((await this.#dirProxy?.getMap?.() ?? []), debouncedLoader);
        } catch (e: any) {
            this.#error.value = e?.message || String(e || "");
            // Never show stale rows from previous path on load failure.
            this.applyEntries([]);
            console.warn(e);
        } finally {
            this.#loading.value = false;
        }
        return this;
    }

    //
    protected onRowClick = (item: FileEntryItem, ev: MouseEvent) => { ev.preventDefault(); void this.itemAction(item, "click"); };
    protected onRowDblClick = (item: FileEntryItem, ev: MouseEvent) => { ev.preventDefault(); void this.itemAction(item, "dblclick"); };
    protected onRowDragStart = (item: FileEntryItem, ev: DragEvent) => {
        if (!ev.dataTransfer) return;
        ev.dataTransfer.effectAllowed = "copyMove";
        const payload = buildExplorerDragPayload(item as any, this.path || "/");
        try { ev.dataTransfer.setData("application/json", payload.json); } catch { /* mime may be blocked */ }
        ev.dataTransfer.setData("text/plain", payload.plain);
        ev.dataTransfer.setData("text/uri-list", payload.uriList);
        if (payload.href) {
            try { ev.dataTransfer.setData("text/x-moz-url", `${payload.href}\n${item?.name || payload.href}`); } catch { /* ignore */ }
        }
        if (item?.file) {
            ev.dataTransfer.setData("DownloadURL", item?.file?.type + ":" + item?.file?.name + ":" + URL.createObjectURL(item?.file as any));
            ev.dataTransfer.items.add(item?.file as any);
        }
    };

    async runMenuAction(item: FileEntryItem | null, actionId: string, ev?: MouseEvent): Promise<void> {
        await this.onMenuAction(item, actionId, ev ?? new MouseEvent("contextmenu"));
    }

    //
    protected async onMenuAction(item: FileEntryItem | null, actionId: string, ev: MouseEvent) {
        try {
            const itemName = item?.name;
            if (!actionId) return; const abs = (this.path || "/") + (itemName || "");
            // WHY: bookmarks entries carry an id-based absolute `path` from the
            // backend (`/bookmarks/<id>` or `/bookmarks/<id>/`). The path-append
            // `abs` above is name-based and must not be used for bookmarks ops.
            const bmPath: string = (item as any)?.path || "";
            const bmBackend = bmPath ? this.bookmarksBackendFor(bmPath) : null;
            switch (actionId) {
                case "delete":
                case "rename":
                case "movePath":
                    if (this.readonly || isReadonlyPath(abs)) {
                        this.dispatchEvent(new CustomEvent("readonly-blocked", {
                            detail: { action: actionId, path: abs },
                            bubbles: true,
                            composed: true
                        }));
                        break;
                    }
                    if (actionId === "delete") {
                        if (bmBackend?.remove) {
                            if (globalThis.confirm?.(`Delete “${itemName || "bookmark"}”?`) !== true) break;
                            await bmBackend.remove(bmPath, true);
                        } else {
                            const fsBackend = resolveFsBackend(abs) || (bmPath ? resolveFsBackend(bmPath) : null);
                            const nativePath =
                                bmPath && fsBackend && bmPath.startsWith(fsBackend.root) ? bmPath : abs;
                            if (fsBackend?.remove && fsBackend.root !== "/user/" && fsBackend.root !== "/assets/") {
                                if (globalThis.confirm?.(`Delete “${itemName || "item"}”?`) !== true) break;
                                await fsBackend.remove(nativePath, true);
                            } else if (isWorkspacePath(abs)) {
                                await this.removeUserEntry(abs, true);
                            } else {
                                await remove(this.#fsRoot, abs);
                            }
                        }
                        await this.refreshList(this.path);
                        break;
                    }
                    if (actionId === "rename") {
                        const next = prompt("Rename to:", itemName);
                        if (next && next !== itemName) {
                            if (bmBackend?.rename) {
                                await bmBackend.rename(bmPath, next);
                            } else if (item?.kind === "file") {
                                if (isWorkspacePath(abs)) {
                                    await this.renameUserFile(abs ?? "", next ?? "");
                                } else {
                                    await this.renameFile(abs ?? "", next ?? "");
                                }
                            }
                            await this.refreshList(this.path);
                        }
                        break;
                    }
                    if (actionId === "movePath") {
                        // WHY (final review #4): stage the source on the
                        // internal clipboard with `cut: true` so the next
                        // paste into a writable folder performs a move:
                        //   - `/bookmarks/**` → `backend.move` (Chrome API)
                        //   - `/user/**` → writeUserFile + removeUserEntry
                        // Use the backend id-path for bookmarks so `move()`
                        // resolves the right Chrome node; fall back to the
                        // name-based `abs` for OPFS paths.
                        const srcPath = bmPath || abs;
                        this.#clipboard = { items: [srcPath], cut: true };
                        try {
                            await waitForClipboardFrame();
                            await navigator.clipboard?.writeText?.(srcPath);
                        } catch { }
                        break;
                    }
                    break;
                case "new-folder": {
                    if (this.readonly || isReadonlyPath(this.path)) {
                        this.dispatchEvent(new CustomEvent("readonly-blocked", {
                            detail: { action: actionId, path: this.path },
                            bubbles: true,
                            composed: true
                        }));
                        break;
                    }
                    const destBackend = this.bookmarksBackendFor(this.path);
                    if (destBackend?.mkdir) {
                        const fields = await openBookmarkFieldsDialog({
                            heading: "New folder",
                            description: "Chrome bookmarks folder",
                            showUrl: false,
                            initialTitle: "New folder",
                            submitLabel: "Create"
                        });
                        if (!fields?.title) break;
                        await destBackend.mkdir(this.path, fields.title);
                    } else {
                        const name = prompt("Folder name:", "New folder");
                        if (!name) break;
                        if (isWorkspacePath(this.path)) {
                            const folder = String(name).trim();
                            if (folder) await this.getUserDirHandle(`${this.path}${folder}/`, true);
                        }
                    }
                    await this.refreshList(this.path);
                    break;
                }
                case "new-bookmark": {
                    const destBackend = this.bookmarksBackendFor(this.path);
                    if (!destBackend?.createUrl) break;
                    const fields = await openBookmarkFieldsDialog({
                        heading: "New bookmark",
                        description: "Saved to Chrome bookmarks",
                        showUrl: true,
                        initialUrl: "https://",
                        submitLabel: "Create"
                    });
                    if (!fields?.url) break;
                    await destBackend.createUrl(this.path, fields.title || fields.url, fields.url);
                    await this.refreshList(this.path);
                    break;
                }
                case "edit-bookmark": {
                    if (!item || !bmBackend) break;
                    const isFolder = item.kind === "directory";
                    const fields = await openBookmarkFieldsDialog({
                        heading: isFolder ? "Rename folder" : "Edit bookmark",
                        description: "Chrome bookmarks",
                        showUrl: !isFolder,
                        initialTitle: item.name,
                        initialUrl: item.href || "",
                        submitLabel: "Save"
                    });
                    if (!fields) break;
                    if (bmBackend.update) {
                        await bmBackend.update(
                            bmPath,
                            isFolder ? { title: fields.title } : { title: fields.title, url: fields.url }
                        );
                    } else if (bmBackend.rename && fields.title && fields.title !== itemName) {
                        await bmBackend.rename(bmPath, fields.title);
                    }
                    await this.refreshList(this.path);
                    break;
                }
                case "open":
                    await this.itemAction(item as FileEntryItem);
                    break;
                case "paste":
                    await this.requestPaste();
                    break;
                case "view":
                    // Dispatch custom event for unified messaging
                    this.dispatchEvent(new CustomEvent('context-action', {
                        detail: { action: 'view', item }
                    }));
                    break;
                case "send-transfer":
                case "share-document":
                case "share-transfer":
                case "share-process": {
                    const current = this.path || "/";
                    const target =
                        actionId === "share-document" ? "document"
                        : actionId === "share-process" ? "process"
                        : "transfer";
                    const result = await shareExplorerToTarget(item, current, target);
                    this.dispatchEvent(new CustomEvent("context-action", {
                        detail: { action: actionId, item, handled: true, message: result.message }
                    }));
                    break;
                }
                case "share":
                case "copy-base64":
                case "copy-text":
                case "copy-image":
                case "copy-real-path":
                case "copy-blob-url": {
                    const current = this.path || "/";
                    const result =
                        actionId === "share" ? await shareExplorerItem(item, current)
                        : actionId === "copy-base64" ? await copyExplorerBase64Url(item, current)
                        : actionId === "copy-text" ? await copyExplorerInlineText(item, current)
                        : actionId === "copy-image" ? await copyExplorerImage(item, current)
                        : actionId === "copy-real-path" ? await copyExplorerRealPath(item, current)
                        : await copyExplorerBlobUrl(item, current);
                    this.dispatchEvent(new CustomEvent("context-action", {
                        detail: { action: actionId, item, handled: true, message: result.message }
                    }));
                    break;
                }
                case "attach-workcenter":
                    // Dispatch custom event for unified messaging
                    this.dispatchEvent(new CustomEvent('context-action', {
                        detail: { action: 'attach-workcenter', item }
                    }));
                    break;
                case "download":
                    Promise.try(async () => {
                        if (isAssetsPath(abs)) {
                            const file = asProvidedFile(await provide(abs));
                            if (file) await downloadFile(file);
                            return;
                        }
                        if (item?.kind === "file") {
                            await downloadFile(await getFileHandle(this.#fsRoot, abs, { create: false }));
                        } else {
                            await downloadFile(await getDirectoryHandle(this.#fsRoot, abs, { create: false }));
                        }
                    }).catch(console.warn);
                     break;
                case "copyPath":
                    this.#clipboard = { items: [abs], cut: false };
                    try {
                        await waitForClipboardFrame();
                        await navigator.clipboard?.writeText?.(abs);
                    } catch { }
                    break;
                case "copy":
                    this.#clipboard = { items: [abs], cut: false };
                    try {
                        await waitForClipboardFrame();
                        await navigator.clipboard?.writeText?.(abs);
                    } catch { }
                    break;
            }
        } catch (e: any) {
            console.warn(e);
            this.#error.value = e?.message || String(e || "");
        }
    }

    //
    protected async renameFile(oldName: string, newName: string) {
        const fromHandle = await getFileHandle(this.#fsRoot, oldName, { create: false });
        const file = await fromHandle?.getFile?.();
        if (!file) return;
        const target = await getFileHandle(this.#fsRoot, newName, { create: true }).catch(() => null);
        if (!target) {
            await writeFile(this.#fsRoot, this.path + newName, file);
        } else {
            await writeFile(this.#fsRoot, this.path + newName, file);
        }
        await remove(this.#fsRoot, this.path + oldName);
    }

    //
    async requestUpload() {
        // Read-only state is reactive and can still describe the previous `/`
        // frame when the toolbar is used immediately after navigation. Resolve
        // the current writable destination from the path itself so an upload
        // cannot be dropped by a stale flag.
        const destination = this.incomingDestinationPath();
        if (destination) {
            // WHY: `/bookmarks/` is not a byte store. Upload into a bookmarks
            // folder must reject with a user-facing `bookmarks-reject` event
            // (FileManager surfaces a toast) instead of silently writing OPFS.
            if (isBookmarksPath(destination)) {
                this.dispatchEvent(new CustomEvent("bookmarks-reject", {
                    detail: {
                        reason: "bookmarks backend does not store file bytes",
                        path: destination,
                        count: 0
                    },
                    bubbles: true,
                    composed: true
                }));
                return;
            }
            try {
                const files = await this.pickFilesForUpload();
                for (const file of files) {
                    await this.writeUserFile(file, destination);
                }
                await this.finishIncoming(destination);
            } catch (e) {
                console.warn(e);
            }
            return;
        }

        const currentPath = normalizeDirectoryPath(this.path);
        if (this.readonly || isReadonlyPath(currentPath)) return;
        try {
            await uploadFile(currentPath, null);
            await this.refreshList(currentPath);
        } catch (e) { console.warn(e); }
    }

    //
    async requestPaste() {
        const destination = this.incomingDestinationPath();
        if (!destination) return;
        // `/bookmarks/` paste: route URI text to `createUrl`; never write bytes.
        if (isBookmarksPath(destination)) {
            // WHY (final review #4): if the internal clipboard holds bookmarks
            // entries staged with `cut: true` (from `movePath`), perform a real
            // Chrome `move` into the destination folder instead of re-creating
            // URLs from clipboard text. `backend.move` is the only way to
            // preserve Chrome bookmark ids across a move.
            const internal = this.#clipboard;
            if (
                internal?.cut &&
                internal.items.length > 0 &&
                internal.items.every((p) => isBookmarksPath(p))
            ) {
                const moveBackend = this.bookmarksBackendFor(destination);
                if (moveBackend?.move) {
                    try {
                        for (const src of internal.items) {
                            try { await moveBackend.move(src, destination); }
                            catch (e) { console.warn(e); }
                        }
                        this.#clipboard = null;
                        await this.refreshList(this.path);
                    } catch (e) { console.warn(e); }
                    return;
                }
            }
            try {
                let systemText = "";
                try {
                    await waitForClipboardFrame();
                    systemText = await navigator.clipboard?.readText?.();
                } catch { }
                if (systemText) {
                    await this.ingestIntoBookmarks(
                        { getData: (type: string) => type === "text/plain" ? systemText : "" },
                        destination
                    );
                    await this.refreshList(this.path);
                }
            } catch (e) { console.warn(e); }
            return;
        }
        try {
            // 1. Try modern Async Clipboard API first (images, files)
            try {
                // @ts-ignore
                await waitForClipboardFrame();
                const clipboardItems = await navigator.clipboard.read();
                if (clipboardItems && clipboardItems.length > 0) {
                    const files = await this.extractFilesFromData(clipboardItems);
                    if (files.length > 0) {
                        for (const file of files) {
                            await this.writeUserFile(file, destination);
                        }
                        await this.finishIncoming(destination);
                        return;
                    }
                }
            } catch (e) {
                // Fallback or permission denied
            }

            // 2. Try System Clipboard Text
            let systemText = "";
            try {
                await waitForClipboardFrame();
                systemText = await navigator.clipboard?.readText?.();
            } catch { }

            // 3. Check internal clipboard
            const internalItems = this.#clipboard?.items || [];

            // Determine sources: Prefer internal if valid and no system text override (simple heuristic)
            // Actually, unified handling:
            if (systemText) {
                // Preserve text paste behavior for non-file clipboard content.
                await handleIncomingEntries({
                    getData: (type: string) => type === "text/plain" ? systemText : ""
                }, destination, this.#fsRoot);
                await this.finishIncoming(destination);
                return;
            }

            if (internalItems.length > 0) {
                const txt = internalItems.join("\n");
                if (internalItems.every((x) => String(x || "").startsWith("/user/"))) {
                    for (const src of internalItems) {
                        const file = await readFile(this.#fsRoot, src).catch(() => null);
                        if (isFileLike(file)) {
                            await this.writeUserFile(file, destination);
                            if (this.#clipboard?.cut) await this.removeUserEntry(src, true).catch(() => null);
                        }
                    }
                    if (this.#clipboard?.cut) this.#clipboard = null;
                } else {
                    await handleIncomingEntries({
                        getData: (type: string) => type === "text/plain" ? txt : ""
                    }, destination, this.#fsRoot);
                }
                await this.finishIncoming(destination);
            }
        } catch (e) { console.warn(e); }
    }

    //
    public onPaste(ev: ClipboardEvent) {
        const destination = this.incomingDestinationPath();
        if (!destination) return;
        ev.preventDefault();

        // `/bookmarks/` is a live Chrome Bookmarks mount, not an OPFS folder.
        // Route URI paste to `createUrl` and reject raw File bytes before any
        // OPFS write path is reached. WHY: `ingestIncomingData` calls
        // `writeUserFile` which would silently drop bytes into OPFS even when
        // the user pasted into a bookmarks folder.
        if (isBookmarksPath(destination)) {
            const payload = (ev as any).clipboardData || (ev as any).dataTransfer;
            if (payload) {
                void Promise.try(async () => {
                    await this.ingestIntoBookmarks(payload, destination);
                    await this.refreshList(this.path);
                }).catch(console.warn);
                return;
            }
            this.requestPaste();
            return;
        }

        // Try to read from event first
        if (ev.clipboardData || (ev as any).dataTransfer) {
            void Promise.try(async () => {
                const payload = ev.clipboardData || (ev as any).dataTransfer;
                await this.ingestIncomingData(payload, destination);
                await this.finishIncoming(destination);
            }).catch(console.warn);
            return;
        }

        //
        this.requestPaste();
    }

    //
    public onCopy(ev: ClipboardEvent) {
        // Not implemented selection tracking yet
    }

    //
    public async onDrop(ev: DragEvent) {
        const destination = this.incomingDestinationPath();
        if (!destination) return;
        ev.preventDefault();

        // `/bookmarks/` is a live Chrome Bookmarks mount, not an OPFS folder.
        // Route URI drops to `createUrl` and reject raw File bytes before any
        // OPFS write path is reached.
        if (isBookmarksPath(destination)) {
            const payload = (ev as any).clipboardData || (ev as any).dataTransfer;
            if (payload) {
                await this.ingestIntoBookmarks(payload, destination);
                await this.refreshList(this.path);
            }
            return;
        }

        //
        if ((ev as any).clipboardData || (ev as any).dataTransfer) {
            const payload = (ev as any).clipboardData || (ev as any).dataTransfer;
            // Must happen synchronously in this event handler, before the
            // first await inside `ingestIncomingData()`.
            const directoryHandlePromises = this.captureDirectoryHandlePromises(payload);
            await this.ingestIncomingData(payload, destination, directoryHandlePromises);
            await this.finishIncoming(destination);
            return;
        }
    }

    //
    /** WHY: host is `ui-file-manager-content`; runtime listens on `ui-file-manager`. */
    protected dispatchEvent(event: Event) {
        const host = this.host;
        if (!host) return;
        if (event instanceof CustomEvent) {
            host.dispatchEvent(
                new CustomEvent(event.type, {
                    detail: event.detail,
                    bubbles: true,
                    composed: true,
                    cancelable: event.cancelable
                })
            );
            return;
        }
        host.dispatchEvent(event);
    }
}

/**
 * Task 3 fix: default `/user/` and `/assets/` FsBackends are now registered at
 * `path-router` module boot via `ensureDefaultFsBackends()` (standalone OPFS
 * list, no Operative dependency). The virtual root listing
 * (`listVirtualRootEntriesFromRouter`) still surfaces `user` + `assets`.
 *
 * WHY no operative-delegating re-registration: Explorer's `#loadPathNow`
 * branches for `isUserPath` / `isAssetsPath` call `listUserEntriesDirect` /
 * `listAssetEntries` directly (not via the backend), so Explorer's own
 * listing is unaffected. External callers (SpeedDial mirror) get the
 * standalone OPFS backend, which is the Task 3 fix goal. Re-registering here
 * would overwrite the standalone backend and re-introduce the Operative
 * singleton dependency that left SpeedDial home with an empty mirror list.
 *
 * `defaultOperative` is kept as a module-level reference only for any future
 * adapter that wants to delegate to a live operative; it is no longer used
 * to register backends.
 */
let defaultOperative: FileOperative | null = null;

const ensureDefaultBackends = (operative: FileOperative): void => {
    defaultOperative = operative;
};

export default FileOperative;
