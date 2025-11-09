import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import type { MListBoxItem } from "./list-box-item";
import styles from "./list-box.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);


interface MListBoxSelectEventDetail {
    item: MListBoxItem;
    selected: boolean;
}

interface MListBoxChangeEventDetail {
    selected: string[];
}

interface MListBoxFocusChangeEventDetail {
    item: MListBoxItem | null;
}

export class MListBox extends MElement {
    static tagName = 'm-list-box';
    static formAssociated = true;
    static observedAttributes = ['multiple'];

    private focusedElement: MListBoxItem | null = null;
    private internals: ElementInternals;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<slot></slot>`;
        shadow.adoptedStyleSheets = [baseStyleSheet];
        this.internals = this.attachInternals();
        this.tabIndex = 0;
    }

    /*** ----------------------------
     *  Lifecycle
     * ----------------------------- */
    connectedCallback(): void {
        this.addEventListener('keydown', this.handleKeydown);
        this.addEventListener('focus', this.handleFocus, true);
        this.addEventListener('blur', this.handleBlur, true);
        this.addEventListener('click', this.handleClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('keydown', this.handleKeydown);
        this.removeEventListener('focus', this.handleFocus, true);
        this.removeEventListener('blur', this.handleBlur, true);
        this.removeEventListener('click', this.handleClick);
    }


    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        // TODO: will this really work
        if (name === 'multiple') {
            // Reset selection when switching modes
            this.items.forEach(item => (item.selected = false));
            this.focusedElement = null;
            this.updateFormValue();
        }
    }

    /*** ----------------------------
     *  Getters / Form Accessors
     * ----------------------------- */
    private get items(): MListBoxItem[] {
        // Query light DOM children (slotted items)
        return Array.from(this.querySelectorAll<MListBoxItem>('m-list-box-item'));
    }

    private get selected(): MListBoxItem[] {
        return this.items.filter(item => !!item.selected);
    }

    get value(): string | null {
        return this.selected[0]?.value ?? null;
    }

    get values(): string[] {
        return this.selected.reduce<string[]>((acc, item) => {
            if (item.value) acc.push(item.value);
            return acc;
        }, []);
    }

    get multiple(): boolean {
        return this.hasAttribute('multiple');
    }

    set multiple(value: boolean) {
        if (value) this.setAttribute('multiple', '');
        else this.removeAttribute('multiple');
    }

    get form(): HTMLFormElement | null {
        return this.internals.form;
    }

    get name(): string {
        return this.getAttribute('name') ?? '';
    }

    set name(value: string) {
        this.setAttribute('name', value);
    }

    /*** ----------------------------
     *  Form association
     * ----------------------------- */
    private updateFormValue(): void {
        if (this.values.length === 0) {
            this.internals.setFormValue(null);
        } else if (this.values.length === 1) {
            this.internals.setFormValue(this.values[0]);
        } else {
            const formData = new FormData();
            for (const val of this.values) formData.append(this.name, val);
            this.internals.setFormValue(formData);
        }
    }

    formAssociatedCallback(): void {
        this.updateFormValue();
    }

    formResetCallback(): void {
        this.items.forEach(item => (item.selected = false));
        this.focusedElement = null;
        this.updateFormValue();
    }

    /*** ----------------------------
     *  Focus Management
     * ----------------------------- */
    setFocus(item: MListBoxItem | null): void {
        if (!item) return;
        if (this.focusedElement) this.focusedElement.removeAttribute('focused');

        item.focused = true
        this.focusedElement = item;

        this.dispatchEvent(
            new CustomEvent<MListBoxFocusChangeEventDetail>('m-listbox-focus-change', {
                detail: { item },
                bubbles: true,
                composed: true,
            })
        );
    }

    focusFirst(): void {
        this.setFocus(this.items[0] ?? null);
    }

    focusLast(): void {
        this.setFocus(this.items[this.items.length - 1] ?? null);
    }

    focusNext(): void {
        if (!this.focusedElement) return this.focusFirst();
        const idx = this.items.indexOf(this.focusedElement);
        const next = this.items[idx + 1] ?? this.items[0];
        this.setFocus(next);
    }

    focusPrev(): void {
        if (!this.focusedElement) return this.focusLast();
        const idx = this.items.indexOf(this.focusedElement);
        const prev = this.items[idx - 1] ?? this.items[this.items.length - 1];
        this.setFocus(prev);
    }

    focusBlur(): void {
        if (this.focusedElement) {
            this.focusedElement.removeAttribute('focused');
            this.focusedElement = null;
        }
    }

    /*** ----------------------------
     *  Selection Management
     * ----------------------------- */
    select(item: MListBoxItem | null): void {
        if (!item) return;

        if (!this.multiple) {
            // single-select mode: reset others
            this.items.forEach(i => {
                if (i !== item && i.selected) {
                    i.selected = false;
                    this.dispatchEvent(
                        new CustomEvent<MListBoxSelectEventDetail>('m-listbox-unselected', {
                            detail: { item: i, selected: false },
                            bubbles: true,
                            composed: true,
                        })
                    );
                }
            });
            // select new item
            item.selected = true;
            this.setFocus(item); // focus always = selection
        } else {
            // multiple mode: toggle selection
            item.selected = !item.selected;
        }

        const eventName = item.selected ? 'm-listbox-select' : 'm-listbox-unselected';
        this.dispatchEvent(
            new CustomEvent<MListBoxSelectEventDetail>(eventName, {
                detail: { item, selected: item.selected! },
                bubbles: true,
                composed: true,
            })
        );

        this.dispatchEvent(
            new CustomEvent<MListBoxChangeEventDetail>('m-listbox-change', {
                detail: { selected: this.values },
                bubbles: true,
                composed: true,
            })
        );

        this.updateFormValue();
    }

    selectFocused(): void {
        if (this.focusedElement) this.select(this.focusedElement);
    }

    selectFirst(): void {
        if (this.items[0]) this.select(this.items[0]);
    }

    selectLast(): void {
        if (this.items.length) this.select(this.items[this.items.length - 1]);
    }

    selectNext(): void {
        if (!this.focusedElement) return this.selectFirst();
        const idx = this.items.indexOf(this.focusedElement);
        const next = this.items[idx + 1] ?? this.items[0];
        this.select(next);
    }

    selectPrev(): void {
        if (!this.focusedElement) return this.selectLast();
        const idx = this.items.indexOf(this.focusedElement);
        const prev = this.items[idx - 1] ?? this.items[this.items.length - 1];
        this.select(prev);
    }

    /*** ----------------------------
     *  Event Handlers
     * ----------------------------- */
    private handleKeydown = (event: KeyboardEvent) => {
        event.stopPropagation();
        if (!this.multiple) {
            // single-select: arrows select
            switch (event.key) {
                case 'ArrowDown':
                    this.selectNext();
                    event.preventDefault();
                    break;
                case 'ArrowUp':
                    this.selectPrev();
                    event.preventDefault();
                    break;
                case 'Home':
                    this.selectFirst();
                    event.preventDefault();
                    break;
                case 'End':
                    this.selectLast();
                    event.preventDefault();
                    break;
                case ' ':
                case 'Enter':
                    this.selectFocused();
                    event.preventDefault();
                    break;
            }
        } else {
            // multiple-select: arrows only focus
            switch (event.key) {
                case 'ArrowDown':
                    this.focusNext();
                    event.preventDefault();
                    break;
                case 'ArrowUp':
                    this.focusPrev();
                    event.preventDefault();
                    break;
                case 'Home':
                    this.focusFirst();
                    event.preventDefault();
                    break;
                case 'End':
                    this.focusLast();
                    event.preventDefault();
                    break;
                case ' ':
                case 'Enter':
                    this.selectFocused();
                    event.preventDefault();
                    break;
            }
        }
    };

    private handleFocus = () => {
        if (!this.focusedElement) this.focusFirst();
    };

    private handleBlur = () => {
        this.focusBlur();
    };

    private handleClick = (event: MouseEvent) => {
        const item = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-LIST-BOX-ITEM') as
            | MListBoxItem
            | undefined;

        if (item) {
            if (!this.multiple) this.select(item);
            else {
                this.setFocus(item);
                this.select(item);
            }
        }
    };
}



// /**
//  * Form-associated listbox for single or multiple selection
//  *
//  * # Single selection
//  * <m-list-box name="fruit" value="apple">
//  *   <m-list-box-item value="apple">Apple</m-list-box-item>
//  *   <m-list-box-item value="pear">Pear</m-list-box-item>
//  * </m-list-box>
//  * 
//  * # Multiple selection
//  * <m-list-box name="fruits" multiple>
//  *   <m-list-box-item value="apple">Apple</m-list-box-item>
//  *   <m-list-box-item value="pear">Pear</m-list-box-item>
//  * </m-list-box>
//  * 
//  * # In a form
//  * <form id="myForm">
//  *   <m-list-box name="fruit">
//  *     <m-list-box-item value="apple">Apple</m-list-box-item>
//  *     <m-list-box-item value="pear">Pear</m-list-box-item>
//  *   </m-list-box>
//  *   <button type="submit">Submit</button>
//  * </form>
//  * <pre id="output"></pre>
//  * 
//  * <script >
//  *   document.getElementById('myForm').addEventListener('submit', (e) => {
//  *     e.preventDefault();
//  *     const formData = new FormData(e.target);
//  *     const data = Object.fromEntries(formData.entries());
//  *     document.getElementById('output').textContent = JSON.stringify(data, null, 2);
//  *   });
//  * </script>
//  *
//  * @customElement
//  * @tagname m-list-box
//  */
// export class MListBox extends MElement {
//     static tagName = 'm-list-box';
//     static observedAttributes = ['value', 'name', 'disabled', 'multiple'];
//     static formAssociated = true;
//
//     #shadowRoot: ShadowRoot;
//     #internals: ElementInternals;
//     #initialValue: string = '';
//     #activeIndex: number = -1;
//
//     @BindAttribute()
//     value: string = '';
//
//     @BindAttribute()
//     name: string = '';
//
//     @BindAttribute()
//     disabled: boolean = false;
//
//     @BindAttribute()
//     multiple: boolean = false;
//
//     constructor() {
//         super();
//         this.#shadowRoot = this.attachShadow({ mode: 'open' });
//         this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
//         this.#internals = this.attachInternals();
//     }
//
//     connectedCallback() {
//         this.#initialValue = this.getAttribute('value') ?? '';
//         this.#setupAccessibility();
//         this.#setupEventListeners();
//         this.#applyFormValue();
//         this.#updateItems();
//         this.render();
//     }
//
//     attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
//         super.attributeChangedCallback(name, oldValue, newValue);
//
//         if (name === "value" && oldValue !== newValue) {
//             this.#applyFormValue();
//             this.#updateItems();
//             this.dispatchEvent(new Event('change', { bubbles: true }));
//         } else if (name === "disabled") {
//             this.#updateDisabledState();
//         } else if (name === "multiple") {
//             if (this.multiple) {
//                 this.setAttribute('aria-multiselectable', 'true');
//             } else {
//                 this.removeAttribute('aria-multiselectable');
//             }
//         }
//     }
//
//     selectValue(itemValue: string) {
//         if (this.disabled) return;
//
//         if (this.multiple) {
//             const values = this.value ? this.value.split(',') : [];
//             const index = values.indexOf(itemValue);
//
//             if (index === -1) {
//                 values.push(itemValue);
//             } else {
//                 values.splice(index, 1);
//             }
//
//             this.value = values.join(',');
//         } else {
//             if (this.value !== itemValue) {
//                 this.value = itemValue;
//             }
//         }
//     }
//
//     #applyFormValue() {
//         this.#internals.setFormValue(this.value || '');
//     }
//
//     #updateItems() {
//         const items = this.#getItems();
//         const selectedValues = this.multiple && this.value 
//             ? this.value.split(',') 
//             : [this.value];
//
//         items.forEach((item, index) => {
//             const isSelected = selectedValues.includes(item.value);
//             item.setAttribute('aria-selected', String(isSelected));
//             item.selected = isSelected;
//
//             if (!item.id) {
//                 item.id = `${this.id || 'listbox'}-option-${index}`;
//             }
//         });
//     }
//
//     #getItems(): MListBoxItem[] {
//         return Array.from(this.querySelectorAll('m-list-box-item')) as MListBoxItem[];
//     }
//
//     #setupAccessibility() {
//         this.setAttribute('role', 'listbox');
//
//         if (!this.hasAttribute('tabindex')) {
//             this.setAttribute('tabindex', '0');
//         }
//
//         if (this.multiple) {
//             this.setAttribute('aria-multiselectable', 'true');
//         }
//
//         this.#updateDisabledState();
//     }
//
//     #updateDisabledState() {
//         if (this.disabled) {
//             this.setAttribute('aria-disabled', 'true');
//             this.setAttribute('tabindex', '-1');
//         } else {
//             this.removeAttribute('aria-disabled');
//             this.setAttribute('tabindex', '0');
//         }
//     }
//
//     #setupEventListeners() {
//         this.addEventListener('click', this.#handleClick.bind(this));
//         this.addEventListener('keydown', this.#handleKeyDown.bind(this));
//         this.addEventListener('focus', this.#handleFocus.bind(this));
//     }
//
//     #handleClick(e: Event) {
//         if (this.disabled) return;
//
//         const target = e.target as HTMLElement;
//         const item = target.closest('m-list-box-item') as MListBoxItem;
//
//         if (item && item.value && !item.disabled) {
//             this.selectValue(item.value);
//         }
//     }
//
//     #handleFocus() {
//         if (this.#activeIndex === -1) {
//             this.#initializeVirtualFocus();
//         }
//     }
//
//     #handleKeyDown(e: KeyboardEvent) {
//         if (this.disabled) return;
//
//         const items = this.#getItems();
//         if (items.length === 0) return;
//
//         let nextIndex = this.#activeIndex;
//
//         switch (e.key) {
//             case 'ArrowDown':
//                 e.preventDefault();
//                 if (nextIndex < 0) {
//                     nextIndex = 0;
//                 } else if (nextIndex < items.length - 1) {
//                     nextIndex++;
//                 }
//                 break;
//             case 'ArrowUp':
//                 e.preventDefault();
//                 if (nextIndex < 0) {
//                     nextIndex = items.length - 1;
//                 } else if (nextIndex > 0) {
//                     nextIndex--;
//                 }
//                 break;
//             case 'Home':
//                 e.preventDefault();
//                 nextIndex = 0;
//                 break;
//             case 'End':
//                 e.preventDefault();
//                 nextIndex = items.length - 1;
//                 break;
//             case ' ':
//             case 'Enter':
//                 e.preventDefault();
//                 const activeItem = items[this.#activeIndex >= 0 ? this.#activeIndex : 0];
//                 if (activeItem?.value && !activeItem.disabled) {
//                     this.selectValue(activeItem.value);
//                 }
//                 return;
//             default:
//                 return;
//         }
//
//         if (nextIndex !== this.#activeIndex && nextIndex >= 0 && items[nextIndex]) {
//             this.#setActiveIndex(nextIndex, items);
//         }
//     }
//
//     #setActiveIndex(index: number, items?: MListBoxItem[]) {
//         const itemList = items || this.#getItems();
//         if (index < 0 || index >= itemList.length) return;
//
//         this.#activeIndex = index;
//         const activeItem = itemList[index];
//
//         if (activeItem?.id) {
//             this.setAttribute('aria-activedescendant', activeItem.id);
//         }
//     }
//
//     #initializeVirtualFocus() {
//         const items = this.#getItems();
//         if (items.length === 0) return;
//
//         let initialIndex = -1;
//
//         if (this.value) {
//             const selectedValues = this.multiple 
//                 ? this.value.split(',') 
//                 : [this.value];
//
//             initialIndex = items.findIndex(item => selectedValues.includes(item.value));
//         }
//
//         if (initialIndex === -1) {
//             initialIndex = 0;
//         }
//
//         this.#setActiveIndex(initialIndex, items);
//     }
//
//     render() {
//         this.#shadowRoot.innerHTML = `
//             <slot></slot>
//         `;
//     }
//
//     //  ------------------------------------------------------------------------
//     //  Form callbacks                                                                     
//     //  ------------------------------------------------------------------------ 
//     formResetCallback() {
//         this.value = this.#initialValue;
//     }
//
//     formDisabledCallback(disabled: boolean) {
//         this.disabled = disabled;
//     }
//
//     formStateRestoreCallback(state: string) {
//         this.value = state;
//     }
// } 
