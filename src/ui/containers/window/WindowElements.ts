/**
 * Web components for the anchored window shell (light DOM — junction mixins resolve handles in the host tree).
 *
 * NOTE: Tags are `app-box` and `window-titlebar` (HTML requires a hyphen).
 */

/** Outer frame: grid host for titlebar + body + resizer. */
export const APP_BOX_TAG = "app-box" as const;

/** Draggable title strip; sets `data-junction-ignore-select` for junction select mixin. */
export const WINDOW_TITLEBAR_TAG = "window-titlebar" as const;

/** Register custom elements when missing (idempotent). */
export function ensureWindowElementsDefined(): void {
    if (!customElements.get(APP_BOX_TAG)) {
        try {
            customElements.define(APP_BOX_TAG, AppBoxElement);
        } catch {
            /* duplicate */
        }
    }
    if (!customElements.get(WINDOW_TITLEBAR_TAG)) {
        try {
            customElements.define(WINDOW_TITLEBAR_TAG, WindowTitlebarElement);
        } catch {
            /* duplicate */
        }
    }
}



export class AppBoxElement extends (typeof HTMLElement != "undefined" ? HTMLElement : (Object as any)) {
    connectedCallback(): void {
        if (this.dataset.flReady === "1") return;
        this.dataset.flReady = "1";
        this.classList.add("ui-anchored-window");
        if (!this.getAttribute("role")) this.setAttribute("role", "region");
    }
}

export class WindowTitlebarElement extends (typeof HTMLElement != "undefined" ? HTMLElement : (Object as any)) {
    static get observedAttributes(): string[] {
        return ["heading"];
    }

    connectedCallback(): void {
        if (this.dataset.flReady === "1") return;
        this.dataset.flReady = "1";
        this.classList.add("ui-anchored-window__titlebar");
        this.toggleAttribute("data-junction-ignore-select", true);
        if (!this.getAttribute("role")) this.setAttribute("role", "banner");
        this.applyHeadingFromAttribute();
    }

    attributeChangedCallback(name: string, _old: string | null, _new: string | null): void {
        if (name === "heading" && this.dataset.flReady === "1") this.applyHeadingFromAttribute();
    }

    /** Mirror `heading` into text when there is no element markup (plain string title). */
    private applyHeadingFromAttribute(): void {
        const heading = this.getAttribute("heading");
        if (heading == null || heading === "") return;
        if (this.querySelector(":scope > *")) return;
        this.textContent = heading;
    }
}
