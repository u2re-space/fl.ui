/*
 * Filename: ExplorerSettings.ts
 * FullPath: modules/projects/fl.ui/src/ui/explorer/ExplorerSettings.ts
 * Change date: 09.05.00_30.08.2026
 * Reason: Explorer in-list settings use the same Veela cards / fields as Settings.
 * FIND:explorer-settings
 */

import {
    H,
    defineElement,
    isOpfsCapabilityAvailable,
    isOpfsSupportEnabled,
    refreshMappedStorageRoots,
    setOpfsSupportEnabled
} from "@fest-lib/lure";
import { ensureDefaultFsBackends, unregisterFsBackend } from "./path-router.js";
import { addEvent } from "@fest-lib/dom";
import { preloadStyle } from "@fest-lib/style-lib";
import { UIElement } from "fl-ui/base/UIElement";
import {
    addDirectoryMount,
    listExplorerMounts,
    removeDirectoryMount
} from "./mounts.ts";
import { peekExplorerSort, writeExplorerSort, type ExplorerSortBy } from "./entry-sort.ts";
import {
    canShowDirectoryPicker,
    getAllFilesStatus,
    isNativeStorageAvailable,
    pickBrowserDirectory,
    pickSafTree,
    requestAllFilesAccess,
    type AllFilesStatus
} from "./storage-bridge.ts";

// @ts-ignore
import settingsCss from "veela-lib/ui/components/explorer-settings.scss?inline";

try { preloadStyle(settingsCss); } catch { /* COMPAT: style preload must not block define */ }

const paintMounts = (host: HTMLElement): void => {
    const list = host.querySelector("[data-explorer-mounts]") as HTMLElement | null;
    if (!list) return;
    const mounts = listExplorerMounts();
    list.replaceChildren();
    if (!mounts.length) {
        list.dataset.empty = "1";
        list.textContent = "No mounted folders yet.";
        return;
    }
    list.dataset.empty = "0";
    for (const mount of mounts) {
        const row = document.createElement("div");
        row.className = "explorer-settings__mount";
        row.innerHTML = `<span>${mount.label}</span><code>${mount.path}</code>`;
        const unmount = document.createElement("button");
        unmount.className = "btn";
        unmount.type = "button";
        unmount.textContent = "Unmount";
        unmount.addEventListener("click", () => {
            removeDirectoryMount(mount.id);
            paintMounts(host);
            window.dispatchEvent(new CustomEvent("cwsp:explorer-mount-change"));
        });
        row.append(unmount);
        list.append(row);
    }
};

const paintSort = (host: HTMLElement): void => {
    const prefs = peekExplorerSort();
    const by = host.querySelector("[data-explorer-sort-by]") as HTMLSelectElement | null;
    const dir = host.querySelector("[data-explorer-sort-dir]") as HTMLSelectElement | null;
    const folders = host.querySelector("[data-explorer-folders-first]") as HTMLInputElement | null;
    if (by) by.value = prefs.sortBy;
    if (dir) dir.value = prefs.sortDir;
    if (folders) folders.checked = prefs.foldersFirst;
};

const paintStatus = (host: HTMLElement, status: AllFilesStatus | null, note = ""): void => {
    const el = host.querySelector("[data-explorer-status]") as HTMLElement | null;
    if (!el) return;
    const lines = [
        `All-files (/sdcard/): ${status?.allFilesAccess ? "granted" : "not granted"}`,
        status?.note ? status.note : "",
        note
    ].filter(Boolean);
    el.textContent = lines.join("\n");
};

@defineElement("ui-explorer-settings")
export class ExplorerSettings extends UIElement {
    /** WHY: pass CSS text so Glit can refill / shadow-fallback if the constructable sheet emptied. */
    styles = () => settingsCss;

    onInitialize(): this {
        const result = super.onInitialize();
        scheduler?.yield?.()?.then?.(() => {
            paintSort(this);
            paintMounts(this);
            if (isNativeStorageAvailable()) {
                void getAllFilesStatus().then((s) => paintStatus(this, s));
            } else {
                paintStatus(this, null, "Browser / PWA: use Mount folder (showDirectoryPicker).");
            }
        });
        return (result ?? this) as this;
    }

    render = function (this: ExplorerSettings) {
        const self = this;
        const native = isNativeStorageAvailable();
        const picker = canShowDirectoryPicker();
        return H`<div class="explorer-settings" part="root">
            <header class="explorer-settings__head">
                <h2>Explorer</h2>
                <p class="explorer-settings__hint">Sort this list and how Android or the browser reach files.</p>
            </header>
            <section class="explorer-settings__card">
                <h3 class="explorer-settings__title">
                    <ui-icon icon="sort-ascending" icon-style="duotone" size="20"></ui-icon>
                    List sort
                </h3>
                <p>Name, date, type, size, or kind. Folders can stay on top.</p>
                <label class="explorer-settings__field">
                    <span>Sort by</span>
                    <select data-explorer-sort-by on:change=${(ev: Event) => {
                        const v = (ev.currentTarget as HTMLSelectElement).value as ExplorerSortBy;
                        writeExplorerSort({ sortBy: v });
                    }}>
                        <option value="name">Name</option>
                        <option value="date">Date modified</option>
                        <option value="type">Type</option>
                        <option value="size">Size</option>
                        <option value="kind">Kind (file / folder)</option>
                    </select>
                </label>
                <label class="explorer-settings__field">
                    <span>Order</span>
                    <select data-explorer-sort-dir on:change=${(ev: Event) => {
                        writeExplorerSort({
                            sortDir: (ev.currentTarget as HTMLSelectElement).value === "desc" ? "desc" : "asc"
                        });
                    }}>
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                    </select>
                </label>
                <label class="explorer-settings__check">
                    <input type="checkbox" data-explorer-folders-first on:change=${(ev: Event) => {
                        writeExplorerSort({ foldersFirst: (ev.currentTarget as HTMLInputElement).checked });
                    }} />
                    <span>Folders first</span>
                </label>
            </section>
            <section class="explorer-settings__card" hidden=${!native}>
                <h3 class="explorer-settings__title">
                    <ui-icon icon="hard-drives" icon-style="duotone" size="20"></ui-icon>
                    Android storage
                </h3>
                <p>All-files is <code>/sdcard/</code>. A picked tree is <code>/saf/</code> in this Explorer only.</p>
                <p data-explorer-status class="explorer-settings__status">Checking…</p>
                <div class="explorer-settings__actions">
                    <button class="btn btn--primary" type="button" disabled=${!native} on:click=${() => {
                        void requestAllFilesAccess().then(() =>
                            getAllFilesStatus().then((s) => paintStatus(self, s, "Opened system all-files settings."))
                        );
                    }}>Allow all files</button>
                    <button class="btn" type="button" disabled=${!native} on:click=${() => {
                        void pickSafTree().then((uri) => {
                            paintStatus(self, null, uri ? `SAF tree: ${uri}` : "SAF pick cancelled.");
                            window.dispatchEvent(new CustomEvent("cwsp:explorer-mount-change"));
                        });
                    }}>Pick SAF folder</button>
                </div>
            </section>
            <section class="explorer-settings__card">
                <h3 class="explorer-settings__title">
                    <ui-icon icon="hard-drives" icon-style="duotone" size="20"></ui-icon>
                    Origin storage
                </h3>
                <p>OPFS is <code>/user/</code> when available. IndexedDB is <code>/idb/</code> beside it, or <code>/user/</code> if OPFS is off.</p>
                <label class="explorer-settings__check">
                    <input type="checkbox" data-explorer-opfs-enabled checked=${isOpfsSupportEnabled()} disabled=${!isOpfsCapabilityAvailable()} on:change=${(ev: Event) => {
                        setOpfsSupportEnabled((ev.currentTarget as HTMLInputElement).checked);
                        refreshMappedStorageRoots();
                        unregisterFsBackend("/user/");
                        unregisterFsBackend("/idb/");
                        ensureDefaultFsBackends();
                        window.dispatchEvent(new CustomEvent("cwsp:explorer-mount-change"));
                    }} />
                    <span>Use OPFS for <code>/user/</code></span>
                </label>
            </section>
            <section class="explorer-settings__card" hidden=${native || !picker}>
                <h3 class="explorer-settings__title">
                    <ui-icon icon="folder-plus" icon-style="duotone" size="20"></ui-icon>
                    Browser mounts
                </h3>
                <p>Chromium <code>showDirectoryPicker</code>. Handles stay in this session beside <code>/user/</code>.</p>
                <div class="explorer-settings__actions">
                    <button class="btn" type="button" disabled=${!picker} on:click=${() => {
                        void pickBrowserDirectory().then((handle) => {
                            if (!handle) return;
                            addDirectoryMount(handle);
                            paintMounts(self);
                            window.dispatchEvent(new CustomEvent("cwsp:explorer-mount-change"));
                        });
                    }}>Mount folder</button>
                </div>
                <div data-explorer-mounts class="explorer-settings__mounts"></div>
            </section>
        </div>`;
    };
}

export const openExplorerSettings = (host?: HTMLElement | null): ExplorerSettings => {
    const existing = (host?.querySelector("ui-explorer-settings")
        ?? document.querySelector("ui-explorer-settings")) as ExplorerSettings | null;
    if (existing) {
        existing.hidden = false;
        host?.classList.add("fm-root--settings");
        return existing;
    }
    const page = document.createElement("ui-explorer-settings") as ExplorerSettings;
    (host || document.body).append(page);
    host?.classList.add("fm-root--settings");
    return page;
};

export const closeExplorerSettings = (): void => {
    document.querySelectorAll("ui-file-manager").forEach((fm) => {
        const root = fm.shadowRoot?.querySelector(".fm-root");
        root?.classList.remove("fm-root--settings");
        root?.querySelector("ui-explorer-settings")?.remove();
    });
    document.querySelector("ui-explorer-settings")?.remove();
};

addEvent(window, "keydown", (ev: KeyboardEvent) => {
    if (ev.key === "Escape") closeExplorerSettings();
});

export default ExplorerSettings;
