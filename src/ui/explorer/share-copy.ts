/*
 * Filename: share-copy.ts
 * FullPath: modules/projects/fl.ui/src/ui/explorer/share-copy.ts
 * Change date: 11.20.00_30.08.2026
 * Reason: Capacitor image copy uses CwsBridge ClipData, not WebView ClipboardItem.
 * FIND:explorer-share
 */

import { getMimeTypeByFilename, provide } from "@fest-lib/lure";
import { resolveFsBackend } from "./path-router";
import type { FileEntryItem } from "./Operative";
import {
    isNativeStorageAvailable,
    readNativeStorageFile,
    resolveNativeStorageUri,
    shareNativeStorageFile,
    resolveNativeStorageRealPath,
    copyNativeStorageImage,
    writeNativeClipboardImage
} from "./storage-bridge";

export type ShareCopyResult = { ok: boolean; message: string };

const TEXT_EXT = new Set([
    "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "css", "scss",
    "js", "mjs", "cjs", "ts", "tsx", "jsx", "svg", "yml", "yaml", "ini", "log", "sh",
    "bat", "ps1", "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "toml"
]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg", "ico", "tif", "tiff"]);

const blobUrlKeep: string[] = [];

const extOf = (name: string): string => {
    const base = String(name || "").split(/[\\/]/).pop() || "";
    const i = base.lastIndexOf(".");
    return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
};

export const isTextLikeEntry = (item: FileEntryItem | null | undefined, path = ""): boolean => {
    const mime = String(item?.type || item?.file?.type || "").toLowerCase();
    if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml" || mime === "image/svg+xml") {
        return true;
    }
    return TEXT_EXT.has(extOf(item?.name || path));
};

export const isImageLikeEntry = (item: FileEntryItem | null | undefined, path = ""): boolean => {
    const mime = String(item?.type || item?.file?.type || "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    return IMAGE_EXT.has(extOf(item?.name || path));
};

export const explorerItemPath = (item: FileEntryItem | null | undefined, currentPath = "/"): string => {
    const own = String(item?.path || "").trim();
    if (own) return own;
    const name = String(item?.name || "").trim();
    if (!name) return String(currentPath || "/");
    const base = String(currentPath || "/");
    return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
};

const isNativeVirtual = (path: string): boolean =>
    /^\/(?:sdcard|saf)(?:\/|$)/i.test(String(path || "").trim());

const mapSdcardRealPath = (virtualPath: string): string => {
    const raw = String(virtualPath || "").trim();
    if (raw === "/sdcard" || raw === "/sdcard/") return "/storage/emulated/0";
    if (raw.startsWith("/sdcard/")) return `/storage/emulated/0/${raw.slice("/sdcard/".length)}`;
    return "";
};

const waitClipboard = (): Promise<void> =>
    new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
            return;
        }
        setTimeout(resolve, 0);
    });

const writeText = async (text: string): Promise<boolean> => {
    const value = String(text || "");
    if (!value) return false;
    await waitClipboard();
    try {
        await navigator.clipboard?.writeText?.(value);
        return true;
    } catch {
        return false;
    }
};

const isCapacitorNative = (): boolean => {
    try {
        const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        return typeof c?.isNativePlatform === "function" && c.isNativePlatform();
    } catch {
        return false;
    }
};

const blobToPngFile = async (file: File): Promise<File> => {
    const mime = String(file.type || "").toLowerCase();
    if (mime === "image/png") return file;
    if (mime === "image/svg+xml") return file;
    try {
        if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return file;
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close?.();
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (blob) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
        }
    } catch {
        /* keep original */
    }
    return file;
};

const writeImage = async (file: File, virtualPath = ""): Promise<boolean> => {
    if (isCapacitorNative() && isNativeVirtual(virtualPath)) {
        if (await copyNativeStorageImage(virtualPath)) return true;
    }
    const png = await blobToPngFile(file);
    if (isCapacitorNative()) {
        try {
            const dataUrl = await fileToBase64Url(png);
            if (await writeNativeClipboardImage(dataUrl, png.type || "image/png", png.name)) return true;
        } catch {
            /* WebView clipboard is not a bitmap */
        }
        return false;
    }
    await waitClipboard();
    try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
            await navigator.clipboard.write([new ClipboardItem({ [png.type || "image/png"]: png })]);
            return true;
        }
    } catch {
        /* web host without image clipboard */
    }
    return false;
};

export const loadExplorerFile = async (
    item: FileEntryItem | null | undefined,
    path: string
): Promise<File | null> => {
    if (item?.file instanceof File) return item.file;
    const href = String(item?.href || "").trim();
    if (href && /^https?:\/\//i.test(href) && !item?.file) return null;
    if (isNativeVirtual(path) && isNativeStorageAvailable()) {
        const native = await readNativeStorageFile(path).catch(() => null);
        if (native) {
            if (item) item.file = native;
            return native;
        }
    }
    try {
        const backend = resolveFsBackend(path);
        if (typeof backend?.readFile === "function") {
            const file = await backend.readFile(path);
            if (file) {
                if (item) item.file = file;
                return file;
            }
        }
    } catch {
        /* optional */
    }
    const provided = await provide(path).catch(() => null);
    if (provided instanceof File) {
        if (item) item.file = provided;
        return provided;
    }
    return null;
};

const fileToBase64Url = async (file: File): Promise<string> => {
    const mime = file.type || getMimeTypeByFilename(file.name) || "application/octet-stream";
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    let bin = "";
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${mime};base64,${btoa(bin)}`;
};

const webShare = async (data: ShareData): Promise<boolean> => {
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share !== "function") return false;
    try {
        if (typeof nav.canShare === "function" && !nav.canShare(data)) return false;
        await nav.share(data);
        return true;
    } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "AbortError") return true;
        return false;
    }
};

const capacitorShare = async (opts: { title?: string; text?: string; url?: string }): Promise<boolean> => {
    try {
        const Share = (globalThis as { Capacitor?: { Plugins?: { Share?: { share?: Function } } } })
            .Capacitor?.Plugins?.Share;
        if (typeof Share?.share !== "function") return false;
        await Share.share({
            title: opts.title,
            text: opts.text,
            url: opts.url,
            dialogTitle: "Share"
        });
        return true;
    } catch {
        return false;
    }
};

/** Sibling Capacitor packages. Web falls through to the system share sheet (share_target). */
export const EXPLORER_SHARE_PACKAGES = {
    document: "space.u2re.document",
    transfer: "space.u2re.cwsp",
    process: "space.u2re.process"
} as const;

export type ExplorerShareTarget = keyof typeof EXPLORER_SHARE_PACKAGES;

/**
 * Send a file or directory to Document, Transfer, or Process.
 * WHY: Capacitor can target the package directly. A directory shares its files
 * (one level). Web uses the share sheet, which lists installed share targets.
 */
export const shareExplorerToTarget = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/",
    target: ExplorerShareTarget = "transfer"
): Promise<ShareCopyResult> => {
    const path = explorerItemPath(item, currentPath);
    const name = String(item?.name || path.split("/").filter(Boolean).pop() || "file");
    const packageName = EXPLORER_SHARE_PACKAGES[target];
    const label = target === "document" ? "Document" : target === "process" ? "Process" : "Transfer";

    if (isNativeVirtual(path) && isNativeStorageAvailable()) {
        const ok = await shareNativeStorageFile(path, {
            mimeType: item?.kind === "directory" ? "" : (item?.type || getMimeTypeByFilename(name)),
            title: name,
            packageName
        });
        if (ok) return { ok: true, message: `Shared ${name} to ${label}` };
    }

    if (item?.kind === "directory") {
        const text = path;
        if (await webShare({ title: name, text })) return { ok: true, message: `Shared ${name}` };
        if (await capacitorShare({ title: name, text })) return { ok: true, message: `Shared ${name}` };
        return { ok: false, message: "Share is unavailable for this folder" };
    }

    const file = await loadExplorerFile(item, path);
    if (file && (await webShare({ title: name, text: name, files: [file] }))) {
        return { ok: true, message: `Shared ${name}` };
    }
    const uri = isNativeVirtual(path) ? await resolveNativeStorageUri(path).catch(() => "") : "";
    if (uri && (await capacitorShare({ title: name, url: uri }))) return { ok: true, message: `Shared ${name}` };
    if (await webShare({ title: name, text: path })) return { ok: true, message: `Shared ${name}` };
    return { ok: false, message: `Could not share to ${label}` };
};

export const shareExplorerItem = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/"
): Promise<ShareCopyResult> => {
    const path = explorerItemPath(item, currentPath);
    const name = String(item?.name || path.split("/").filter(Boolean).pop() || "file");
    const href = String(item?.href || "").trim();

    if (isNativeVirtual(path) && isNativeStorageAvailable() && item?.kind !== "directory") {
        const ok = await shareNativeStorageFile(path, {
            mimeType: item?.type || getMimeTypeByFilename(name),
            title: name
        });
        if (ok) return { ok: true, message: `Shared ${name}` };
    }

    if (href && /^https?:\/\//i.test(href)) {
        if (await webShare({ title: name, text: name, url: href })) return { ok: true, message: `Shared ${name}` };
        if (await capacitorShare({ title: name, text: name, url: href })) return { ok: true, message: `Shared ${name}` };
        if (await writeText(href)) return { ok: true, message: "Copied link (share unavailable)" };
        return { ok: false, message: "Share is unavailable" };
    }

    if (item?.kind === "directory") {
        const real = await resolveExplorerRealPath(item, currentPath);
        const text = real || path;
        if (await webShare({ title: name, text })) return { ok: true, message: `Shared ${name}` };
        if (await capacitorShare({ title: name, text })) return { ok: true, message: `Shared ${name}` };
        if (await writeText(text)) return { ok: true, message: "Copied path (share unavailable)" };
        return { ok: false, message: "Share is unavailable" };
    }

    const file = await loadExplorerFile(item, path);
    if (file) {
        const asFiles: ShareData = { title: name, text: name, files: [file] };
        if (await webShare(asFiles)) return { ok: true, message: `Shared ${name}` };
        const uri = isNativeVirtual(path) ? await resolveNativeStorageUri(path).catch(() => "") : "";
        if (uri && (await capacitorShare({ title: name, url: uri }))) return { ok: true, message: `Shared ${name}` };
        if (await webShare({ title: name, text: name })) return { ok: true, message: `Shared ${name}` };
        if (await capacitorShare({ title: name, text: name })) return { ok: true, message: `Shared ${name}` };
        return { ok: false, message: "Share is unavailable for this file" };
    }

    if (await webShare({ title: name, text: path })) return { ok: true, message: `Shared ${name}` };
    if (await capacitorShare({ title: name, text: path })) return { ok: true, message: `Shared ${name}` };
    return { ok: false, message: "Nothing to share" };
};

export const resolveExplorerRealPath = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/"
): Promise<string> => {
    const path = explorerItemPath(item, currentPath);
    const href = String(item?.href || "").trim();
    if (href && /^(https?|file|content):/i.test(href)) return href;
    if (isNativeVirtual(path) && isNativeStorageAvailable()) {
        const native = await resolveNativeStorageRealPath(path).catch(() => "");
        if (native) return native;
        const uri = await resolveNativeStorageUri(path).catch(() => "");
        if (uri) return uri;
    }
    return mapSdcardRealPath(path);
};

export const copyExplorerBase64Url = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/"
): Promise<ShareCopyResult> => {
    const path = explorerItemPath(item, currentPath);
    const file = await loadExplorerFile(item, path);
    if (!file) return { ok: false, message: "Could not read this file" };
    try {
        const url = await fileToBase64Url(file);
        const ok = await writeText(url);
        return { ok, message: ok ? "Copied Base64 URL" : "Clipboard write failed" };
    } catch {
        return { ok: false, message: "File is too large for Base64" };
    }
};

export const copyExplorerInlineText = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/"
): Promise<ShareCopyResult> => {
    const path = explorerItemPath(item, currentPath);
    if (!isTextLikeEntry(item, path)) return { ok: false, message: "Not a text file" };
    const file = await loadExplorerFile(item, path);
    if (!file) return { ok: false, message: "Could not read this file" };
    const text = await file.text();
    const ok = await writeText(text);
    return { ok, message: ok ? "Copied text" : "Clipboard write failed" };
};

export const copyExplorerImage = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/"
): Promise<ShareCopyResult> => {
    const path = explorerItemPath(item, currentPath);
    if (!isImageLikeEntry(item, path)) return { ok: false, message: "Not an image" };
    if (isNativeVirtual(path) && isNativeStorageAvailable()) {
        if (await copyNativeStorageImage(path)) return { ok: true, message: "Copied image" };
    }
    const file = await loadExplorerFile(item, path);
    if (!file) return { ok: false, message: "Could not read this file" };
    const ok = await writeImage(file, path);
    return { ok, message: ok ? "Copied image" : "Clipboard write failed" };
};

export const copyExplorerRealPath = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/"
): Promise<ShareCopyResult> => {
    const path = explorerItemPath(item, currentPath);
    const real = await resolveExplorerRealPath(item, currentPath);
    if (real) {
        const ok = await writeText(real);
        return { ok, message: ok ? "Copied real path" : "Clipboard write failed" };
    }
    const ok = await writeText(path);
    return { ok, message: ok ? "Copied Explorer path (no OS path)" : "Clipboard write failed" };
};

export const copyExplorerBlobUrl = async (
    item: FileEntryItem | null | undefined,
    currentPath = "/"
): Promise<ShareCopyResult> => {
    const path = explorerItemPath(item, currentPath);
    const file = await loadExplorerFile(item, path);
    if (!file) return { ok: false, message: "Could not read this file" };
    const url = URL.createObjectURL(file);
    blobUrlKeep.push(url);
    const ok = await writeText(url);
    return { ok, message: ok ? "Copied Blob URL (this session)" : "Clipboard write failed" };
};
