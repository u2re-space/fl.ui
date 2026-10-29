/*
 * Filename: native-window-chrome.ts
 * FullPath: modules/projects/fl.ui/src/ui/containers/window/native-window-chrome.ts
 * Change date and time: 09.45.00_29.07.2026
 * Reason for changes: Probe WCO + display-mode for ui-window native-mode.
 */
/**
 * WHY: `native-mode` on `<ui-window>` must know whether OS Window Controls Overlay /
 * standalone display-mode can own min/max/close + window drag, or whether to fall back
 * to full-bleed in-tab maximize with custom chrome.
 *
 * Specs:
 * - https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API
 * - https://drafts.csswg.org/css-ui-4/#window-drag
 * - https://chromestatus.com/feature/5201338641285120
 */

export type NativeDisplayMode =
    | "browser"
    | "standalone"
    | "fullscreen"
    | "minimal-ui"
    | "window-controls-overlay"
    | "unknown";

export type NativeWindowChromeProbe = {
    /** Attribute `native-mode` is requested by host. */
    requested: boolean;
    /** `navigator.windowControlsOverlay.visible` (installed desktop PWA). */
    wcoVisible: boolean;
    displayMode: NativeDisplayMode;
    /** Geometry of the titlebar area when WCO is visible. */
    titlebarRect: { x: number; y: number; width: number; height: number } | null;
    /** Installed-like display (standalone / fullscreen / WCO). */
    isStandaloneLike: boolean;
    /**
     * Effective native surface:
     * - `wco` → hide custom min/max/close; use window-drag
     * - `standalone` → mobile/desktop installed, stretch; limited custom chrome
     * - `fallback` → normal tab; full-bleed + keep custom buttons
     * - `off` → native-mode not requested
     */
    surface: "off" | "wco" | "standalone" | "fallback";
};

type WindowControlsOverlayLike = {
    visible?: boolean;
    getTitlebarAreaRect?: () => DOMRect;
    addEventListener?: (type: string, listener: EventListener, options?: AddEventListenerOptions) => void;
    removeEventListener?: (type: string, listener: EventListener, options?: EventListenerOptions) => void;
};

function readWco(): WindowControlsOverlayLike | null {
    try {
        const nav = globalThis.navigator as Navigator & {
            windowControlsOverlay?: WindowControlsOverlayLike;
        };
        return nav?.windowControlsOverlay ?? null;
    } catch {
        return null;
    }
}

let cachedDisplayMode: NativeDisplayMode | null = null;

function matchDisplayMode(): NativeDisplayMode {
    if (cachedDisplayMode) return cachedDisplayMode;
    if (typeof globalThis.matchMedia !== "function") return "unknown";
    try {
        if (globalThis.matchMedia("(display-mode: window-controls-overlay)").matches) {
            return (cachedDisplayMode = "window-controls-overlay");
        }
        if (globalThis.matchMedia("(display-mode: fullscreen)").matches) {
            return (cachedDisplayMode = "fullscreen");
        }
        if (globalThis.matchMedia("(display-mode: standalone)").matches) {
            return (cachedDisplayMode = "standalone");
        }
        if (globalThis.matchMedia("(display-mode: minimal-ui)").matches) {
            return (cachedDisplayMode = "minimal-ui");
        }
        if (globalThis.matchMedia("(display-mode: browser)").matches) {
            return (cachedDisplayMode = "browser");
        }
    } catch {
        /* ignore */
    }
    return (cachedDisplayMode = "unknown");
}

function readTitlebarRect(wco: WindowControlsOverlayLike | null): NativeWindowChromeProbe["titlebarRect"] {
    if (!wco?.visible || typeof wco.getTitlebarAreaRect !== "function") return null;
    try {
        const r = wco.getTitlebarAreaRect();
        if (!r) return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    } catch {
        return null;
    }
}

/**
 * Snapshot of native chrome capability for a host that requested `native-mode`.
 */
export function probeNativeWindowChrome(requested: boolean): NativeWindowChromeProbe {
    const wco = readWco();
    const wcoVisible = Boolean(wco?.visible);
    const displayMode = matchDisplayMode();
    const isStandaloneLike =
        wcoVisible ||
        displayMode === "standalone" ||
        displayMode === "fullscreen" ||
        displayMode === "window-controls-overlay" ||
        displayMode === "minimal-ui";

    let surface: NativeWindowChromeProbe["surface"] = "off";
    if (requested) {
        if (wcoVisible) surface = "wco";
        else if (isStandaloneLike) surface = "standalone";
        else surface = "fallback";
    }

    return {
        requested,
        wcoVisible,
        displayMode,
        titlebarRect: readTitlebarRect(wco),
        isStandaloneLike,
        surface
    };
}

export type NativeChromeSubscribeOptions = {
    /** Fired on WCO geometrychange + display-mode media changes. */
    onChange: (probe: NativeWindowChromeProbe) => void;
    /** Whether host currently wants native-mode. */
    getRequested: () => boolean;
};

/**
 * Subscribe to WCO + display-mode changes. Returns dispose.
 */
export function subscribeNativeWindowChrome(options: NativeChromeSubscribeOptions): () => void {
    const emit = (): void => {
        cachedDisplayMode = null;
        options.onChange(probeNativeWindowChrome(options.getRequested()));
    };

    const mqs: MediaQueryList[] = [];
    if (typeof globalThis.matchMedia === "function") {
        for (const q of [
            "(display-mode: window-controls-overlay)",
            "(display-mode: standalone)",
            "(display-mode: fullscreen)",
            "(display-mode: minimal-ui)",
            "(display-mode: browser)"
        ]) {
            try {
                mqs.push(globalThis.matchMedia(q));
            } catch {
                /* ignore */
            }
        }
    }

    const onMq = (): void => emit();
    for (const mq of mqs) {
        try {
            mq.addEventListener?.("change", onMq);
        } catch {
            try {
                (mq as MediaQueryList & { addListener?: (fn: () => void) => void }).addListener?.(onMq);
            } catch {
                /* ignore */
            }
        }
    }

    const wco = readWco();
    const onGeo = (): void => emit();
    try {
        wco?.addEventListener?.("geometrychange", onGeo);
    } catch {
        /* ignore */
    }

    scheduler?.yield?.()?.then?.(emit);

    return () => {
        for (const mq of mqs) {
            try {
                mq.removeEventListener?.("change", onMq);
            } catch {
                try {
                    (mq as MediaQueryList & { removeListener?: (fn: () => void) => void }).removeListener?.(onMq);
                } catch {
                    /* ignore */
                }
            }
        }
        try {
            wco?.removeEventListener?.("geometrychange", onGeo);
        } catch {
            /* ignore */
        }
    };
}
