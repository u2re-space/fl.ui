/**
 * WHY: Lightweight floating window chrome: {@link fest/object} drives bounds; pointer-driven drag / resize.
 * Mobile (`max-width: 640px`): split/maximized tiling via `demoRole`; desktop adds maximize/minimize/close.
 *
 * NOTE: Not a `cw-shell-*` host — **no overlay layer**. Menus, dialogs, and `slot="overlay"` nodes from
 * code running inside the frame must mount under the **parent** shell's `[data-shell-overlays]`
 * (`resolveOverlayMountPoint` in `boot/shell-slots`) using an anchor inside the frame so `closest("cw-shell-*")`
 * resolves the environment/minimal host.
 *
 * Tagged shell markup uses {@link ../dom-lite.ts}; controls use {@link ./buttons.ts}.
 */
import type { refType } from "@fest-lib/object";
import { booleanRef, effect, numberRef } from "@fest-lib/object";
import { h } from "../dom-lite.js";
import { mountChromeButtons } from "./buttons.js";

export type DemoWindowRole = "viewer" | "explorer";

export type WindowChromeModel = {
    /** Used to tile two demos on narrow breakpoints while both remain maximized splits. */
    demoRole?: DemoWindowRole;
    title: string;
    bounds: {
        x: refType<number>;
        y: refType<number>;
        w: refType<number>;
        h: refType<number>;
    };
    z: refType<number>;
    /** Phone breakpoint: upper/lower split layout when true. */
    maximizedMobile: refType<boolean>;
    /** Collapses body to title strip (Material “minimize” affordance in web shell). */
    minimized: refType<boolean>;
    /** Desktop-only tile to viewport insets (not used on phone split). */
    desktopMaximized: refType<boolean>;
    /**
     * Mono/task native chrome: full-bleed `ui-window[native-mode]` (WCO / standalone / fallback).
     * Distinct from desk/mobile maximize — hides env taskbar/statusbar while active.
     */
    nativeMode: refType<boolean>;
    /** False after close control — frame hidden until reset by host. */
    visible: refType<boolean>;
    isMobileMq: MediaQueryList;
};

const dragMin = Object.freeze({ w: 360, h: 240 });
const deskInset = 8;

/** When mounted under `.env-shell-root`, add this boost so windows stack above the home layer. */
function readEnvWindowZBoost(host: HTMLElement | null | undefined): number {
    const shell = host?.closest?.(".env-shell-root");
    if (!(shell instanceof HTMLElement)) return 0;
    const raw = getComputedStyle(shell).getPropertyValue("--env-window-z-boost").trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
}

export type MountWindowFrameOptions = {
    onClose?: () => void;
    /**
     * When set (e.g. environment-shell keyed windows), stamped on `.wf-frame` as `data-wf-managed-view`
     * so hosts can detect orphaned chrome after workspace `replaceChildren` / remounts.
     */
    managedViewKey?: string;
};

export function createChromeModel(
    title: string,
    seed: Partial<{
        x: number;
        y: number;
        w: number;
        h: number;
        z: number;
        demoRole: DemoWindowRole;
    }> = {}
): WindowChromeModel {
    let { x = 48, y = 48, w = 640, h = 480, z = 10, demoRole } = seed;
    /* WHY: default 640×480 at (48,48) puts titlebar actions past a squeezed pane. */
    try {
        const boxW = Math.round(window.visualViewport?.width || window.innerWidth || 0);
        const boxH = Math.round(window.visualViewport?.height || window.innerHeight || 0);
        if (boxW >= 280 && boxH >= 200) {
            const pad = 16;
            if (w > boxW - pad) w = Math.max(280, boxW - pad);
            if (h > boxH - pad) h = Math.max(200, boxH - pad);
            if (x + w > boxW - 8) x = Math.max(8, boxW - w - 8);
            if (y + h > boxH - 8) y = Math.max(8, boxH - h - 8);
        }
    } catch {
        /* non-browser */
    }
    const mq = matchMedia("(max-width: 640px)");
    return {
        demoRole,
        title,
        bounds: { x: numberRef(x), y: numberRef(y), w: numberRef(w), h: numberRef(h) },
        z: numberRef(z),
        maximizedMobile: booleanRef(mq.matches),
        minimized: booleanRef(false),
        desktopMaximized: booleanRef(false),
        nativeMode: booleanRef(false),
        visible: booleanRef(true),
        isMobileMq: mq
    };
}

/**
 * Mounts window chrome around `content`, wiring drag strip, resize grip, Material controls.
 */
export function mountWindowFrame(
    host: HTMLElement,
    model: WindowChromeModel,
    content: HTMLElement,
    onFocus: () => void,
    options: MountWindowFrameOptions = {}
): () => void {
    const { bounds, z, maximizedMobile, minimized, desktopMaximized, visible, isMobileMq } = model;
    const frame = h`<section class="wf-frame" part="frame">
        <header class="wf-titlebar wf-chrome-no-select" part="titlebar">
            <div class="wf-titlebar-drag wf-chrome-no-select" part="titlebar-drag">
                <span class="wf-title wf-chrome-no-select" part="title"></span>
            </div>
            <div class="wf-titlebar-actions wf-chrome-no-select" part="titlebar-actions"></div>
        </header>
        <div class="wf-frame-body wf-content-select" part="body"></div>
        <div class="wf-resize wf-chrome-no-select" part="resize" aria-hidden="true"></div>
    </section>` as HTMLElement;

    const titleText = frame.querySelector(".wf-title") as HTMLElement | null;
    if (titleText) titleText.textContent = model.title;

    const bodySlot = frame.querySelector(".wf-frame-body") as HTMLElement | null;
    bodySlot?.appendChild(content);

    const titleDrag = frame.querySelector(".wf-titlebar-drag") as HTMLElement | null;
    const actionsHost = frame.querySelector(".wf-titlebar-actions") as HTMLElement | null;
    const resizeGrip = frame.querySelector(".wf-resize") as HTMLElement | null;

    let savedDesktop: { x: number; y: number; w: number; h: number } | null = null;

    const chrome = actionsHost
        ? mountChromeButtons(actionsHost, {
              onMinimize: () => {
                  if (desktopMaximized.value && !isMobileMq.matches) {
                      desktopMaximized.value = false;
                      if (savedDesktop) {
                          bounds.x.value = savedDesktop.x;
                          bounds.y.value = savedDesktop.y;
                          bounds.w.value = savedDesktop.w;
                          bounds.h.value = savedDesktop.h;
                          savedDesktop = null;
                      }
                  }
                  minimized.value = !minimized.value;
              },
              onMaximize: () => {
                  if (isMobileMq.matches) {
                      maximizedMobile.value = !maximizedMobile.value;
                      return;
                  }
                  if (minimized.value) minimized.value = false;
                  if (!desktopMaximized.value) {
                      savedDesktop = {
                          x: bounds.x.value,
                          y: bounds.y.value,
                          w: bounds.w.value,
                          h: bounds.h.value
                      };
                      desktopMaximized.value = true;
                  } else {
                      desktopMaximized.value = false;
                      if (savedDesktop) {
                          bounds.x.value = savedDesktop.x;
                          bounds.y.value = savedDesktop.y;
                          bounds.w.value = savedDesktop.w;
                          bounds.h.value = savedDesktop.h;
                      }
                      savedDesktop = null;
                  }
              },
              onClose: () => {
                  visible.value = false;
                  options.onClose?.();
              }
          })
        : null;

    host.appendChild(frame);

    const managedKey = String(options?.managedViewKey ?? "").trim();
    if (managedKey) frame.setAttribute("data-wf-managed-view", managedKey);

    const applyChrome = () => {
        if (!visible.value) {
            frame.classList.add("wf-hidden");
            return;
        }
        frame.classList.remove("wf-hidden");

        frame.style.zIndex = String((z.value ?? 10) + readEnvWindowZBoost(host));
        const mqMobile = Boolean(isMobileMq.matches);

        if (mqMobile) {
            frame.classList.add("wf-mobile");
            if (maximizedMobile.value) {
                frame.classList.add("wf-mobile-max");
            } else {
                frame.classList.remove("wf-mobile-max");
            }
        } else {
            frame.classList.remove("wf-mobile", "wf-mobile-max");
        }

        if (minimized.value) {
            frame.classList.add("wf-minimized");
        } else {
            frame.classList.remove("wf-minimized");
        }

        if (desktopMaximized.value && !mqMobile) {
            frame.classList.add("wf-desk-max");
            frame.style.left = `${deskInset}px`;
            frame.style.top = `${deskInset}px`;
            frame.style.right = `${deskInset}px`;
            frame.style.bottom = `${deskInset}px`;
            frame.style.width = "auto";
            frame.style.height = "auto";
        } else {
            frame.classList.remove("wf-desk-max");
        }

        if (frame.classList.contains("wf-mobile-max")) {
            frame.style.left = "0";
            frame.style.right = "0";
            frame.style.width = "auto";
            /** Split viewport: explorer strip + markdown body. */
            if (!model.demoRole) {
                frame.style.top = "0";
                frame.style.bottom = "0";
                frame.style.height = "auto";
            } else if (model.demoRole === "explorer") {
                frame.style.top = "0";
                frame.style.bottom = "auto";
                frame.style.height = "clamp(240px, 42dvh, 45dvh)";
            } else {
                frame.style.top = "auto";
                frame.style.bottom = "0";
                frame.style.height =
                    `calc(100dvh - clamp(240px, 42dvh, 45dvh) - env(safe-area-inset-bottom, 0px))`;
            }
        } else if (!frame.classList.contains("wf-desk-max")) {
            frame.style.left = `${bounds.x.value}px`;
            frame.style.top = `${bounds.y.value}px`;
            frame.style.width = `${bounds.w.value}px`;
            frame.style.height = minimized.value ? "auto" : `${bounds.h.value}px`;
            frame.style.right = "";
            frame.style.bottom = "";
        }

        if (resizeGrip) {
            const hideRz =
                mqMobile ||
                minimized.value ||
                frame.classList.contains("wf-mobile-max") ||
                frame.classList.contains("wf-desk-max");
            resizeGrip.style.display = hideRz ? "none" : "";
        }

        if (chrome) {
            chrome.setMaximizedGlyph(desktopMaximized.value && !mqMobile);
        }
    };

    const onMq = () => {
        if (isMobileMq.matches) {
            maximizedMobile.value = true;
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
    };

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
            visible
        ],
        { triggerImmediately: true }
    );

    isMobileMq.addEventListener("change", onMq);
    onMq();

    /* --- drag (title drag strip — full width minus controls) --- */
    let dragStartX = 0;
    let dragStartY = 0;
    let baseX = 0;
    let baseY = 0;

    const onDragMove = (ev: PointerEvent) => {
        if (frame.classList.contains("wf-mobile-max") || frame.classList.contains("wf-desk-max")) return;
        bounds.x.value = baseX + (ev.clientX - dragStartX);
        bounds.y.value = baseY + (ev.clientY - dragStartY);
    };

    const endDrag = (ev: PointerEvent) => {
        if (!titleDrag) return;
        titleDrag.releasePointerCapture(ev.pointerId);
        titleDrag.removeEventListener("pointermove", onDragMove);
        titleDrag.removeEventListener("pointerup", endDrag);
        titleDrag.removeEventListener("pointercancel", endDrag);
    };

    titleDrag?.addEventListener("pointerdown", (ev) => {
        onFocus();

        /** Mobile split: toggle between stacked split and draggable cards on empty strip click. */
        if (frame.classList.contains("wf-mobile-max")) {
            maximizedMobile.value = false;
            bounds.w.value = Math.min(bounds.w.value, Math.max(window.innerWidth - 32, dragMin.w));
            bounds.h.value = Math.min(bounds.h.value, Math.max(window.innerHeight - 96, dragMin.h));
            applyChrome();
            return;
        }

        if (Boolean(isMobileMq.matches)) return;
        if (frame.classList.contains("wf-desk-max")) return;

        titleDrag.setPointerCapture(ev.pointerId);
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        baseX = bounds.x.value;
        baseY = bounds.y.value;
        titleDrag.addEventListener("pointermove", onDragMove);
        titleDrag.addEventListener("pointerup", endDrag);
        titleDrag.addEventListener("pointercancel", endDrag);
        ev.preventDefault();
    });

    /* --- resize (SE grip) --- */
    let rzStartX = 0;
    let rzStartY = 0;
    let rzW = 0;
    let rzH = 0;

    const onRzMove = (ev: PointerEvent) => {
        if (
            !isMobileMq.matches &&
            !frame.classList.contains("wf-mobile-max") &&
            !frame.classList.contains("wf-desk-max") &&
            resizeGrip &&
            !minimized.value
        ) {
            bounds.w.value = Math.max(dragMin.w, rzW + (ev.clientX - rzStartX));
            bounds.h.value = Math.max(dragMin.h, rzH + (ev.clientY - rzStartY));
        }
    };

    const endRz = (ev: PointerEvent) => {
        resizeGrip?.releasePointerCapture(ev.pointerId);
        resizeGrip?.removeEventListener("pointermove", onRzMove);
        resizeGrip?.removeEventListener("pointerup", endRz);
        resizeGrip?.removeEventListener("pointercancel", endRz);
    };

    resizeGrip?.addEventListener("pointerdown", (ev) => {
        onFocus();
        if (
            isMobileMq.matches ||
            frame.classList.contains("wf-mobile-max") ||
            frame.classList.contains("wf-desk-max") ||
            !resizeGrip ||
            minimized.value
        )
            return;
        resizeGrip.setPointerCapture(ev.pointerId);
        rzStartX = ev.clientX;
        rzStartY = ev.clientY;
        rzW = bounds.w.value;
        rzH = bounds.h.value;
        resizeGrip.addEventListener("pointermove", onRzMove);
        resizeGrip.addEventListener("pointerup", endRz);
        resizeGrip.addEventListener("pointercancel", endRz);
        ev.preventDefault();
    });

    return () => {
        isMobileMq.removeEventListener("change", onMq);
        stopFx?.();
        frame.remove();
    };
}
