/*
 * Filename: mount-ui-window.ts
 * FullPath: modules/shells/environment-shell/src/mount-ui-window.ts
 * Change date and time: 23.10.00_23.08.2026
 * Reason for changes: One applyChrome on mount; cache z-boost so open does not force layout.
 * FIND:mobile-dock
 * TAG:hang-open
 */
/**
 * WHY: Replaces `.wf-frame` / {@link mountWindowFrame} for environment-shell floating views.
 * Keeps {@link WindowChromeModel} as the reactive bounds source; chrome is `ui-window`.
 *
 * INVARIANT: With `managed`, Windows2 only emits intents (`window-maximize` / `minimize` /
 * `restore` / `close` / `window-native` / `window-exit-native`). This module applies attrs +
 * geometry and notifies the tasking layer.
 */
import { booleanRef, effect } from "@fest-lib/object";
import { Windows2 } from "@fest-lib/fl-ui";
import type { WindowChromeModel } from "../frame/window-shell.js";

void Windows2;

function isNativeCapacitorShell(): boolean {
    try {
        if (document.documentElement.dataset.cwspNativeShell === "capacitor") return true;
        const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        return typeof c?.isNativePlatform === "function" && Boolean(c.isNativePlatform());
    } catch {
        return false;
    }
}

let zBoostCache: { shell: HTMLElement; n: number } | null = null;

/** When mounted under `.env-shell-root`, add this boost so windows stack above the home layer. */
export function readEnvWindowZBoost(host: HTMLElement | null | undefined): number {
    const shell = host?.closest?.(".env-shell-root") ?? host?.closest?.("env-shell-container");
    if (!(shell instanceof HTMLElement)) return 0;
    if (zBoostCache?.shell === shell) return zBoostCache.n;
    const inline = shell.style.getPropertyValue("--env-window-z-boost").trim();
    const raw = inline || getComputedStyle(shell).getPropertyValue("--env-window-z-boost").trim();
    const n = Number.parseInt(raw, 10);
    const val = Number.isFinite(n) ? n : 0;
    zBoostCache = { shell, n: val };
    return val;
}

function resolveEnvShellRoot(host: HTMLElement): HTMLElement | null {
    const shell =
        host.closest?.(".env-shell-root") ??
        host.closest?.("env-shell-container") ??
        document.querySelector?.(".env-shell-root, env-shell-container");
    return shell instanceof HTMLElement ? shell : null;
}

/** Sync host `data-env-native-task` when any managed window is in nativeMode. */
function syncEnvNativeTaskAttr(host: HTMLElement): void {
    const root = resolveEnvShellRoot(host);
    if (!root) return;
    const anyNative = Boolean(
        root.querySelector?.("ui-window[native-mode], ui-window[data-native-active]")
    );
    root.toggleAttribute("data-env-native-task", anyNative);
}

export type MountUiWindowOptions = {
    onClose?: () => void;
    /** Fired after minimize / maximize / restore / native so taskbar can refresh. */
    onChromeChange?: () => void;
    /**
     * Stamped as `data-ui-window-view` (and COMPAT `data-wf-managed-view`) so hosts can
     * detect orphaned chrome after workspace remounts.
     */
    managedViewKey?: string;
    /** When true, start already in native-mode (mono `/explorer?native=1`). */
    startNative?: boolean;
};

/**
 * Mounts a managed `<ui-window>` around `content`, wiring model bounds + chrome events.
 */
export function mountUiWindow(
    host: HTMLElement,
    model: WindowChromeModel,
    content: HTMLElement,
    onFocus: () => void,
    options: MountUiWindowOptions = {}
): () => void {
    const { bounds, z, maximizedMobile, minimized, desktopMaximized, visible, isMobileMq } = model;
    // COMPAT: older chrome models may lack nativeMode until createChromeModel refresh.
    if (!model.nativeMode) {
        model.nativeMode = booleanRef(Boolean(options.startNative));
    }
    const nativeMode = model.nativeMode;
    if (options.startNative) nativeMode.value = true;

    const win = document.createElement("ui-window") as Windows2 & HTMLElement;
    win.setAttribute("managed", "");
    win.className = "env-ui-window";
    win.setAttribute("part", "window");
    /* WHY: Pin app theme so window light-dark() tokens do not follow OS while html is light. */
    {
        const pinned =
            document.documentElement.getAttribute("data-theme") ||
            document.documentElement.style.colorScheme ||
            "";
        if (pinned === "light" || pinned === "dark") {
            win.dataset.theme = pinned;
            win.style.colorScheme = pinned;
        }
    }

    const titleEl = document.createElement("span");
    titleEl.slot = "title";
    titleEl.className = "env-ui-window__title";
    titleEl.textContent = model.title;

    content.slot = "content";
    content.classList.add("env-ui-window__body");

    win.append(titleEl, content);
    host.appendChild(win);

    const managedKey = String(options?.managedViewKey ?? "").trim();
    if (managedKey) {
        win.setAttribute("data-ui-window-view", managedKey);
        // COMPAT: older selectors still look for data-wf-managed-view.
        win.setAttribute("data-wf-managed-view", managedKey);
    }

    let savedDesktop: { x: number; y: number; w: number; h: number } | null = null;

    const notifyChrome = (): void => {
        options.onChromeChange?.();
        syncEnvNativeTaskAttr(host);
    };

    const clearDeskMaxInline = (): void => {
        win.style.right = "";
        win.style.bottom = "";
    };

    const applyDeskMaxGeometry = (): void => {
        win.style.left = "0";
        win.style.top = "0";
        win.style.right = "0";
        win.style.bottom = "var(--env-shell-chrome-stack-reserve, 2.5rem)";
        win.style.width = "auto";
        win.style.height = "auto";
        win.style.removeProperty("--ui-win-width");
        win.style.removeProperty("--ui-win-height");
    };

    const applyNativeGeometry = (): void => {
        win.style.left = "0";
        win.style.top = "0";
        win.style.right = "0";
        win.style.bottom = "0";
        win.style.width = "100%";
        win.style.height = "100%";
        win.style.removeProperty("--ui-win-width");
        win.style.removeProperty("--ui-win-height");
    };

    const applyChrome = (): void => {
        const mqMobile = Boolean(isMobileMq.matches);
        const zBoost = readEnvWindowZBoost(host);
        const zNow = (z.value ?? 10) + zBoost;
        win.style.zIndex = String(zNow);

        // WHY: phone/tablet — mobile-max when showing; never wipe `minimized` (Home collapse).
        if (mqMobile) {
            if (desktopMaximized.value) desktopMaximized.value = false;
            if (!minimized.value && !nativeMode.value && !maximizedMobile.value) {
                maximizedMobile.value = true;
            }
        }

        const isNative = Boolean(nativeMode.value);
        const isMin = Boolean(minimized.value);
        const isDeskMax = !mqMobile && Boolean(desktopMaximized.value) && !isNative && !isMin;
        const isMobMax = mqMobile && !isNative && !isMin;

        // WHY: title spacer under transparent overlay status; standalone mobile has no titlebar.
        const shellEl =
            host.closest?.(".env-shell-root") ??
            host.closest?.("env-shell-container") ??
            document.querySelector?.(".env-shell-root, env-shell-container");
        const statusOverlay =
            (shellEl instanceof HTMLElement && shellEl.hasAttribute("data-status-overlay")) ||
            document.documentElement.hasAttribute("data-env-status-overlay");
        const standalone =
            (shellEl instanceof HTMLElement && shellEl.hasAttribute("data-standalone")) ||
            document.documentElement.hasAttribute("data-env-standalone");
        const statusGap = statusOverlay && !isNative && !isMin && (isMobMax || isDeskMax);
        const nativeCapacitor = isNativeCapacitorShell();
        const noTitlebar =
            (standalone && mqMobile && !isNative && !isMin) ||
            (nativeCapacitor && mqMobile && !isNative && !isMin);

        win.toggleAttribute("native-mode", isNative && !isMin);
        win.toggleAttribute("minimized", isMin);
        win.toggleAttribute("data-mobile-max", isMobMax);
        win.toggleAttribute("data-desk-max", isDeskMax);
        win.toggleAttribute("data-status-gap", statusGap);
        win.toggleAttribute("data-no-titlebar", noTitlebar);
        win.toggleAttribute("maximized", !isMin && (isDeskMax || isMobMax || isNative));

        if (isMin) {
            win.setVisible(false);
            syncEnvNativeTaskAttr(host);
            return;
        }

        win.setVisible(Boolean(visible.value));
        if (!visible.value) {
            syncEnvNativeTaskAttr(host);
            return;
        }

        if (isNative) {
            applyNativeGeometry();
            syncEnvNativeTaskAttr(host);
            return;
        }

        if (isMobMax) {
            win.style.left = "0";
            win.style.top = "0";
            win.style.right = "0";
            // WHY: mobile Home is a floating FAB — a dock reserve painted a dead strip under Settings/Explorer.
            win.style.bottom = "0";
            win.style.width = "100%";
            win.style.height = "auto";
            syncEnvNativeTaskAttr(host);
            return;
        }

        if (isDeskMax) {
            applyDeskMaxGeometry();
            syncEnvNativeTaskAttr(host);
            return;
        }

        clearDeskMaxInline();
        win.applyBounds({
            x: bounds.x.value,
            y: bounds.y.value,
            w: bounds.w.value,
            h: bounds.h.value,
            z: zNow
        });
        syncEnvNativeTaskAttr(host);
    };

    const onMq = (): void => {
        if (isMobileMq.matches) {
            if (!nativeMode.value) maximizedMobile.value = true;
            if (desktopMaximized.value) {
                desktopMaximized.value = false;
                if (savedDesktop) {
                    bounds.x.value = savedDesktop.x;
                    bounds.y.value = savedDesktop.y;
                    bounds.w.value = savedDesktop.w;
                    bounds.h.value = savedDesktop.h;
                    savedDesktop = null;
                }
            }
        }
        applyChrome();
        notifyChrome();
    };

    /* WHY: set mobile-max before the effect so the first applyChrome is the only one. */
    if (isMobileMq.matches && !nativeMode.value && !minimized.value) {
        maximizedMobile.value = true;
    }

    const stopFx = effect(
        () => {
            applyChrome();
        },
        [
            bounds.x,
            bounds.y,
            bounds.w,
            bounds.h,
            z,
            maximizedMobile,
            minimized,
            desktopMaximized,
            nativeMode,
            visible
        ],
        { triggerImmediately: true }
    );

    isMobileMq.addEventListener("change", onMq);

    const onChromeSurface = (): void => {
        applyChrome();
        notifyChrome();
    };
    const surfaceRoot =
        host.closest?.(".env-shell-root") ??
        host.closest?.("env-shell-container") ??
        document.documentElement;
    surfaceRoot?.addEventListener?.("env-chrome-surface", onChromeSurface);

    const onWinFocus = (): void => {
        // WHY: Focusing a minimized window restores it (taskbar / click-through).
        if (minimized.value) {
            minimized.value = false;
            visible.value = true;
        }
        onFocus();
        const zBoost = readEnvWindowZBoost(host);
        const zNow = (z.value ?? 10) + zBoost;
        if (typeof (win as Windows2).bringToFront === "function") {
            (win as Windows2).bringToFront(zNow);
        } else {
            win.style.zIndex = String(zNow);
            win.toggleAttribute("data-focused", true);
        }
        notifyChrome();
    };

    const onWinMove = (ev: Event): void => {
        const detail = (ev as CustomEvent<{ x?: number; y?: number }>).detail;
        if (nativeMode.value || desktopMaximized.value || maximizedMobile.value || minimized.value) {
            return;
        }
        if (typeof detail?.x === "number") bounds.x.value = detail.x;
        if (typeof detail?.y === "number") bounds.y.value = detail.y;
    };

    const onWinResize = (ev: Event): void => {
        const detail = (ev as CustomEvent<{ w?: number; h?: number }>).detail;
        if (nativeMode.value || desktopMaximized.value || maximizedMobile.value || minimized.value) {
            return;
        }
        if (typeof detail?.w === "number") bounds.w.value = detail.w;
        if (typeof detail?.h === "number") bounds.h.value = detail.h;
    };

    const onWinMinimize = (): void => {
        // WHY: desktop title chrome + mobile Home both collapse via minimized (not dispose).
        if (nativeMode.value) {
            nativeMode.value = false;
        }
        if (desktopMaximized.value) {
            desktopMaximized.value = false;
            if (savedDesktop) {
                bounds.x.value = savedDesktop.x;
                bounds.y.value = savedDesktop.y;
                bounds.w.value = savedDesktop.w;
                bounds.h.value = savedDesktop.h;
                savedDesktop = null;
            }
        }
        minimized.value = true;
        applyChrome();
        notifyChrome();
    };

    const onWinMaximize = (): void => {
        // WHY: from native, maximize/restore exits native.
        if (nativeMode.value) {
            onWinExitNative();
            return;
        }
        if (isMobileMq.matches) {
            // WHY: mobile windows stay maximized; no promote-to-native via chrome.
            minimized.value = false;
            maximizedMobile.value = true;
            applyChrome();
            notifyChrome();
            return;
        }
        if (minimized.value) minimized.value = false;
        // Desktop: maximize once → desk max. Second maximize intent restores (title chrome
        // emits window-restore when already max). Accidental window-maximize while desk-max
        // also restores — native full-bleed is via explicit window-native / dblclick paths.
        if (desktopMaximized.value) {
            onWinRestore();
            return;
        }
        savedDesktop = {
            x: bounds.x.value,
            y: bounds.y.value,
            w: bounds.w.value,
            h: bounds.h.value
        };
        desktopMaximized.value = true;
        applyChrome();
        notifyChrome();
    };

    const onWinNative = (): void => {
        if (minimized.value) {
            minimized.value = false;
            visible.value = true;
        }
        if (!nativeMode.value && !desktopMaximized.value && !maximizedMobile.value) {
            savedDesktop = {
                x: bounds.x.value,
                y: bounds.y.value,
                w: bounds.w.value,
                h: bounds.h.value
            };
        }
        desktopMaximized.value = false;
        maximizedMobile.value = false;
        nativeMode.value = true;
        applyChrome();
        notifyChrome();
    };

    const onWinExitNative = (): void => {
        if (!nativeMode.value) return;
        nativeMode.value = false;
        if (savedDesktop) {
            bounds.x.value = savedDesktop.x;
            bounds.y.value = savedDesktop.y;
            bounds.w.value = savedDesktop.w;
            bounds.h.value = savedDesktop.h;
            savedDesktop = null;
        }
        if (isMobileMq.matches) {
            maximizedMobile.value = true;
        }
        applyChrome();
        notifyChrome();
    };

    const onWinRestore = (): void => {
        if (nativeMode.value) {
            onWinExitNative();
            return;
        }
        // WHY: restore clears minimize and/or desk/mobile maximize back to saved bounds.
        if (minimized.value) {
            minimized.value = false;
            visible.value = true;
        }
        if (isMobileMq.matches) {
            if (maximizedMobile.value) maximizedMobile.value = false;
        } else if (desktopMaximized.value) {
            desktopMaximized.value = false;
            if (savedDesktop) {
                bounds.x.value = savedDesktop.x;
                bounds.y.value = savedDesktop.y;
                bounds.w.value = savedDesktop.w;
                bounds.h.value = savedDesktop.h;
                savedDesktop = null;
            }
        }
        applyChrome();
        notifyChrome();
    };

    // WHY: onClose → disposeFrame re-enters this cleanup; guard so close/max never double-fires teardown.
    let closing = false;
    let disposed = false;

    const onWinClose = (ev: Event): void => {
        // WHY: preventDefault = "shell owns managed map"; Windows2 still removes the node.
        ev.preventDefault();
        if (closing || disposed) return;
        closing = true;
        try {
            if (nativeMode.value) nativeMode.value = false;
            visible.value = false;
            options.onClose?.();
        } catch (err) {
            console.error("[mount-ui-window] onClose failed", err);
        } finally {
            // Guarantee DOM teardown even if onClose/disposeFrame threw or no-oped.
            if (!disposed) {
                disposed = true;
                stopFx?.();
                isMobileMq.removeEventListener("change", onMq);
                surfaceRoot?.removeEventListener?.("env-chrome-surface", onChromeSurface);
                try {
                    if (win.isConnected) win.remove();
                } catch {
                    /* already detached */
                }
            }
            syncEnvNativeTaskAttr(host);
        }
    };

    /**
     * WHY: Dual-path chrome. Windows2 owns primary handlers; shell also stamps shadow
     * button properties and keeps a host bubble fallback so desk max/min/close cannot die
     * when lure replaces shadow nodes or click synthesis fails.
     */
    let lastShellChromeAt = 0;
    const consumeShellChrome = (): boolean => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastShellChromeAt < 280) return false;
        lastShellChromeAt = now;
        return true;
    };

    const runShellChrome = (which: "minimize" | "maximize" | "close" | "exit-native"): void => {
        if (closing || disposed) return;
        if (!consumeShellChrome()) return;
        if (which === "close") {
            onWinClose(new Event("window-close", { cancelable: true }));
            return;
        }
        if (which === "exit-native") {
            onWinExitNative();
            return;
        }
        if (which === "maximize") {
            if (nativeMode.value || desktopMaximized.value || maximizedMobile.value) onWinRestore();
            else onWinMaximize();
            return;
        }
        if (minimized.value) onWinRestore();
        else onWinMinimize();
    };

    const hitTitleControl = (
        ev: Event
    ): "minimize" | "maximize" | "close" | "exit-native" | null => {
        const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
        for (const n of path) {
            if (!(n instanceof Element)) continue;
            const action = n.getAttribute?.("data-ui-win-action");
            if (action === "close" || action === "exit-native" || action === "maximize" || action === "minimize") {
                return action;
            }
            if (n.matches?.(".title-close")) return "close";
            if (n.matches?.(".title-exit-native")) return "exit-native";
            if (n.matches?.(".title-maximize")) return "maximize";
            if (n.matches?.(".title-minimize")) return "minimize";
        }
        return null;
    };

    const onHostControlBubble = (ev: Event): void => {
        if (closing || disposed) return;
        // WHY: Windows2 may preventDefault after handling — skip duplicate only then.
        if ((ev as Event & { defaultPrevented?: boolean }).defaultPrevented) return;
        const which = hitTitleControl(ev);
        if (!which) return;
        ev.preventDefault();
        ev.stopPropagation();
        runShellChrome(which);
    };

    /** Nuclear path: bind live shadow buttons from the shell (open shadow). */
    let chromeMo: MutationObserver | null = null;
    const stampShellButtonHandlers = (): void => {
        const root = win.shadowRoot;
        if (!root || closing || disposed) return;
        const nodes = root.querySelectorAll<HTMLButtonElement>("[data-ui-win-action], .title-minimize, .title-maximize, .title-close, .title-exit-native");
        for (const btn of nodes) {
            let which = btn.getAttribute("data-ui-win-action") as
                | "minimize"
                | "maximize"
                | "close"
                | "exit-native"
                | null;
            if (!which) {
                if (btn.classList.contains("title-close")) which = "close";
                else if (btn.classList.contains("title-exit-native")) which = "exit-native";
                else if (btn.classList.contains("title-maximize")) which = "maximize";
                else if (btn.classList.contains("title-minimize")) which = "minimize";
            }
            if (!which) continue;
            btn.setAttribute("data-ui-win-action", which);
            const action = which;
            // Mark so we can detect re-created nodes (property identity changes with the node).
            const run = (ev: Event): void => {
                // If Windows2 already consumed this gesture, defaultPrevented is set.
                if ((ev as Event & { defaultPrevented?: boolean }).defaultPrevented) return;
                ev.preventDefault();
                ev.stopPropagation();
                runShellChrome(action);
            };
            btn.onclick = run;
            btn.onpointerup = (ev: PointerEvent) => {
                if (ev.button !== 0) return;
                run(ev);
            };
        }
    };

    stampShellButtonHandlers();
    scheduler?.yield?.()?.then?.(stampShellButtonHandlers);
    requestAnimationFrame(stampShellButtonHandlers);
    if (typeof MutationObserver !== "undefined") {
        chromeMo = new MutationObserver(() => stampShellButtonHandlers());
        const observeRoot = (): void => {
            if (win.shadowRoot) chromeMo?.observe(win.shadowRoot, { childList: true, subtree: true });
            else requestAnimationFrame(observeRoot);
        };
        observeRoot();
    }

    win.addEventListener("window-focus", onWinFocus);
    win.addEventListener("window-move", onWinMove);
    win.addEventListener("window-resize", onWinResize);
    win.addEventListener("window-minimize", onWinMinimize);
    win.addEventListener("window-maximize", onWinMaximize);
    win.addEventListener("window-restore", onWinRestore);
    win.addEventListener("window-native", onWinNative);
    win.addEventListener("window-exit-native", onWinExitNative);
    win.addEventListener("window-close", onWinClose);
    win.addEventListener("click", onHostControlBubble);
    win.addEventListener("pointerup", onHostControlBubble);

    return () => {
        if (disposed) return;
        disposed = true;
        closing = true;
        stopFx?.();
        chromeMo?.disconnect();
        chromeMo = null;
        isMobileMq.removeEventListener("change", onMq);
        surfaceRoot?.removeEventListener?.("env-chrome-surface", onChromeSurface);
        win.removeEventListener("window-focus", onWinFocus);
        win.removeEventListener("window-move", onWinMove);
        win.removeEventListener("window-resize", onWinResize);
        win.removeEventListener("window-minimize", onWinMinimize);
        win.removeEventListener("window-maximize", onWinMaximize);
        win.removeEventListener("window-restore", onWinRestore);
        win.removeEventListener("window-native", onWinNative);
        win.removeEventListener("window-exit-native", onWinExitNative);
        win.removeEventListener("window-close", onWinClose);
        win.removeEventListener("click", onHostControlBubble);
        win.removeEventListener("pointerup", onHostControlBubble);
        try {
            if (nativeMode.value) nativeMode.value = false;
            if (win.isConnected) win.remove();
        } catch {
            /* already detached */
        }
        syncEnvNativeTaskAttr(host);
    };
}
