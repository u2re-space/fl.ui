import { property, defineElement, H, registerOverlayElement, createDropShadow, ScrollBar } from "@fest-lib/lure"
import { UIElement } from "fl-ui/base/UIElement"

//
const withScrollbarsSymbol = Symbol.for("ui.scrollframe.withScrollbars");
globalThis[withScrollbarsSymbol] ??= new WeakMap();
export const withScrollbars = globalThis[withScrollbarsSymbol];

// @ts-ignore
@defineElement("ui-scrollframe")
export class ScrollBoxed extends UIElement {
    @property({source: "attr"}) anchor = "_";
    #x: any = null;
    #y: any = null;

    // waiting until connected
    #holder: any = null;
    #content: any = null;
    #inputChange: any = null;
    #shadows: any[] = [];

    //
    constructor() { super(); }
    onInitialize() {
        super.onInitialize?.();
        this.enableScrollbars();
    }

    //
    enableScrollbars() {
        const self = this as any;
        if (this.#content) {
            scheduler?.yield?.()?.then?.(() => {
                if (self.isConnected) {//@ts-ignore
                    this.#x ??= new ScrollBar({ holder: this.#holder, scrollbar: self.shadowRoot?.querySelector?.(".ui-scrollbar[axis=\"x\"]"), content: this.#content, inputChange: this.#inputChange }, 0); //@ts-ignore
                    this.#y ??= new ScrollBar({ holder: this.#holder, scrollbar: self.shadowRoot?.querySelector?.(".ui-scrollbar[axis=\"y\"]"), content: this.#content, inputChange: this.#inputChange }, 1); //@ts-ignore
                    self.style.zIndex = (Number(getComputedStyle(this.#content)?.zIndex || 0) + 1) + "";

                    // Add underlying shadows for better visual integration
                    this.createScrollbarShadows();
                }
            });
        }
    }

    //
    onRender() {
        super.onRender();
    }

    //
    activateScrollbars(content: any, holder: any, inputChange?: any|null) {
        const self = this as any;
        this.#content = content;
        this.#holder = holder ?? self;
        this.#inputChange = inputChange;
        this.enableScrollbars();
    }

    //
    disconnectedCallback() {
        // Cleanup shadows when component is removed
        this.#shadows.forEach(shadow => shadow.destroy());
        this.#shadows = [];
    }

    //
    createScrollbarShadows() {
        const self = this as any;

        // Create subtle shadows for scrollbar elements
        const xScrollbar = self.shadowRoot?.querySelector?.(".ui-scrollbar[axis=\"x\"]");
        const yScrollbar = self.shadowRoot?.querySelector?.(".ui-scrollbar[axis=\"y\"]");

        if (xScrollbar) {
            const xShadow = createDropShadow(xScrollbar, {
                shadowColor: 'rgba(0, 0, 0, 0.1)',
                shadowBlur: 2,
                shadowOffsetY: 1,
                zIndexShift: -2,
                inset: -2
            });
            this.#shadows.push(xShadow);
        }

        if (yScrollbar) {
            const yShadow = createDropShadow(yScrollbar, {
                shadowColor: 'rgba(0, 0, 0, 0.1)',
                shadowBlur: 2,
                shadowOffsetX: 1,
                zIndexShift: -2,
                inset: -2
            });
            this.#shadows.push(yShadow);
        }
    }

    //
    render = () => H`
<slot></slot>
<div class="ui-scrollbar" axis="x"><div class="ui-thumb"></div></div>
<div class="ui-scrollbar" axis="y"><div class="ui-thumb"></div></div>`;
}

//
export default ScrollBoxed;

//
registerOverlayElement("ov-scrollbar", (content, holder?: any) => {
    if (withScrollbars?.has?.(content)) return false;

    //
    const self = document.createElement("ui-scrollframe");
    if (content) {
        withScrollbars?.set?.(content, self);

        //
        content.style.scrollbarGutter = "auto";
        content.style.scrollbarWidth = "none";
        content.style.scrollbarColor = "transparent transparent";
        content.style.overflowBlock = "hidden";
        content.style.overflowInline = "scroll";
        content.style.overflow = "scroll";

        //
        (self as any).activateScrollbars(content, holder);
    }

    //
    if (holder) {
        holder.style.overflow = "hidden";
        holder.style.scrollbarWidth = "none";
        holder.style.scrollbarColor = "transparent transparent";
        holder.style.scrollbarGutter = "auto";
    }

    //
    return self;
});
