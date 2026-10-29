/*
 * Filename: forms.ts
 * FullPath: modules/projects/fl.ui/test/suites/forms.ts
 * Reason for changes: Exercise unified Linker form binding and mount lifecycle.
 */

import { bindFormControl } from "@fest-lib/lure";
import { affected, booleanRef, numberRef, stringRef } from "@fest-lib/object";

export function mount(el: HTMLElement): void {
    el.style.cssText =
        "display:flex;flex-direction:column;gap:1rem;padding:1rem;position:relative;box-sizing:border-box;";

    const caption = document.createElement("p");
    caption.className = "fl-ui-dev-suite-caption";
    caption.textContent =
        "Forms — text, number, checked, select, and radio bindings share one Linker lifecycle and survive remounts.";

    const form = document.createElement("form");
    form.style.cssText =
        "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;max-inline-size:36rem;padding:1rem;border:1px solid #3f5278;border-radius:12px;";

    const makeField = (labelText: string, control: HTMLElement) => {
        const label = document.createElement("label");
        label.style.cssText = "display:grid;gap:.25rem;";
        label.append(labelText, control);
        return label;
    };
    const text = document.createElement("input");
    text.type = "text";
    const number = document.createElement("input");
    number.type = "number";
    const checked = document.createElement("input");
    checked.type = "checkbox";
    const select = document.createElement("select");
    for (const value of ["alpha", "beta", "gamma"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
    }
    const radioGroup = document.createElement("fieldset");
    radioGroup.style.cssText = "display:flex;gap:.5rem;grid-column:1/-1;";
    for (const value of ["left", "right"]) {
        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "form-demo-side";
        radio.value = value;
        label.append(radio, value);
        radioGroup.append(label);
    }
    form.append(
        makeField("Text", text),
        makeField("Number", number),
        makeField("Checked", checked),
        makeField("Select", select),
        radioGroup,
    );

    const textValue = stringRef("hello");
    const numberValue = numberRef(4);
    const checkedValue = booleanRef(true);
    const selectValue = stringRef("beta");
    const radioValue = stringRef("left");
    bindFormControl(text, textValue, "text");
    bindFormControl(number, numberValue, "number");
    bindFormControl(checked, checkedValue, "checked");
    bindFormControl(select, selectValue, "select");
    bindFormControl(radioGroup, radioValue, "radio", { name: "form-demo-side" });

    const status = document.createElement("output");
    status.style.cssText = "font:0.8rem ui-monospace,monospace;color:#9bb6df;";
    const renderStatus = () => {
        status.value = `text=${textValue.value} · number=${numberValue.value} · checked=${checkedValue.value} · select=${selectValue.value} · radio=${radioValue.value}`;
    };
    [textValue, numberValue, checkedValue, selectValue, radioValue].forEach((value) => affected(value, renderStatus));
    form.addEventListener("input", () => queueMicrotask(renderStatus));
    form.addEventListener("change", () => queueMicrotask(renderStatus));
    renderStatus();

    const remount = document.createElement("button");
    remount.type = "button";
    remount.textContent = "Unmount and remount form";
    remount.addEventListener("click", () => {
        form.remove();
        queueMicrotask(() => {
            el.moveBefore(form, status);
            renderStatus();
        });
    });

    el.append(caption, form, remount, status);
}
