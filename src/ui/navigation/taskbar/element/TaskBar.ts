
/*
 * Filename: TaskBar.ts
 * FullPath: modules/projects/fl.ui/src/ui/navigation/taskbar/element/TaskBar.ts
 * FIND:taskbar-under
 * Change date and time: 23.15.00_22.08.2026
 * Reason for changes: Drop lure taskbar-under clone — it painted a 40px z-index-0 slab over PWA windows.
 */
/**
 * WHY: Desktop shell chrome — `ui-taskbar` + `ui-task` from FL-UI, `fest/lure` tasking `makeTask` / `getBy`,
 * and the same reactive device tray as {@link buildShellDeviceTray} (desktop-only via CSS + data-desktop).
 * Mobile: transparent nav, house icon at the right; tap goes Home (Start); long-press lists open windows.
 * Desktop: Start pin (same as mobile Home tap); icon-only tasks; Win-style click toggle; tray clock.
 */
import { UITask } from "@fest-lib/fl-ui";
import "@fest-lib/icon";
import { effect, observe, type refType } from "@fest-lib/object";
import { getBy, makeTask, navigationEnable, type ITask } from "@fest-lib/lure";
// WHY: Library builds have no app `views/*` aliases; use the fl.ui ContextMenu SoT.
import {
    openUnifiedContextMenu,
    type ContextMenuEntry
} from "../../explorer/ContextMenu";

import { buildShellDeviceTray, formatChromeClock, type ShellDeviceStatus } from "../../statusbar/statusbar";
import { toggleCalendarFlyout } from "../../calendar/CalendarFlyout";
import { toggleQuickSettingsFlyout } from "../../settings/QuickSettings";
import {
    isAppMenuEnabled,
    mountEnvironmentAppMenu,
    type MountAppMenuResult
} from "../../app-menu/AppMenu";
import {
    getActiveWorkspaceId,
    listWorkspacePages,
    switchWorkspacePage,
    WORKSPACE_PAGE_EVENT
} from "fl-ui/speed-dial/workspace-pages";
import { installLauncherBackStack } from "fl-ui/navigation/overlay-back";

/* Taskbar wrapper */
import UIElement from "fl-ui/base/UIElement";
import { H, defineElement } from "@fest-lib/lure";

//
// @ts-ignore
import styles from "veela-lib/ui/components/taskbar.scss?inline";
import { preloadStyle } from "@fest-lib/style-lib";
const styled = preloadStyle(styles);

//
// @ts-ignore
@defineElement("ui-taskbar")
export class UITaskBar extends UIElement {
    constructor() { super(); }
    styles = () => styled;
    render = () => H`<div part="taskbar" class="taskbar"><slot></slot></div>`;
}

/** Open floating window entry for the desktop taskbar. */
export type EnvWindowTaskDescriptor = {
    id: string;
    title: string;
    icon?: string;
    focused?: boolean;
    minimized?: boolean;
    visible?: boolean;
};

export type EnvironmentTaskbarOptions = {
    device: ShellDeviceStatus;
    onHome: () => void;
    onViewer: () => void;
    /** Which pinned task is highlighted (home | viewer | window id). */
    focusedTaskId: refType<string>;
    /** Activate / restore a managed window task (view id). */
    onWindowTask?: (viewId: string) => void;
    /** Minimize a managed window (desktop Win toggle). */
    onMinimizeWindow?: (viewId: string) => void;
    /** Close a managed window. */
    onCloseWindow?: (viewId: string) => void;
};

export type MountTaskBarResult = {
    element: HTMLElement;
    taskList: ITask[];
    setFocusedTaskId: (id: string) => void;
    /** Replace dynamic window tasks (Home / Markdown pins stay). */
    syncWindowTasks: (windows: EnvWindowTaskDescriptor[]) => void;
    /** Launcher SKU app drawer (Task 4+); undefined on non-launcher builds. */
    appMenu?: MountAppMenuResult;
    /** Open app menu with taskbar chrome sync (swipe-up from Speed Dial). */
    openAppMenu?: () => void;
    openAppMenuPage?: () => void;
    isSwitcherOpen?: () => boolean;
    closeSwitcher?: () => void;
    dispose: () => void;
};

const HOME_TASK = "#env-home";
const VIEWER_TASK = "#env-viewer";
const WIN_TASK_PREFIX = "#env-win-";
/** Long-press threshold for mobile Home → process switcher (ms). */
const HOME_LONG_PRESS_MS = 420;
const CLOCK_TICK_MS = 30_000;

function winTaskId(viewId: string): string {
    return `${WIN_TASK_PREFIX}${String(viewId || "").trim().toLowerCase()}`;
}

function isMobileChrome(): boolean {
    const chrome = document.querySelector(".env-shell-chrome");
    if (chrome instanceof HTMLElement && chrome.hasAttribute("data-desktop")) return false;
    if (chrome instanceof HTMLElement && chrome.dataset.chromeLayout === "mobile") return true;
    return typeof matchMedia === "function" && matchMedia("(max-width: 640px)").matches;
}

/** True when a managed sub-app window (explorer, settings, …) is visible on the desktop. */
function hasVisibleManagedWindows(
    windows: EnvWindowTaskDescriptor[],
    focusedTaskId: refType<string>
): boolean {
    if (
        windows.some((w) => {
            const id = String(w.id || "").trim().toLowerCase();
            if (!id || id === "home") return false;
            return w.visible !== false && !w.minimized;
        })
    ) {
        return true;
    }
    const focused = String(focusedTaskId.value || "home").trim().toLowerCase();
    if (focused && focused !== "home" && focused !== "viewer") return true;

    const workspace = document.querySelector(".env-shell-workspace");
    if (!workspace) return false;
    for (const node of workspace.querySelectorAll("ui-window")) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.hidden || node.hasAttribute("data-minimized")) continue;
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (Number.parseFloat(style.opacity || "1") <= 0) continue;
        return true;
    }
    return false;
}

function formatTrayClock(now = new Date()): { time: string; date: string } {
    return formatChromeClock(now);
}

/**
 * Task bar with Home / Markdown pins + dynamic open-window tasks and reactive system tray.
 */
export function mountEnvironmentTaskBar(opts: EnvironmentTaskbarOptions): MountTaskBarResult {
    const taskList = observe<ITask[]>([]);
    navigationEnable(taskList);

    // WHY: house-line matches speed-dial / minimal-shell; plain "house" was easy to clobber.
    makeTask(HOME_TASK, taskList, { title: "Home", icon: "house-line" }, {}, function (this: ITask) {
        for (const t of taskList) {
            if (t !== this) t.active = false;
        }
        this.active = true;
        opts.focusedTaskId.value = "home";
        opts.onHome();
    });

    makeTask(VIEWER_TASK, taskList, { title: "Markdown", icon: "article" }, {}, function (this: ITask) {
        for (const t of taskList) {
            if (t !== this) t.active = false;
        }
        this.active = true;
        opts.focusedTaskId.value = "viewer";
        opts.onViewer();
    });

    const bar = document.createElement("ui-taskbar");
    bar.className = "env-shell-taskbar wf-chrome-no-select";
    bar.setAttribute("part", "taskbar");
    bar.setAttribute("data-type", "desktop");

    const pinsHost = document.createElement("div");
    pinsHost.className = "env-shell-taskbar__pins";

    const windowsHost = document.createElement("div");
    windowsHost.className = "env-shell-taskbar__windows";

    const tHome = document.createElement("ui-task");
    tHome.setAttribute("title", "Home");
    tHome.setAttribute("icon", "house-line");
    tHome.setAttribute("data-id", HOME_TASK);
    tHome.setAttribute("data-env-home", "");
    tHome.setAttribute("aria-label", "Home");
    tHome.setAttribute("aria-haspopup", "menu");

    /*
    const tViewer = document.createElement("ui-task");
    tViewer.setAttribute("title", "Markdown");
    tViewer.setAttribute("icon", "article");
    tViewer.setAttribute("data-id", VIEWER_TASK);
    tViewer.setAttribute("data-env-pin", "viewer");
    tViewer.setAttribute("aria-label", "Markdown");

    pinsHost.append(tHome, tViewer);
    */
    pinsHost.append(tHome);

    const workspacePager = document.createElement("div");
    workspacePager.className = "env-shell-taskbar__workspaces";
    workspacePager.setAttribute("aria-label", "Workspaces");
    const paintWorkspacePager = (): void => {
        const pages = listWorkspacePages();
        const active = getActiveWorkspaceId();
        workspacePager.replaceChildren();
        for (const page of pages) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "env-shell-taskbar__workspace";
            btn.title = page.label;
            btn.textContent = page.label.replace(/^Side\s+/i, "") || page.id.slice(-1).toUpperCase();
            btn.toggleAttribute("data-active", page.id === active);
            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                switchWorkspacePage(page.id);
            });
            workspacePager.append(btn);
        }
    };
    paintWorkspacePager();
    window.addEventListener(WORKSPACE_PAGE_EVENT, paintWorkspacePager);
    pinsHost.append(workspacePager);
    installLauncherBackStack();

    const syncStartChrome = (): void => {
        const mobile = isMobileChrome();
        tHome.setAttribute("title", mobile ? "Home" : "Start");
        tHome.setAttribute("aria-label", mobile ? "Home" : "Start");
        tHome.setAttribute("icon", mobile ? "house-line" : "aperture");
        tHome.toggleAttribute("data-env-start", !mobile);
        if (mobile) tHome.setAttribute("aria-keyshortcuts", "LongPress");
        else tHome.removeAttribute("aria-keyshortcuts");
    };
    syncStartChrome();

    const trayHost = document.createElement("div");
    trayHost.className = "env-shell-taskbar__tray-host";

    const clockHost = document.createElement("div");
    clockHost.className = "env-shell-taskbar__clock";
    clockHost.setAttribute("role", "button");
    clockHost.setAttribute("tabindex", "0");
    clockHost.setAttribute("aria-label", "Calendar");
    clockHost.setAttribute("aria-haspopup", "dialog");
    clockHost.setAttribute("data-chrome-flyout-anchor", "calendar");
    const clockTime = document.createElement("span");
    clockTime.className = "env-shell-taskbar__clock-time";
    const clockDate = document.createElement("span");
    clockDate.className = "env-shell-taskbar__clock-date";
    clockHost.append(clockTime, clockDate);

    const paintClock = (): void => {
        const { time, date } = formatTrayClock();
        clockTime.textContent = time;
        clockDate.textContent = date;
        clockHost.title = `${time} · ${date}`;
    };
    paintClock();
    const clockTimer = setInterval(paintClock, CLOCK_TICK_MS);

    const deviceTray = buildShellDeviceTray(
        opts.device,
        "env-device-tray env-device-tray--taskbar"
    );
    deviceTray.setAttribute("role", "button");
    deviceTray.setAttribute("tabindex", "0");
    deviceTray.setAttribute("aria-label", "Quick settings");
    deviceTray.setAttribute("aria-haspopup", "dialog");
    deviceTray.setAttribute("data-chrome-flyout-anchor", "quick-settings");

    const onClockActivate = (ev: Event): void => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleCalendarFlyout(clockHost);
    };
    const onTrayActivate = (ev: Event): void => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleQuickSettingsFlyout(deviceTray);
    };
    clockHost.addEventListener("click", onClockActivate);
    clockHost.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") onClockActivate(ev);
    });
    deviceTray.addEventListener("click", onTrayActivate);
    deviceTray.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") onTrayActivate(ev);
    });

    trayHost.append(deviceTray, clockHost);

    /* Mobile process switcher — lives above the nav bar, opened by Home long-press. */
    const switcher = document.createElement("div");
    switcher.className = "env-shell-navbar__switcher";
    switcher.setAttribute("role", "menu");
    switcher.setAttribute("aria-label", "Open apps");
    switcher.hidden = true;

    const switcherList = document.createElement("ul");
    switcherList.className = "env-shell-navbar__switcher-list";
    switcher.appendChild(switcherList);

    bar.append(pinsHost, windowsHost, trayHost, switcher);

    const appMenuEnabled = isAppMenuEnabled();
    const appMenu = appMenuEnabled ? mountEnvironmentAppMenu() : undefined;

    const windowTaskEls = new Map<string, HTMLElement>();
    let lastWindows: EnvWindowTaskDescriptor[] = [];
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressFired = false;
    let switcherOpen = false;
    const cleanupFns: Array<() => void> = [];
    cleanupFns.push(() => clearInterval(clockTimer));

    const findWindowDesc = (viewId: string): EnvWindowTaskDescriptor | undefined =>
        lastWindows.find((w) => String(w.id || "").trim().toLowerCase() === viewId);

    /**
     * Win-style task click: minimized → restore+focus; focused+visible → minimize; else → focus.
     * WHY: do NOT route through `task.focus = true` — ITask focus setter only runs takeAction when
     * focus *changes*, so a second click on an already-focused task never minimized.
     */
    const activateWindowTask = (viewId: string): void => {
        const id = String(viewId || "").trim().toLowerCase();
        if (!id) return;
        const desc = findWindowDesc(id);
        const focusedId = String(opts.focusedTaskId.value || "").trim().toLowerCase();
        const isFocused =
            Boolean(desc?.focused) ||
            focusedId === id ||
            (focusedId === "markdown" && id === "viewer") ||
            (focusedId === "viewer" && (id === "viewer" || id === "markdown"));

        if (desc?.minimized) {
            desc.minimized = false;
            desc.focused = true;
            windowTaskEls.get(id)?.toggleAttribute("data-minimized", false);
            opts.focusedTaskId.value = id === "markdown" ? "viewer" : id;
            opts.onWindowTask?.(id);
            return;
        }
        if (isFocused && desc && desc.visible !== false) {
            desc.minimized = true;
            desc.focused = false;
            windowTaskEls.get(id)?.toggleAttribute("data-minimized", true);
            opts.onMinimizeWindow?.(id);
            return;
        }
        opts.focusedTaskId.value = id === "markdown" ? "viewer" : id;
        opts.onWindowTask?.(id);
    };

    const openTaskContextMenu = (ev: MouseEvent, viewId: string, title: string): void => {
        if (isMobileChrome()) return;
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(viewId || "").trim().toLowerCase();
        const desc = findWindowDesc(id);
        const minimized = Boolean(desc?.minimized);
        const items: ContextMenuEntry[] = [
            {
                id: minimized ? "restore" : "minimize",
                label: minimized ? "Restore" : "Minimize",
                icon: minimized ? "arrow-square-out" : "minus",
                action: () => {
                    if (minimized) {
                        opts.focusedTaskId.value = id;
                        opts.onWindowTask?.(id);
                    } else {
                        opts.onMinimizeWindow?.(id);
                    }
                }
            },
            {
                id: "close",
                label: "Close",
                icon: "x",
                danger: true,
                action: () => opts.onCloseWindow?.(id)
            }
        ];
        openUnifiedContextMenu({
            x: ev.clientX,
            y: ev.clientY,
            compact: true,
            anchor: ev.target instanceof Element ? ev.target : bar,
            items
        });
        void title;
    };

    const openBarContextMenu = (ev: MouseEvent): void => {
        if (isMobileChrome()) return;
        const path =
            typeof ev.composedPath === "function" ? ev.composedPath() : [];
        for (const n of path) {
            if (n instanceof Element && n.closest?.("ui-task")) return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        const items: ContextMenuEntry[] = [
            {
                id: "show-desktop",
                label: "Show desktop",
                icon: "desktop",
                action: () => opts.onHome()
            },
            {
                id: "home",
                label: "Home",
                icon: "house-line",
                action: () => opts.onHome()
            }
        ];
        openUnifiedContextMenu({
            x: ev.clientX,
            y: ev.clientY,
            compact: true,
            anchor: bar,
            items
        });
    };

    bar.addEventListener("contextmenu", openBarContextMenu);

    const closeSwitcher = (): void => {
        switcherOpen = false;
        switcher.hidden = true;
        switcherList.replaceChildren();
        bar.removeAttribute("data-switcher-open");
    };

    const openSwitcher = (): void => {
        // Include minimized apps so Home-collapse still lists restore/close targets.
        const open = lastWindows.filter((w) => String(w.id || "").trim());
        switcherList.replaceChildren();

        if (!open.length) {
            const empty = document.createElement("li");
            empty.className = "env-shell-navbar__switcher-empty";
            empty.textContent = "No open apps";
            switcherList.appendChild(empty);
        } else {
            for (const w of open) {
                const id = String(w.id || "").trim().toLowerCase();
                const li = document.createElement("li");
                li.className = "env-shell-navbar__switcher-row";
                li.setAttribute("role", "none");

                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "env-shell-navbar__switcher-item";
                btn.setAttribute("role", "menuitem");
                btn.toggleAttribute("data-active", Boolean(w.focused) && !w.minimized);
                btn.toggleAttribute("data-minimized", Boolean(w.minimized));
                const icon = document.createElement("ui-icon");
                icon.setAttribute("icon", w.icon || "app-window");
                icon.setAttribute("icon-style", "duotone");
                icon.setAttribute("aria-hidden", "true");
                const label = document.createElement("span");
                label.className = "env-shell-navbar__switcher-label";
                label.textContent = w.title || id;
                btn.append(icon, label);
                btn.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    closeSwitcher();
                    opts.focusedTaskId.value = id;
                    const taskId = winTaskId(id);
                    const t = getBy(taskList, taskId);
                    if (t) t.focus = true;
                    else opts.onWindowTask?.(id);
                });

                const closeBtn = document.createElement("button");
                closeBtn.type = "button";
                closeBtn.className = "env-shell-navbar__switcher-close";
                closeBtn.setAttribute("aria-label", `Close ${w.title || id}`);
                closeBtn.title = "Close";
                const closeIcon = document.createElement("ui-icon");
                closeIcon.setAttribute("icon", "x");
                closeIcon.setAttribute("icon-style", "bold");
                closeIcon.setAttribute("aria-hidden", "true");
                closeBtn.appendChild(closeIcon);
                closeBtn.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    opts.onCloseWindow?.(id);
                    lastWindows = lastWindows.filter(
                        (row) => String(row.id || "").trim().toLowerCase() !== id
                    );
                    windowTaskEls.get(id)?.remove();
                    windowTaskEls.delete(id);
                    if (!lastWindows.length) closeSwitcher();
                    else openSwitcher();
                });

                li.append(btn, closeBtn);
                switcherList.appendChild(li);
            }
        }

        switcherOpen = true;
        switcher.hidden = false;
        bar.setAttribute("data-switcher-open", "");
    };

    const clearLongPress = (): void => {
        if (longPressTimer != null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const syncAppMenuChrome = (): void => {
        bar.toggleAttribute("data-app-menu-open", Boolean(appMenu?.isOpen()));
    };

    const goHome = (): void => {
        closeSwitcher();
        appMenu?.close();
        syncAppMenuChrome();
        getBy(taskList, HOME_TASK)!.focus = true;
        opts.onHome();
    };

    const toggleAppMenuFromStart = (): void => {
        closeSwitcher();
        appMenu?.toggle();
        syncAppMenuChrome();
        getBy(taskList, HOME_TASK)!.focus = true;
        opts.focusedTaskId.value = "home";
        paintActive();
    };

    /** Open only — used by empty-desktop swipe-up on Capacitor. */
    const openAppMenuFromDesktop = (): void => {
        if (!appMenu || appMenu.isOpen()) return;
        closeSwitcher();
        appMenu.open();
        syncAppMenuChrome();
        getBy(taskList, HOME_TASK)!.focus = true;
        opts.focusedTaskId.value = "home";
        paintActive();
    };

    const openAppMenuPage = (): void => {
        if (!appMenu) return;
        closeSwitcher();
        appMenu.openPage();
        syncAppMenuChrome();
        getBy(taskList, HOME_TASK)!.focus = true;
        opts.focusedTaskId.value = "home";
        paintActive();
    };

    try {
        const g = globalThis as { __CWSP_LAUNCHER_HOME__?: Record<string, unknown> };
        g.__CWSP_LAUNCHER_HOME__ = {
            ...(g.__CWSP_LAUNCHER_HOME__ || {}),
            openAppMenu: openAppMenuFromDesktop,
            openAppMenuPage
        };
    } catch {
        /* ignore */
    }

    const handleLauncherHomeTap = (): void => {
        if (hasVisibleManagedWindows(lastWindows, opts.focusedTaskId)) {
            goHome();
            return;
        }
        if (appMenu?.isOpen()) {
            appMenu.close();
            syncAppMenuChrome();
            return;
        }
        toggleAppMenuFromStart();
    };

    tHome.addEventListener("click", (ev) => {
        if (longPressFired) {
            ev.preventDefault();
            ev.stopPropagation();
            longPressFired = false;
            return;
        }
        if (appMenuEnabled && appMenu) {
            ev.preventDefault();
            ev.stopPropagation();
            handleLauncherHomeTap();
            return;
        }
        goHome();
    });

    tHome.addEventListener(
        "pointerdown",
        (ev) => {
            if (!isMobileChrome()) return;
            if (ev.button != null && ev.button !== 0) return;
            longPressFired = false;
            clearLongPress();
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                longPressFired = true;
                try {
                    tHome.releasePointerCapture?.(ev.pointerId);
                } catch {
                    /* ignore */
                }
                openSwitcher();
            }, HOME_LONG_PRESS_MS);
            try {
                tHome.setPointerCapture?.(ev.pointerId);
            } catch {
                /* ignore */
            }
        },
        { capture: true }
    );

    const endHomePress = (): void => {
        clearLongPress();
    };
    tHome.addEventListener("pointerup", endHomePress, { capture: true });
    tHome.addEventListener("pointercancel", endHomePress, { capture: true });

    tHome.addEventListener("contextmenu", (ev) => {
        if (!isMobileChrome()) return;
        ev.preventDefault();
        longPressFired = true;
        clearLongPress();
        openSwitcher();
    });

    /*
    tViewer.addEventListener("click", () => {
        const desc = findWindowDesc("viewer") || findWindowDesc("markdown");
        if (desc) {
            activateWindowTask(String(desc.id || "viewer").toLowerCase());
            return;
        }
        getBy(taskList, VIEWER_TASK)!.focus = true;
    });

    tViewer.addEventListener("contextmenu", (ev) => {
        const desc = findWindowDesc("viewer") || findWindowDesc("markdown");
        if (!desc) {
            if (isMobileChrome()) return;
            ev.preventDefault();
            openUnifiedContextMenu({
                x: ev.clientX,
                y: ev.clientY,
                compact: true,
                anchor: tViewer,
                items: [
                    {
                        id: "open-markdown",
                        label: "Open Markdown",
                        icon: "article",
                        action: () => opts.onViewer()
                    }
                ]
            });
            return;
        }
        openTaskContextMenu(ev, String(desc.id || "viewer"), desc.title || "Markdown");
    });
*/

    const onDocPointer = (ev: Event): void => {
        if (!switcherOpen) return;
        const path = typeof (ev as PointerEvent).composedPath === "function" ? (ev as PointerEvent).composedPath() : [];
        for (const n of path) {
            if (n === switcher || n === tHome) return;
            if (n instanceof Element && (n === switcher || switcher.contains(n) || n === tHome)) return;
        }
        closeSwitcher();
    };
    document.addEventListener("pointerdown", onDocPointer, { capture: true });
    cleanupFns.push(() => document.removeEventListener("pointerdown", onDocPointer, { capture: true } as EventListenerOptions));

    const paintActive = (): void => {
        const id = String(opts.focusedTaskId.value || "home");
        const mark = (el: HTMLElement, active: boolean) => {
            el.toggleAttribute("data-env-active", active);
            el.toggleAttribute("data-active", active);
            el.toggleAttribute("data-focus", active);
        };
        mark(tHome, id === "home");
        /*mark(tViewer, id === "viewer" || id === "markdown");*/
        for (const [viewId, el] of windowTaskEls) {
            mark(el, id === viewId);
        }
    };

    effect(
        () => {
            paintActive();
        },
        [opts.focusedTaskId],
        { triggerImmediately: true }
    );

    const ensureWindowTask = (desc: EnvWindowTaskDescriptor): void => {
        const viewId = String(desc.id || "").trim().toLowerCase();
        if (!viewId || viewId === "home") return;
        const taskId = winTaskId(viewId);
        const title = desc.title || viewId;
        const iconName = String(desc.icon || "").trim() || "app-window";
        let el = windowTaskEls.get(viewId);
        if (!el) {
            const task = makeTask(
                taskId,
                null,
                { title, icon: iconName },
                { viewId },
                function (this: ITask) {
                    for (const t of taskList) {
                        if (t !== this) t.active = false;
                    }
                    this.active = true;
                    activateWindowTask(viewId);
                }
            );
            task.list = taskList;
            taskList.push(task);

            el = document.createElement("ui-task");
            // WHY: set attrs before connect so first UITask render sees real title/icon.
            el.setAttribute("data-id", taskId);
            el.setAttribute("data-view", viewId);
            el.setAttribute("title", title);
            el.setAttribute("aria-label", title);
            el.setAttribute("icon", iconName);
            el.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                // Direct toggle path — do not use `task.focus = true` (no-op when already focused).
                activateWindowTask(viewId);
            });
            el.addEventListener("contextmenu", (ev) => {
                openTaskContextMenu(ev, viewId, title);
            });
            windowTaskEls.set(viewId, el);
            windowsHost.appendChild(el);
        }
        el.setAttribute("title", title);
        el.setAttribute("aria-label", title);
        el.setAttribute("icon", iconName);
        el.toggleAttribute("data-minimized", Boolean(desc.minimized));
        el.hidden = desc.visible === false;
    };

    const syncWindowTasks = (windows: EnvWindowTaskDescriptor[]): void => {
        lastWindows = Array.isArray(windows) ? windows.slice() : [];
        const seen = new Set<string>();
        for (const w of windows) {
            const id = String(w.id || "").trim().toLowerCase();
            if (!id || id === "home") continue;
            seen.add(id);
            ensureWindowTask(w);
            if (w.focused) {
                opts.focusedTaskId.value = id;
            }
        }
        for (const [viewId, el] of [...windowTaskEls.entries()]) {
            if (seen.has(viewId)) continue;
            const taskId = winTaskId(viewId);
            const t = getBy(taskList, taskId);
            if (t) {
                const idx = taskList.indexOf(t);
                if (idx >= 0) taskList.splice(idx, 1);
            }
            el.remove();
            windowTaskEls.delete(viewId);
        }
        paintActive();
        if (switcherOpen) openSwitcher();
    };

    const setFocusedTaskId = (id: string): void => {
        const raw = String(id || "home").toLowerCase();
        let taskId = HOME_TASK;
        if (raw === "viewer" || raw === "markdown") taskId = VIEWER_TASK;
        else if (raw !== "home") taskId = winTaskId(raw);

        const t = getBy(taskList, taskId);
        if (t) {
            for (const x of taskList) {
                if (x !== t) x.active = false;
            }
            t.active = true;
        }
        opts.focusedTaskId.value = raw === "markdown" ? "viewer" : raw;
        paintActive();
    };

    scheduler?.yield?.()?.then?.(syncStartChrome);

    if (appMenu) {
        const onAppMenuSurface = (): void => syncAppMenuChrome();
        bar.addEventListener("env-app-menu-open", onAppMenuSurface);
        bar.addEventListener("env-app-menu-close", onAppMenuSurface);
        cleanupFns.push(() => {
            bar.removeEventListener("env-app-menu-open", onAppMenuSurface);
            bar.removeEventListener("env-app-menu-close", onAppMenuSurface);
        });
    }

    const dispose = (): void => {
        clearLongPress();
        closeSwitcher();
        appMenu?.dispose();
        for (const fn of cleanupFns) {
            try {
                fn();
            } catch {
                /* ignore */
            }
        }
        cleanupFns.length = 0;
        windowTaskEls.clear();
        windowsHost.replaceChildren();
    };

    return {
        element: bar,
        taskList,
        setFocusedTaskId,
        syncWindowTasks,
        appMenu,
        openAppMenu: appMenu ? openAppMenuFromDesktop : undefined,
        openAppMenuPage: appMenu ? openAppMenuPage : undefined,
        isSwitcherOpen: () => switcherOpen,
        closeSwitcher,
        dispose
    };
}
