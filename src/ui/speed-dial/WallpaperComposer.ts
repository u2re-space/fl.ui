/*
 * Filename: WallpaperComposer.ts
 * FullPath: modules/projects/fl.ui/src/ui/speed-dial/WallpaperComposer.ts
 * Reason for changes: Interactive wallpaper framing (scale + position) before/after set.
 * FIND:wallpaper-composer
 * TAG:wallpaper-composer,wallpaper-layout
 *
 * Interactive framing dialog in the ShortcutEditor manner: a <dialog class="speed-dial-editor">
 * promoted to the top layer, seeded with wallpaper `--base-color` tokens (no hardcoded slate).
 *
 * WHY a live preview canvas: the preview is a real `ui-canvas` fed by the same attributes
 * (`data-src`, `scale`, `position-x`, `position-y`) as the shell wallpaper. The framing the
 * user drags here is bit-identical to the final paint — no second math implementation to keep
 * in sync (WYSIWYG contract).
 *
 * Gestures: pointer drag = position; pinch (2 pointers) / wheel / slider = scale.
 * Orientation: the preview canvas tracks the current screen orientation like the shell
 * wallpaper canvas does (orient 0/2 = portrait scene, 1/3 = landscape scene).
 */
import { registerModal } from "@fest-lib/lure";
import {
    getAppWallpaperLayout,
    resolveAppWallpaperUrl,
    type WallpaperLayout,
    type WallpaperPosition
} from "@fest-lib/image";

/** WHY: Match context-menu pin — Settings may not have applied data-theme yet. */
function resolveComposerTheme(): "light" | "dark" {
    const root = document.documentElement;
    const pinned = String(root.getAttribute("data-theme") || "").trim().toLowerCase();
    if (pinned === "light" || pinned === "dark") return pinned;
    const scheme = String(root.getAttribute("data-scheme") || "").trim().toLowerCase();
    if (scheme === "light" || scheme === "dark") return scheme;
    try {
        const stored = String(localStorage.getItem("rs-appearance-theme") || "").trim().toLowerCase();
        if (stored === "light" || stored === "dark") return stored;
    } catch {
        // private mode
    }
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
}

/** Preview stage sizing: CSS px clamped so the stage fits both phone portrait and desktop. */
const STAGE_MAX_CSS = 460;
const stageSizeFor = (aspect: number): { w: number; h: number } => {
    const viewport = Math.min(globalThis.innerWidth || STAGE_MAX_CSS, globalThis.innerHeight || STAGE_MAX_CSS);
    const budget = Math.max(160, Math.min(STAGE_MAX_CSS, viewport - 48));
    if (aspect >= 1) {
        const w = budget;
        return { w, h: Math.max(160, Math.round(w / aspect)) };
    }
    const h = budget;
    return { w: Math.max(160, Math.round(h * aspect)), h };
};

/** Coerce a position attr (`50%` / `start` / `center` / `end`) to a typed percent. */
const normalizePercent = (raw: string | null | undefined): WallpaperPosition => {
    const value = String(raw || "").trim().toLowerCase();
    if (value === "start") return "0%";
    if (value === "end") return "100%";
    if (value === "center" || value === "") return "50%";
    const percent = Number(value.replace("%", ""));
    if (!Number.isFinite(percent)) return "50%";
    return `${Math.max(0, Math.min(100, Math.round(percent)))}%` as WallpaperPosition;
};

export type WallpaperComposerOptions = {
    /** Photo to frame; omit to frame the currently painted wallpaper. */
    blob?: Blob | null;
    title?: string;
    confirmLabel?: string;
    /** Let the user swap the photo without leaving the dialog (reset seeds it again). */
    allowPickOther?: boolean;
    onConfirm: (result: { blob: Blob | null; layout: WallpaperLayout }) => void | Promise<void>;
    onCancel?: () => void;
};

/**
 * Open the interactive wallpaper framing dialog.
 * Resolves once the dialog closes (apply → true, cancel → false).
 */
export const openWallpaperComposer = (options: WallpaperComposerOptions): Promise<boolean> => {
    const {
        blob = null,
        title = "Wallpaper",
        confirmLabel = "Apply",
        allowPickOther = true,
        onConfirm,
        onCancel
    } = options;

    return new Promise<boolean>((resolve) => {
        const theme = resolveComposerTheme();
        const modal = document.createElement("dialog");
        modal.className = "speed-dial-editor wallpaper-composer";
        modal.dataset.theme = theme;
        /*
         * INVARIANT: same token contract as ShortcutEditor — adaptive colorization via
         * wallpaper `--base-color` + `--u2-color-mod`; no hardcoded slate panels.
         */
        modal.innerHTML = `
            <form class="speed-dial-editor__form wallpaper-composer__form" data-theme="${theme}" autocomplete="off">
                <header class="modal-header">
                    <h2 class="modal-title">${title}</h2>
                    <p class="modal-description">Drag the photo to reposition. Pinch, scroll wheel, or the slider to scale.</p>
                </header>
                <div class="wallpaper-composer__body">
                    <div class="wallpaper-composer__stage" data-stage>
                        <canvas class="wallpaper-composer__canvas" is="ui-canvas" data-orient="0"></canvas>
                        <div class="wallpaper-composer__hint" data-hint hidden></div>
                    </div>
                    <div class="wallpaper-composer__controls">
                        <div class="wallpaper-composer__slider-row">
                            <span class="wallpaper-composer__slider-label">Scale</span>
                            <input data-scale type="range" min="1" max="3" step="0.01" value="1" />
                            <output data-scale-value>1.00×</output>
                        </div>
                        <p class="wallpaper-composer__note">Drag the photo · pinch / wheel / slider = scale</p>
                    </div>
                </div>
                <div class="modal-actions" role="group" aria-label="Wallpaper actions">
                    <button type="button" data-action="reset" class="btn secondary">Reset</button>
                    ${allowPickOther ? '<button type="button" data-action="other" class="btn secondary">Other photo</button>' : '<span class="modal-actions-spacer" aria-hidden="true"></span>'}
                    <button type="submit" class="btn save">${confirmLabel}</button>
                </div>
            </form>
        `;

        const form = modal.querySelector("form") as HTMLFormElement | null;
        const stage = modal.querySelector("[data-stage]") as HTMLElement | null;
        const canvas = modal.querySelector("canvas.wallpaper-composer__canvas") as HTMLCanvasElement | null;
        const hint = modal.querySelector("[data-hint]") as HTMLElement | null;
        const scaleInput = modal.querySelector("[data-scale]") as HTMLInputElement | null;
        const scaleValue = modal.querySelector("[data-scale-value]") as HTMLOutputElement | null;
        const applyBtn = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
        const otherBtn = form?.querySelector('[data-action="other"]') as HTMLButtonElement | null;

        if (!form || !stage || !canvas) {
            resolve(false);
            onCancel?.();
            return;
        }

        /* WHY: shortcut-editor belt-and-suspenders — shell normalize / overlay hosts
         * set pointer-events: none on ancestors; the dialog must own its events. */
        modal.style.setProperty("color-scheme", theme === "light" ? "light only" : "dark only", "important");
        form.style.setProperty("color-scheme", theme === "light" ? "light only" : "dark only", "important");
        form.style.setProperty("pointer-events", "auto", "important");
        form.style.setProperty("contain", "none", "important");
        form.style.setProperty("content-visibility", "visible", "important");
        form.querySelectorAll("input, select, textarea, button").forEach((node) => {
            const el = node as HTMLElement;
            el.style.setProperty("pointer-events", "auto", "important");
        });

        /* Working draft: scale multiplier + position ratios (0..1, object-position semantics). */
        let layout: WallpaperLayout = { scale: 1, positionX: "center", positionY: "center" };
        const positionToRatio = (raw: string): number => {
            const value = String(raw || "").trim().toLowerCase();
            if (value === "start") return 0;
            if (value === "end") return 1;
            const percent = Number(value.replace("%", ""));
            return Number.isFinite(percent) ? Math.max(0, Math.min(1, percent / 100)) : 0.5;
        };
        try {
            const stored = getAppWallpaperLayout();
            layout = {
                scale: stored.scale,
                positionX: `${Math.round(positionToRatio(stored.positionX) * 100)}%`,
                positionY: `${Math.round(positionToRatio(stored.positionY) * 100)}%`
            };
        } catch {
            /* defaults */
        }
        /* WHY: a framed blob is a new photo — the previous photo's framing must not
         * seed the draft; start from cover + center like a fresh set. */
        if (blob) layout = { scale: 1, positionX: "center", positionY: "center" };

        let photoBlob: Blob | null = blob;
        let photoUrl = "";
        /** WHY: only blob: URLs created HERE may be revoked — `resolveAppWallpaperUrl`
         * can return the image module's shared `liveObjectUrl`, which the shell canvas
         * is painting; revoking that would kill the running wallpaper. */
        let ownedUrl = "";
        let closed = false;
        let unregisterBackNav: (() => void) | null = null;

        const syncScaleUi = (): void => {
            if (scaleInput) scaleInput.value = String(layout.scale);
            if (scaleValue) scaleValue.textContent = `${layout.scale.toFixed(2)}×`;
        };

        const applyLayoutToCanvas = (): void => {
            canvas.setAttribute("scale", layout.scale.toFixed(3));
            canvas.setAttribute("position-x", layout.positionX);
            canvas.setAttribute("position-y", layout.positionY);
        };

        const paintPhoto = (next: Blob | null): void => {
            if (ownedUrl) {
                try { URL.revokeObjectURL(ownedUrl); } catch { /* ignore */ }
                ownedUrl = "";
            }
            photoBlob = next;
            if (!next) {
                void resolveAppWallpaperUrl().then((url) => {
                    if (closed) return;
                    photoUrl = url;
                    canvas.setAttribute("data-src", url);
                    applyLayoutToCanvas();
                    syncApplyState();
                });
                return;
            }
            ownedUrl = URL.createObjectURL(next);
            photoUrl = ownedUrl;
            canvas.setAttribute("data-src", photoUrl);
            applyLayoutToCanvas();
            syncApplyState();
        };

        const syncApplyState = (): void => {
            if (!applyBtn) return;
            const painting = Boolean(photoUrl);
            applyBtn.disabled = !painting;
        };

        /**
         * WHY: the preview must mirror the shell wallpaper scene, so the stage aspect
         * equals the viewport aspect in the current orientation (portrait scene vs
         * landscape scene) — same contract as ui-canvas orient 0/2 vs 1/3.
         */
        const syncStageAspect = (): void => {
            const orient = Number(canvas.getAttribute("data-orient") || "0") || 0;
            const portraitScene = orient % 2 === 0;
            const vw = Math.max(globalThis.innerWidth || 1, 1);
            const vh = Math.max(globalThis.innerHeight || 1, 1);
            const screenAspect = vw / vh;
            const aspect = portraitScene ? Math.min(screenAspect, 1) : Math.max(screenAspect, 1);
            const { w, h } = stageSizeFor(aspect);
            stage.style.inlineSize = `${w}px`;
            stage.style.blockSize = `${h}px`;
        };

        /* Orientation: track the screen like Canvas.ts syncCanvasOrient — attr is the SoT. */
        const syncOrient = (): void => {
            const orientType = String((globalThis.screen?.orientation?.type || "portrait-primary"));
            const portrait = matchMedia("(orientation: portrait)").matches;
            const isSecondary = orientType.endsWith("secondary");
            const orient = portrait ? (isSecondary ? 2 : 0) : (isSecondary ? 3 : 1);
            canvas.setAttribute("data-orient", String(orient));
            syncStageAspect();
        };
        const orientMq = (query: string): MediaQueryList | null => {
            try { return matchMedia(query); } catch { return null; }
        };
        const portraitMq = orientMq("(orientation: portrait)");
        const landscapeMq = orientMq("(orientation: landscape)");
        const onMqChange = (): void => {
            if (closed) return;
            syncOrient();
        };
        portraitMq?.addEventListener?.("change", onMqChange);
        landscapeMq?.addEventListener?.("change", onMqChange);

        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

        /* Scale bounds: the engine clamps drag so the canvas is always covered. */
        const MAX_SCALE = 3;
        const setScale = (value: number): void => {
            layout.scale = clamp(Number(value.toFixed(3)) || 1, 1, MAX_SCALE);
            syncScaleUi();
            applyLayoutToCanvas();
        };

        /*
         * Pointer gestures: 1 pointer = drag position; 2 pointers = pinch scale.
         * INVARIANT: position values are object-position ratios of the OVERFLOW
         * (canvas − image bounds). Dragging right must move the photo right, which
         * DECREASES the left-overflow ratio — hence the sign flip.
         */
        const pointers = new Map<number, { x: number; y: number }>();
        let pinchStartDist = 0;
        let pinchStartScale = 1;

        const stagePoint = (event: PointerEvent): { x: number; y: number } => {
            const rect = stage.getBoundingClientRect();
            return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        };

        stage.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 && event.pointerType === "mouse") return;
            event.preventDefault();
            try { stage.setPointerCapture(event.pointerId); } catch { /* ignore */ }
            pointers.set(event.pointerId, stagePoint(event));
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                pinchStartScale = layout.scale;
            }
        });

        stage.addEventListener("pointermove", (event) => {
            const prev = pointers.get(event.pointerId);
            if (!prev) return;
            const next = stagePoint(event);
            if (pointers.size === 2) {
                pointers.set(event.pointerId, next);
                const [a, b] = [...pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                setScale(pinchStartScale * (dist / pinchStartDist));
                return;
            }
            pointers.set(event.pointerId, next);
            const rect = stage.getBoundingClientRect();
            const dx = (next.x - prev.x) / Math.max(rect.width, 1);
            const dy = (next.y - prev.y) / Math.max(rect.height, 1);
            const ratio = (raw: string): number => {
                const n = Number(String(raw).replace("%", ""));
                return Number.isFinite(n) ? n / 100 : 0.5;
            };
            const px = ratio(canvas.getAttribute("position-x") || "50%");
            const py = ratio(canvas.getAttribute("position-y") || "50%");
            const nx = clamp(px - dx, 0, 1);
            const ny = clamp(py - dy, 0, 1);
            canvas.setAttribute("position-x", `${Math.round(nx * 100)}%`);
            canvas.setAttribute("position-y", `${Math.round(ny * 100)}%`);
            layout.positionX = `${Math.round(nx * 100)}%`;
            layout.positionY = `${Math.round(ny * 100)}%`;
            applyLayoutToCanvas();
        });

        const endPointer = (event: PointerEvent): void => {
            pointers.delete(event.pointerId);
        };
        stage.addEventListener("pointerup", endPointer);
        stage.addEventListener("pointercancel", endPointer);

        /* Wheel = fine scale (desktop). */
        stage.addEventListener(
            "wheel",
            (event) => {
                event.preventDefault();
                const factor = event.deltaY < 0 ? 1.06 : 1 / 1.06;
                setScale(layout.scale * factor);
            },
            { passive: false }
        );

        scaleInput?.addEventListener("input", () => setScale(Number(scaleInput.value)));

        if (hint) {
            /* COMPAT: no pointer events at all (AT-only / exotic) — show a text hint. */
            const hasPointer = typeof PointerEvent === "function";
            if (!hasPointer) hint.removeAttribute("hidden");
        }

        let fileInput: HTMLInputElement | null = null;
        const pickOther = (): void => {
            if (!fileInput) {
                fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.accept = "image/*";
                fileInput.onchange = () => {
                    const file = fileInput?.files?.[0];
                    if (!file) return;
                    paintPhoto(file);
                    layout.positionX = "center";
                    layout.positionY = "center";
                    applyLayoutToCanvas();
                    syncScaleUi();
                    syncApplyState();
                };
            }
            fileInput.click();
        };
        otherBtn?.addEventListener("click", pickOther);

        const resetDraft = (): void => {
            layout = { scale: 1, positionX: "center", positionY: "center" };
            syncScaleUi();
            applyLayoutToCanvas();
        };

        form.querySelector('[data-action="reset"]')?.addEventListener("click", resetDraft);
        otherBtn?.addEventListener("click", pickOther);

        const closeModal = (applied: boolean): void => {
            if (closed) return;
            closed = true;
            unregisterBackNav?.();
            unregisterBackNav = null;
            try {
                if (modal.open) modal.close();
            } catch {
                // already closed
            }
            modal.remove();
            if (ownedUrl) {
                try { URL.revokeObjectURL(ownedUrl); } catch { /* ignore */ }
                ownedUrl = "";
            }
            resolve(applied);
        };

        modal.addEventListener("cancel", (event) => {
            event.preventDefault();
            closeModal(false);
            onCancel?.();
        });

        modal.addEventListener("click", (event) => {
            /* Clicks on dialog padding (outside the form panel) dismiss. */
            if (event.target === modal) {
                closeModal(false);
                onCancel?.();
            }
        });

        /* WHY: keep pointer path inside the panel; never let shell handlers steal focus.
         * INVARIANT: must NOT swallow events originating in the drag stage — a capture-
         * phase stopPropagation here would kill stage pointerdown entirely (the event
         * never reaches its target), which is why wallpaper drag stayed dead. */
        form.addEventListener(
            "pointerdown",
            (event) => {
                if ((event.target as Element | null)?.closest?.(".wallpaper-composer__stage")) return;
                event.stopPropagation();
            },
            true
        );

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            /* WHY: canvas attrs are the live truth while dragging; `layout` mirrors them,
             * but read back the attrs so a pending frame is never lost. */
            const finalLayout: WallpaperLayout = {
                scale: layout.scale,
                positionX: normalizePercent(canvas.getAttribute("position-x")),
                positionY: normalizePercent(canvas.getAttribute("position-y"))
            };
            const result = { blob: photoBlob, layout: finalLayout };
            closeModal(true);
            void onConfirm(result);
        });

        unregisterBackNav = registerModal(modal, undefined, () => {
            closeModal(false);
            onCancel?.();
        });

        /* Boot the draft: stored layout when framing the current wallpaper, else center. */
        syncOrient();
        syncScaleUi();
        applyLayoutToCanvas();
        paintPhoto(photoBlob);
        syncApplyState();
        document.body.append(modal);
        try {
            modal.showModal();
        } catch {
            /* COMPAT: rare environments without dialog API — still show as fixed overlay. */
            modal.setAttribute("open", "");
            modal.style.setProperty("position", "fixed", "important");
            modal.style.setProperty("inset", "0", "important");
            modal.style.setProperty("z-index", "2147483646", "important");
        }
    });
};
