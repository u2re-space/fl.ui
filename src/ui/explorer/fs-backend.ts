/*
 * Filename: fs-backend.ts
 * FullPath: modules/projects/fl.ui/src/ui/explorer/fs-backend.ts
 * Change date and time: 08.50.00_30.08.2026
 * Reason for changes: toExplorerStoragePath — /storage/emulated/0 and primary: → /sdcard/.
 */

/**
 * INVARIANT: directories end with `/`; file paths do not. Root is `/`.
 *
 * `normalizeVirtualPath` is the single source of truth for virtual path
 * normalization across the Explorer Operative trees and every registered
 * FsBackend. It intentionally defaults to directory semantics because the
 * Explorer navigation model is directory-centric (every listed path is a
 * folder). Callers that resolve a leaf file pass `asDirectory: false`.
 */
export type EntryKind = "file" | "directory";

export interface FileEntryLike {
  name: string;
  kind: EntryKind;
  path?: string;
  type?: string;
  href?: string; // bookmarks URL entries
  bookmarkId?: string;
}

export interface FsBackend {
  readonly root: string; // e.g. "/user/", "/assets/", "/bookmarks/"
  readonly writable: boolean;
  list(path: string): Promise<FileEntryLike[]>;
  mkdir?(path: string, name: string): Promise<void>;
  remove?(path: string, recursive?: boolean): Promise<void>;
  rename?(path: string, newName: string): Promise<void>;
  move?(fromPath: string, toDirPath: string): Promise<void>;
  createUrl?(parentPath: string, title: string, url: string): Promise<void>;
  /** Title and/or URL patch (Chrome bookmarks). Folders ignore `url`. */
  update?(path: string, patch: { title?: string; url?: string }): Promise<void>;
  // byte write only for OPFS-capable backends
  writeFile?(parentPath: string, file: File): Promise<void>;
  /** Capacitor `/sdcard/` `/saf/` — list() rows have no `File` until this runs. */
  readFile?(path: string): Promise<File | null>;
}

export function normalizeVirtualPath(path: string, asDirectory = true): string {
  let p = String(path || "/").trim() || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p !== "/" && asDirectory && !p.endsWith("/")) p += "/";
  if (p !== "/" && !asDirectory && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * Material Files FileProvider encodes `file:///storage/emulated/0/Notes.txt`
 * as the last segment (sometimes twice). SAF uses `primary:` / `home:`.
 */
function unwrapContentFileOsPath(raw: string): string {
  let cur = String(raw || "").trim();
  if (!cur) return "";
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  if (cur.startsWith("/file:")) cur = cur.slice(1);
  const fileAt = cur.toLowerCase().indexOf("file:");
  if (fileAt >= 0) {
    try {
      const u = new URL(cur.slice(fileAt));
      const path = decodeURIComponent(u.pathname || "");
      if (path) return path;
    } catch {
      const rest = cur.slice(fileAt).replace(/^file:\/\//i, "");
      if (rest.startsWith("/")) return rest;
    }
  }
  const pathOnly = cur.replace(/^content:\/\/[^/]+/i, "");
  if (/^\/(?:storage\/emulated\/0|mnt\/sdcard|sdcard)(?:\/|$)/i.test(pathOnly)) return pathOnly;
  return "";
}

/**
 * WHY: Transfer / Android send `/storage/emulated/0/…`, `file://`, or
 * `content://…/primary:Download/…`. Explorer lists that as `/sdcard/…`.
 * Do not map `/saf/` — that is Explorer's own tree, not Transfer landing.
 */
export function toExplorerStoragePath(path: string, asDirectory = true): string {
  let p = String(path || "").trim();
  if (!p) return "";
  try {
    if (/^file:/i.test(p)) {
      const u = new URL(p);
      p = decodeURIComponent(u.pathname || p);
    }
  } catch {
    /* keep raw */
  }
  if (/^content:/i.test(p)) {
    let decoded = p;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      decoded = p;
    }
    const id = decoded.match(/(?:primary|home):([^?#]*)/i);
    if (id) {
      const rel = String(id[1] || "").replace(/^\/+/, "");
      p = rel ? `/sdcard/${rel}` : "/sdcard/";
    } else {
      const embedded = unwrapContentFileOsPath(decoded);
      if (!embedded) return "";
      p = embedded;
    }
  }
  p = p.replace(/\\/g, "/");
  p = p.replace(/^(?:\/storage\/emulated\/0|\/mnt\/sdcard|storage\/emulated\/0|mnt\/sdcard)(?=\/|$)/i, "/sdcard");
  p = p.replace(/^\/sdcard\/sdcard(?=\/|$)/i, "/sdcard");
  if (!p.startsWith("/")) p = `/${p}`;
  return normalizeVirtualPath(p, asDirectory);
}

/*
 * Task 5 — Favicon resolution helpers.
 *
 * WHY: bookmark URL entries (`/bookmarks/<id>` rows and mirror tiles built
 * from a `/bookmarks/…` listing) carry an `href`. We render a real favicon
 * image instead of a generic `link` icon so the grid/list stays recognizable.
 *
 * `faviconForHref` returns a public Google S2 favicon URL for an absolute
 * http(s) href, or `""` when `href` is missing/invalid. Callers fall back to
 * a named icon (e.g. `link`) when the return is empty.
 *
 * `resolveEntryIcon` returns either a favicon URL (when the entry has a usable
 * `href`) or `""`. It is the single entry point used by both the Explorer list
 * renderer and the SpeedDial mirror tile renderer so the favicon-vs-named-icon
 * decision stays in one place.
 *
 * COMPAT: we avoid `chrome://favicon/` because it is only available inside a CRX
 * page and would `undefined`-out in the shell origin. The S2 endpoint works from
 * any origin and degrades gracefully (returns a generic globe) on offline/unknown
 * hosts, so the shell never needs a fallback path.
 */
export function faviconForHref(href: string): string {
  const raw = String(href || "").trim();
  if (!raw) return "";
  // Only resolve favicons for absolute http(s) URLs; relative paths or
  // internal virtual paths (`/user/…`) must fall back to a named icon.
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const host = new URL(raw).hostname;
    if (!host) return "";
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return "";
  }
}

/**
 * Drag payload for Explorer → Speed Dial / browser drops.
 *
 * WHY: rows used to set `text/plain` to a virtual path (`/bookmarks/10`). Speed
 * Dial's last-resort parser `JSON.parse`s that string and throws. URL bookmarks
 * must travel as http(s) `text/uri-list`; folders travel as a JSON shortcut
 * envelope (`open-path` + `path` + label) so the dial keeps the bookmark title.
 */
export function buildExplorerDragPayload(
  item: FileEntryLike | null | undefined,
  currentPath: string
): { href: string; path: string; plain: string; uriList: string; json: string } {
  const href = String(item?.href || "").trim();
  const itemPath = String(item?.path || "").trim();
  const base = String(currentPath || "/");
  const name = String(item?.name || "").trim();
  const abs =
    itemPath ||
    `${base.endsWith("/") ? base : `${base}/`}${name}`;
  const isUrl = /^https?:\/\//i.test(href);
  const action = isUrl ? "open-link" : "open-path";
  const label = name || href || abs;
  const envelope = {
    state: {
      icon: isUrl ? "link" : item?.kind === "directory" ? "folder" : "file",
      label,
      action
    },
    desc: {
      action,
      href: isUrl ? href : "",
      path: abs,
      kind: item?.kind || (isUrl ? "file" : "directory")
    }
  };
  const json = JSON.stringify(envelope);
  return {
    href,
    path: abs,
    json,
    uriList: isUrl ? href : abs,
    // WHY: browsers often keep only text/plain across windows. URL rows send
    // the http(s) href; folders send the JSON envelope (not `/bookmarks/…`).
    plain: isUrl ? href : json
  };
}

export function resolveEntryIcon(entry: FileEntryLike | null | undefined): string {
  if (!entry) return "";
  const href = entry.href ? String(entry.href) : "";
  if (!href) return "";
  return faviconForHref(href);
}
