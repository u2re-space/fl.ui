/*
 * Filename: QuickSettings.ts
 * FullPath: modules/projects/fl.ui/src/ui/navigation/settings/QuickSettings.ts
 * Change date and time: 15.45.00_22.08.2026
 * Reason for changes: Swallow orientation.lock() NotSupportedError on desktop Neutralino.
 */
/**
 * WHY: Singleton `ui-quick-settings` custom element mounted into the shared ChromeFlyout
 * overlay root (see `../flyout/ChromeFlyout`), exclusive with the calendar flyout via the
 * shared registry. Theme toggling and the night-light/brightness overlay filters are local,
 * dependency-free helpers — no hard import of the app-level Theme/Settings subsystem — so
 * this component stays usable standalone inside `fl.ui`. Apps that ship a real Theme
 * subsystem can still react via the `u2-theme-change` event this module dispatches.
 */
import { defineElement, H, navigate } from "@fest-lib/lure";
import { MOCElement } from "@fest-lib/dom";
import { preloadStyle } from "@fest-lib/style-lib";
import { UIElement } from "fl-ui/base/UIElement";
import "@fest-lib/icon";
import { getSpeedDialViewOpener } from "fl-ui/speed-dial/view-opener";

import {
    ensureOverlayRoot,
    positionFlyout,
    toggleChromeFlyout,
    closeChromeFlyout,
    isChromeFlyoutOpen,
    type ChromeFlyoutController
} from "../flyout/ChromeFlyout";

// @ts-ignore
import styles from "veela-lib/ui/components/quick-settings.scss?inline";
const styled = preloadStyle(styles);

/** Shared exclusivity/positioning kind — see `ChromeFlyout.ts`. Mirrors `CalendarFlyout.ts`. */
const FLYOUT_KIND = "quick-settings" as const;

/* ---------------------------------------------------------------------- */
/* Theme toggle helper (no hard dependency on the app Theme subsystem)     */
/* ---------------------------------------------------------------------- */

export type QuickThemeMode = "light" | "dark";

const THEME_ATTR = "data-theme";
/** Minimum required key per spec; `THEME_STORAGE_KEY_DOTTED` mirrors readers that expect a dotted name. */
const THEME_STORAGE_KEY = "rs-appearance-theme";
const THEME_STORAGE_KEY_DOTTED = "appearance.theme";
/** Best-effort merge targets: patch `appearance.theme` inside any settings blob found under these keys. */
const SETTINGS_BLOB_KEYS = ["rs-settings", "cwsp-settings", "u2-settings"];

const prefersDarkScheme = (): boolean => {
    try {
        return matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
    } catch {
        return true;
    }
};

/** Patch `.appearance.theme` into any parseable JSON settings blob under known keys (best-effort). */
const mergeThemeIntoSettingsBlobs = (mode: QuickThemeMode): void => {
    for (const key of SETTINGS_BLOB_KEYS) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const blob = JSON.parse(raw);
            if (!blob || typeof blob !== "object") continue;
            blob.appearance = { ...(blob.appearance ?? {}), theme: mode };
            localStorage.setItem(key, JSON.stringify(blob));
        } catch {
            /* ignore malformed blob / quota / private mode */
        }
    }
};

/** Current theme: `data-theme` attr > stored pref > OS `prefers-color-scheme`. */
export const getCurrentQuickTheme = (): QuickThemeMode => {
    try {
        const attr = document.documentElement.getAttribute(THEME_ATTR);
        if (attr === "light" || attr === "dark") return attr;
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "light" || stored === "dark") return stored;
    } catch {
        /* ignore */
    }
    return prefersDarkScheme() ? "dark" : "light";
};

/**
 * Apply light/dark from Quick Settings without importing app Theme.ts (fl.ui ↔ subsystem cycle).
 * WHY: Must mirror `syncBrowserChromeTheme` — `data-scheme` + hosts + body — or env-shell /
 * veela keep OS `prefers-color-scheme` / stale `data-scheme="auto"` and light never sticks.
 *
 * When preference is `auto`, keep `data-scheme="auto"` and pin `data-theme` to the resolved
 * OS mode so light-dark()/components refresh while still tracking system changes.
 */
export const applyQuickTheme = (mode: QuickThemeMode | "auto"): void => {
    const root = document.documentElement;
    const resolved: QuickThemeMode =
        mode === "auto" ? (prefersDarkScheme() ? "dark" : "light") : mode;
    const schemeAttr = mode === "auto" ? "auto" : mode;
    root.setAttribute("data-scheme", schemeAttr);
    root.setAttribute(THEME_ATTR, resolved);
    root.style.colorScheme = resolved;
    try {
        if (document.body) document.body.style.colorScheme = resolved;
    } catch {
        /* ignore */
    }
    try {
        document.querySelectorAll(".env-shell-root, [data-shell], ui-window").forEach((node) => {
            const el = node as HTMLElement;
            el.dataset.theme = resolved;
            el.style.colorScheme = resolved;
            const inner = el.shadowRoot?.querySelector?.(".app-shell") as HTMLElement | null;
            if (inner) {
                inner.dataset.theme = resolved;
                inner.style.colorScheme = resolved;
            }
        });
    } catch {
        /* ignore */
    }
    try {
        localStorage.setItem(THEME_STORAGE_KEY, mode === "auto" ? "auto" : mode);
        localStorage.setItem(THEME_STORAGE_KEY_DOTTED, mode === "auto" ? "auto" : mode);
    } catch {
        /* ignore quota / private mode */
    }
    if (mode !== "auto") {
        mergeThemeIntoSettingsBlobs(mode);
    }
    /* documentElement so Theme/DynamicEngine observers see the same target as WallpaperTheme. */
    root.dispatchEvent(
        new CustomEvent("u2-theme-change", {
            bubbles: true,
            detail: { source: "quick-settings", theme: resolved, preference: mode }
        })
    );
};

/** Stored preference: light | dark | auto (missing → auto on Cap / OS-follow). */
export const getStoredThemePreference = (): QuickThemeMode | "auto" => {
    try {
        const stored = String(localStorage.getItem(THEME_STORAGE_KEY) || "").trim().toLowerCase();
        if (stored === "light" || stored === "dark" || stored === "auto") return stored;
        const dotted = String(localStorage.getItem(THEME_STORAGE_KEY_DOTTED) || "")
            .trim()
            .toLowerCase();
        if (dotted === "light" || dotted === "dark" || dotted === "auto") return dotted;
    } catch {
        /* ignore */
    }
    return "auto";
};

/** Follow OS light/dark when preference is `auto`. Idempotent. */
export const installAutoThemeFollow = (): void => {
    const g = globalThis as typeof globalThis & { __CWSP_AUTO_THEME_FOLLOW__?: boolean };
    if (g.__CWSP_AUTO_THEME_FOLLOW__) return;
    g.__CWSP_AUTO_THEME_FOLLOW__ = true;
    const mq =
        typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    if (!mq) return;
    const sync = () => {
        const pref = getStoredThemePreference();
        if (pref !== "auto") return;
        applyQuickTheme("auto");
    };
    try {
        mq.addEventListener("change", sync);
    } catch {
        try {
            mq.addListener(sync);
        } catch {
            /* ignore */
        }
    }
    /* First paint: if storage says auto (or unset), resolve now. */
    try {
        sync();
    } catch {
        /* ignore */
    }
};

/* */
export const unlockOrientationLock = (unlocked: boolean): void => {
    document.documentElement.style.setProperty("--orientation-lock", unlocked ? "unlocked" : "locked");
    document.documentElement.style.setProperty("--orientation-lock-angle", unlocked ? "0deg" : "90deg");

    void Promise.try(async () => {
        try {
            const orientation = screen.orientation as ScreenOrientation & {
                lock?: (orientation: string) => Promise<void>;
                unlock?: () => void;
            };
            if (unlocked) {
                orientation.unlock?.();
                return;
            }
            // Desktop CRX / Neutralino expose lock() but reject with NotSupportedError.
            if (typeof orientation.lock !== "function") return;
            const locked = orientation.lock(orientation.type || "natural");
            if (locked && typeof locked.catch === "function") await locked.catch(() => {});
        } catch (error) {
            console.warn(error);
        }
    })?.catch?.(console.warn.bind(console));
};

/* ---------------------------------------------------------------------- */
/* Night light / brightness overlay filter (required)                     */
/* ---------------------------------------------------------------------- */

const NIGHT_FILTER_ID = "env-night-filter";
/** Below `CHROME_FLYOUT_Z` (2147483600, ChromeFlyout.ts); above env-shell wallpaper/chrome. */
const NIGHT_FILTER_Z = "2147483001";
const NIGHT_STORAGE_KEY = "rs-night-filter";
const BRIGHTNESS_STORAGE_KEY = "rs-brightness-filter";

const clampPct = (n: number): number => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** Ensure the single fixed overlay div used for both the night-light tint and the brightness stub filter. */
const ensureNightFilterEl = (): HTMLElement => {
    const existing = document.getElementById(NIGHT_FILTER_ID);
    if (existing instanceof HTMLElement) return existing;
    const el = document.createElement("div");
    el.id = NIGHT_FILTER_ID;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = [
        "dynamic-range-limit:no-limit",
        "color-space:display-p3",
        "position:fixed",
        "inset:0",
        "pointer-events:none",
        `z-index:${NIGHT_FILTER_Z}`,
        /* WHY: warm orange + `mix-blend-mode: multiply` reads as a night-light tint without
         * washing out the whole screen the way plain `color` blending would (too harsh). */
        "background-color:color(display-p3 1 0.55 0.24)",
        "mix-blend-mode:multiply",
        "opacity:0",
        "visibility:hidden",
        "transition:opacity 160ms ease"
    ].join(";");
    (document.body ?? document.documentElement).appendChild(el);
    return el;
};

/** value: 0-100 night-light intensity mapped to overlay opacity 0-1. */
export const applyNightFilter = (value: number): void => {
    const v = clampPct(value);
    const el = ensureNightFilterEl();
    const opacity = v / 100;
    el.style.opacity = String(opacity);
    el.style.visibility = opacity >= 0.01 ? "visible" : "hidden";
    try {
        localStorage.setItem(NIGHT_STORAGE_KEY, String(v));
    } catch {
        /* ignore quota / private mode */
    }
};

/** value: 0-100 brightness stub; 50 == neutral (`brightness(1)`), mapped to ~0.4-1.2. */
export const applyBrightnessFilter = (value: number): void => {
    const v = clampPct(value);
    const el = ensureNightFilterEl();
    const brightness = v <= 50 ? 0.4 + (v / 50) * 0.6 : 1 + ((v - 50) / 50) * 0.2;
    //el.style.filter = `brightness(${brightness.toFixed(3)})`;
    try {
        localStorage.setItem(BRIGHTNESS_STORAGE_KEY, String(v));
    } catch {
        /* ignore quota / private mode */
    }
};

const readStoredFilterValue = (key: string, fallback: number): number => {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) ? clampPct(n) : fallback;
    } catch {
        return fallback;
    }
};

/** Restore persisted night/brightness filters; idempotent — safe to call on every panel open. */
export const restoreQuickFilters = (): { night: number; brightness: number } => {
    const night = readStoredFilterValue(NIGHT_STORAGE_KEY, 0);
    const brightness = readStoredFilterValue(BRIGHTNESS_STORAGE_KEY, 50);
    applyNightFilter(night);
    applyBrightnessFilter(brightness);
    return { night, brightness };
};

if (typeof document !== "undefined") {
    // Restore on module load per spec; `wireQuickSettingsPanel` restores again on first open.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => restoreQuickFilters(), { once: true });
    } else {
        restoreQuickFilters();
    }
}

/* ---------------------------------------------------------------------- */
/* Panel wiring (imperative — tiles/sliders are plain DOM, no reactive refs) */
/* ---------------------------------------------------------------------- */

type PlaceholderTileId = "wifi" | "bluetooth" | "focus" | "airplane" | "orientation";
const PLACEHOLDER_TILE_IDS: PlaceholderTileId[] = ["wifi", "bluetooth", "focus", "airplane", "orientation"];

const THEME_TILE_ICON: Record<QuickThemeMode, string> = { light: "sun", dark: "moon" };
const THEME_TILE_SUB: Record<QuickThemeMode, string> = { light: "Light", dark: "Dark" };

const syncThemeTile = (root: ShadowRoot): void => {
    const tile = root.querySelector<HTMLElement>('[data-qs-tile="theme"]');
    if (!tile) return;
    const mode = getCurrentQuickTheme();
    tile.querySelector("ui-icon")?.setAttribute("icon", THEME_TILE_ICON[mode]);
    const sub = tile.querySelector<HTMLElement>("[data-qs-tile-sub]");
    if (sub) sub.textContent = THEME_TILE_SUB[mode];
    tile.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
};

/** One-time wiring for a freshly-rendered panel shadow root (guarded by `data-qs-wired`). */
const wireQuickSettingsPanel = (host: HTMLElement): void => {
    const root = host.shadowRoot;
    const panel = root?.querySelector<HTMLElement>(".qs-panel");
    if (!root || !panel || panel.hasAttribute("data-qs-wired")) return;
    panel.setAttribute("data-qs-wired", "");

    syncThemeTile(root);
    root.querySelector('[data-qs-tile="theme"]')?.addEventListener("click", () => {
        const next: QuickThemeMode = getCurrentQuickTheme() === "dark" ? "light" : "dark";
        applyQuickTheme(next);
        syncThemeTile(root);
    });

    const isPressed = (target: HTMLElement): boolean => Boolean(target?.getAttribute?.("aria-pressed")) && (target?.getAttribute?.("aria-pressed") === "true");
    const setPressed = (target: HTMLElement, pressed: boolean): void => target?.setAttribute?.("aria-pressed", String(pressed));

    root.querySelector?.('[data-qs-tile="orientation"]')?.addEventListener?.("click", (ev) => {
        const realTarget = MOCElement((ev?.target?.matches?.('[data-qs-tile="orientation"]') ? ev?.target as HTMLElement : ev?.target?.querySelector?.('[data-qs-tile="orientation"]')) || ev?.target, '[data-qs-tile="orientation"]');
        const isUnlocking = isPressed(realTarget as HTMLElement);
        unlockOrientationLock(isUnlocking);
        
        const icon = realTarget?.matches?.('ui-icon') ? realTarget as HTMLElement : realTarget?.querySelector?.('ui-icon');
        if (icon) icon.setAttribute?.("icon", !isUnlocking ? "lock" : "device-rotate");
        if (icon) icon.setAttribute?.("icon-style", "duotone");
    });

    for (const id of PLACEHOLDER_TILE_IDS) {
        const tile = root.querySelector<HTMLElement>(`[data-qs-tile="${id}"]`);
        if (!tile) continue;
        tile.addEventListener("click", () => {
            const next = tile.getAttribute("aria-pressed") !== "true";
            tile.setAttribute("aria-pressed", String(next));
            const sub = tile.querySelector<HTMLElement>("[data-qs-tile-sub]");
            if (sub) sub.textContent = next ? "On" : "Off";
        });
    }

    const { night, brightness } = restoreQuickFilters();
    const nightSlider = root.querySelector<HTMLInputElement>('[data-qs-slider="night"]');
    const brightnessSlider = root.querySelector<HTMLInputElement>('[data-qs-slider="brightness"]');
    if (nightSlider) {
        nightSlider.value = String(night);
        nightSlider.addEventListener("input", () => applyNightFilter(nightSlider.valueAsNumber));
    }
    if (brightnessSlider) {
        brightnessSlider.value = String(brightness);
        brightnessSlider.addEventListener("input", () => applyBrightnessFilter(brightnessSlider.valueAsNumber));
    }

    const openShellView = (view: "settings" | "explorer"): void => {
        closeQuickSettingsFlyout();
        const run = (): void => {
            const opener = getSpeedDialViewOpener();
            if (typeof opener === "function") {
                opener(view, {});
                return;
            }
            const hash = `#${view}`;
            if (typeof location !== "undefined" && location.hash !== hash) navigate(hash);
        };
        /* WHY: close the flyout first so the new env window is not covered / dismissed. */
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
        else scheduler?.yield?.()?.then?.(run);
    };
    root.querySelectorAll<HTMLElement>("[data-qs-open]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const view = String(btn.getAttribute("data-qs-open") || "").trim();
            if (view === "settings" || view === "explorer") openShellView(view);
        });
    });
};

/* ---------------------------------------------------------------------- */
/* Custom element                                                          */
/* ---------------------------------------------------------------------- */

/**
 * Win11-like Quick Settings flyout: theme toggle + placeholder tiles + night/brightness sliders.
 *
 * INVARIANT: instance `open()`/`close()`/`toggle()` only flip local visibility state
 * (`hidden` + `open` attribute) — the shared exclusivity/singleton/positioning contract
 * lives in the module-level {@link toggleQuickSettingsFlyout} / {@link closeQuickSettingsFlyout}
 * helpers, which wrap `ChromeFlyout` (mirrors `CalendarFlyout.ts`).
 */
// @ts-ignore
@defineElement("ui-quick-settings")
export class QuickSettings extends UIElement {
    constructor() { super(); }

    //
    styles = () => styled;
    render = () => H`
<div class="qs-panel" part="panel" role="menu" aria-label="Quick settings">
    <div class="qs-tiles" part="tiles" role="group" aria-label="Quick toggles">
        <button type="button" class="qs-tile qs-tile--theme" part="tile" data-qs-tile="theme" role="menuitemcheckbox" aria-pressed="false" title="Theme">
            <ui-icon class="qs-tile-icon" part="tile-icon" icon="moon" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-tile-text">
                <span class="qs-tile-label">Theme</span>
                <span class="qs-tile-sub" data-qs-tile-sub>Dark</span>
            </span>
        </button>
        <button type="button" class="qs-tile" part="tile" data-qs-tile="wifi" role="menuitemcheckbox" aria-pressed="true" title="Wi-Fi">
            <ui-icon class="qs-tile-icon" part="tile-icon" icon="wifi-high" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-tile-text">
                <span class="qs-tile-label">Wi-Fi</span>
                <span class="qs-tile-sub" data-qs-tile-sub>On</span>
            </span>
        </button>
        <button type="button" class="qs-tile" part="tile" data-qs-tile="bluetooth" role="menuitemcheckbox" aria-pressed="true" title="Bluetooth">
            <ui-icon class="qs-tile-icon" part="tile-icon" icon="bluetooth" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-tile-text">
                <span class="qs-tile-label">Bluetooth</span>
                <span class="qs-tile-sub" data-qs-tile-sub>On</span>
            </span>
        </button>
        <button type="button" class="qs-tile" part="tile" data-qs-tile="focus" role="menuitemcheckbox" aria-pressed="false" title="Focus assist">
            <ui-icon class="qs-tile-icon" part="tile-icon" icon="bell-slash" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-tile-text">
                <span class="qs-tile-label">Focus assist</span>
                <span class="qs-tile-sub" data-qs-tile-sub>Off</span>
            </span>
        </button>
        <button type="button" class="qs-tile" part="tile" data-qs-tile="airplane" role="menuitemcheckbox" aria-pressed="false" title="Airplane mode">
            <ui-icon class="qs-tile-icon" part="tile-icon" icon="airplane" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-tile-text">
                <span class="qs-tile-label">Airplane mode</span>
                <span class="qs-tile-sub" data-qs-tile-sub>Off</span>
            </span>
        </button>
        <button type="button" class="qs-tile qs-tile--orientation" part="tile" data-qs-tile="orientation" role="menuitemcheckbox" aria-pressed="true" title="Orientation lock">
            <ui-icon class="qs-tile-icon" part="tile-icon" icon="lock" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-tile-text">
                <span class="qs-tile-label">Orientation lock</span>
                <span class="qs-tile-sub" data-qs-tile-sub>On</span>
            </span>
        </button>
    </div>
    <div class="qs-sliders" part="sliders">
        <label class="qs-slider-row" part="slider-row">
            <ui-icon class="qs-slider-icon" part="slider-icon" icon="moon-stars" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-slider-col">
                <span class="qs-slider-label">Night light</span>
                <input class="qs-slider" part="slider" type="range" min="0" max="100" step="1" value="0" data-qs-slider="night" aria-label="Night light" />
            </span>
        </label>
        <label class="qs-slider-row" part="slider-row">
            <ui-icon class="qs-slider-icon" part="slider-icon" icon="sun-dim" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span class="qs-slider-col">
                <span class="qs-slider-label">Brightness</span>
                <input class="qs-slider" part="slider" type="range" min="0" max="100" step="1" value="50" data-qs-slider="brightness" aria-label="Brightness" />
            </span>
        </label>
    </div>
    <div class="qs-footer" part="footer" role="group" aria-label="Open apps">
        <button type="button" class="qs-footer-btn" part="footer-btn" data-qs-open="explorer" role="menuitem" title="Explorer">
            <ui-icon class="qs-footer-icon" icon="books" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span>Explorer</span>
        </button>
        <button type="button" class="qs-footer-btn" part="footer-btn" data-qs-open="settings" role="menuitem" title="Settings">
            <ui-icon class="qs-footer-icon" icon="gear-six" icon-style="duotone" aria-hidden="true"></ui-icon>
            <span>Settings</span>
        </button>
    </div>
</div>`;

    //
    onRender(): this {
        super.onRender();
        wireQuickSettingsPanel(this);
        return this;
    }

    open(): void {
        syncThemeTile(this.shadowRoot as ShadowRoot);
        this.removeAttribute("hidden");
        this.hidden = false;
        this.setAttribute("open", "");
    }

    close(): void {
        this.hidden = true;
        this.setAttribute("hidden", "");
        this.removeAttribute("open");
    }

    toggle(anchor?: HTMLElement | null): void {
        void anchor; // reserved — positioning is owned by the module-level chrome helpers below.
        if (this.hasAttribute("open")) this.close();
        else this.open();
    }
}

export default QuickSettings;

/* ---------------------------------------------------------------------- */
/* Singleton mount + ChromeFlyout exclusive registry                       */
/* ---------------------------------------------------------------------- */

let singleton: QuickSettings | null = null;

/** Mount (once) the singleton `<ui-quick-settings>` into the shared overlay root. */
function ensureQuickSettingsElement(): QuickSettings {
    if (singleton?.isConnected) return singleton;
    const overlayRoot = ensureOverlayRoot();
    let el = overlayRoot.querySelector<QuickSettings>("ui-quick-settings");
    if (!el) {
        el = document.createElement("ui-quick-settings") as QuickSettings;
        el.hidden = true;
        overlayRoot.appendChild(el);
    }
    singleton = el;
    return el;
}

/** Toggle the shared Quick Settings flyout, wired through `ChromeFlyout`'s exclusive-open contract. */
export function toggleQuickSettingsFlyout(anchor?: HTMLElement | null): void {
    toggleChromeFlyout(FLYOUT_KIND, (): ChromeFlyoutController => {
        const el = ensureQuickSettingsElement();
        const pinned = document.documentElement.getAttribute("data-theme");
        if (pinned === "light" || pinned === "dark") {
            el.dataset.theme = pinned;
            el.style.colorScheme = pinned;
        }
        positionFlyout(el, FLYOUT_KIND, { anchor });
        el.open();
        return {
            kind: FLYOUT_KIND,
            el,
            close: () => {
                el.close();
                closeChromeFlyout(FLYOUT_KIND);
            },
            contains: (node) => node instanceof Node && el.contains(node)
        };
    });
}

/** Close the Quick Settings flyout if open (no-op otherwise). */
export function closeQuickSettingsFlyout(): void {
    closeChromeFlyout(FLYOUT_KIND);
}

/** Whether the Quick Settings flyout is currently open. */
export function isQuickSettingsOpen(): boolean {
    return isChromeFlyoutOpen(FLYOUT_KIND);
}

Promise.try(() => {
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => {
        void Promise.try(async () => {
            const lock = screen?.orientation?.lock;
            if (typeof lock !== "function") return;
            // Desktop CRX / browsers expose lock() but reject with NotSupportedError.
            const locked = lock.call(screen.orientation, "natural");
            if (locked && typeof locked.catch === "function") await locked.catch(() => {});
        }).catch(() => {});
    });
}).catch(() => {});

/* WHY: Cap/Android auto theme must repaint when the system light↔dark flips. */
try {
    installAutoThemeFollow();
} catch {
    /* ignore */
}