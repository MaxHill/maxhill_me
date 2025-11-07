import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import type { MListBoxItem } from "./list-box-item";
import styles from "./list-box.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form-associated listbox for single or multiple selection
 *
 * # Single selection
 * <m-list-box name="fruit" value="apple">
 *   <m-list-box-item value="apple">Apple</m-list-box-item>
 *   <m-list-box-item value="pear">Pear</m-list-box-item>
 * </m-list-box>
 * 
 * # Multiple selection
 * <m-list-box name="fruits" multiple>
 *   <m-list-box-item value="apple">Apple</m-list-box-item>
 *   <m-list-box-item value="pear">Pear</m-list-box-item>
 * </m-list-box>
 * 
 * # In a form
 * <form id="myForm">
 *   <m-list-box name="fruit">
 *     <m-list-box-item value="apple">Apple</m-list-box-item>
 *     <m-list-box-item value="pear">Pear</m-list-box-item>
 *   </m-list-box>
 *   <button type="submit">Submit</button>
 * </form>
 * <pre id="output"></pre>
 * 
 * <script >
 *   document.getElementById('myForm').addEventListener('submit', (e) => {
 *     e.preventDefault();
 *     const formData = new FormData(e.target);
 *     const data = Object.fromEntries(formData.entries());
 *     document.getElementById('output').textContent = JSON.stringify(data, null, 2);
 *   });
 * </script>
 *
 * @customElement
 * @tagname m-list-box
 */
export class MListBox extends MElement {
    static tagName = 'm-list-box';
    static observedAttributes = ['value', 'name', 'disabled', 'multiple'];
    static formAssociated = true;

    #shadowRoot: ShadowRoot;
    #internals: ElementInternals;
    #initialValue: string = '';
    #activeIndex: number = -1;

    @BindAttribute()
    value: string = '';

    @BindAttribute()
    name: string = '';

    @BindAttribute()
    disabled: boolean = false;

    @BindAttribute()
    multiple: boolean = false;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
        this.#internals = this.attachInternals();
    }

    connectedCallback() {
        this.#initialValue = this.getAttribute('value') ?? '';
        this.#setupAccessibility();
        this.#setupEventListeners();
        this.#applyFormValue();
        this.#updateItems();
        this.render();
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === "value" && oldValue !== newValue) {
            this.#applyFormValue();
            this.#updateItems();
            this.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (name === "disabled") {
            this.#updateDisabledState();
        } else if (name === "multiple") {
            if (this.multiple) {
                this.setAttribute('aria-multiselectable', 'true');
            } else {
                this.removeAttribute('aria-multiselectable');
            }
        }
    }

    selectValue(itemValue: string) {
        if (this.disabled) return;

        if (this.multiple) {
            const values = this.value ? this.value.split(',') : [];
            const index = values.indexOf(itemValue);
            
            if (index === -1) {
                values.push(itemValue);
            } else {
                values.splice(index, 1);
            }
            
            this.value = values.join(',');
        } else {
            if (this.value !== itemValue) {
                this.value = itemValue;
            }
        }
    }

    #applyFormValue() {
        this.#internals.setFormValue(this.value || '');
    }

    #updateItems() {
        const items = this.#getItems();
        const selectedValues = this.multiple && this.value 
            ? this.value.split(',') 
            : [this.value];

        items.forEach((item, index) => {
            const isSelected = selectedValues.includes(item.value);
            item.setAttribute('aria-selected', String(isSelected));
            item.selected = isSelected;
            
            if (!item.id) {
                item.id = `${this.id || 'listbox'}-option-${index}`;
            }
        });
    }

    #getItems(): MListBoxItem[] {
        return Array.from(this.querySelectorAll('m-list-box-item')) as MListBoxItem[];
    }

    #setupAccessibility() {
        this.setAttribute('role', 'listbox');
        
        if (!this.hasAttribute('tabindex')) {
            this.setAttribute('tabindex', '0');
        }

        if (this.multiple) {
            this.setAttribute('aria-multiselectable', 'true');
        }

        this.#updateDisabledState();
    }

    #updateDisabledState() {
        if (this.disabled) {
            this.setAttribute('aria-disabled', 'true');
            this.setAttribute('tabindex', '-1');
        } else {
            this.removeAttribute('aria-disabled');
            this.setAttribute('tabindex', '0');
        }
    }

    #setupEventListeners() {
        this.addEventListener('mousedown', this.#handleMouseDown.bind(this));
        this.addEventListener('click', this.#handleClick.bind(this));
        this.addEventListener('keydown', this.#handleKeyDown.bind(this));
        this.addEventListener('focus', this.#handleFocus.bind(this));
    }

    #handleMouseDown(e: Event) {
        if (this.disabled) return;

        const target = e.target as HTMLElement;
        const item = target.closest('m-list-box-item') as MListBoxItem;
        
        if (item && item.value && !item.disabled) {
            const items = this.#getItems();
            const itemIndex = items.indexOf(item);
            if (itemIndex >= 0) {
                this.#setActiveIndex(itemIndex, items);
            }
        }
    }

    #handleClick(e: Event) {
        if (this.disabled) return;

        const target = e.target as HTMLElement;
        const item = target.closest('m-list-box-item') as MListBoxItem;
        
        if (item && item.value && !item.disabled) {
            this.selectValue(item.value);
        }
    }

    #handleFocus() {
        if (this.#activeIndex === -1) {
            this.#initializeVirtualFocus();
        }
    }

    #handleKeyDown(e: KeyboardEvent) {
        if (this.disabled) return;

        const items = this.#getItems();
        if (items.length === 0) return;

        let nextIndex = this.#activeIndex;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (nextIndex < 0) {
                    nextIndex = 0;
                } else if (nextIndex < items.length - 1) {
                    nextIndex++;
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (nextIndex < 0) {
                    nextIndex = items.length - 1;
                } else if (nextIndex > 0) {
                    nextIndex--;
                }
                break;
            case 'Home':
                e.preventDefault();
                nextIndex = 0;
                break;
            case 'End':
                e.preventDefault();
                nextIndex = items.length - 1;
                break;
            case ' ':
            case 'Enter':
                e.preventDefault();
                const activeItem = items[this.#activeIndex >= 0 ? this.#activeIndex : 0];
                if (activeItem?.value && !activeItem.disabled) {
                    this.selectValue(activeItem.value);
                }
                return;
            default:
                return;
        }

        if (nextIndex !== this.#activeIndex && nextIndex >= 0 && items[nextIndex]) {
            this.#setActiveIndex(nextIndex, items);
        }
    }

    #setActiveIndex(index: number, items?: MListBoxItem[]) {
        const itemList = items || this.#getItems();
        if (index < 0 || index >= itemList.length) return;

        const previousActiveItem = this.#activeIndex >= 0 && this.#activeIndex < itemList.length 
            ? itemList[this.#activeIndex] 
            : null;
        
        if (previousActiveItem) {
            previousActiveItem.setVirtualFocus(false);
        }

        this.#activeIndex = index;
        const activeItem = itemList[index];
        
        if (activeItem?.id) {
            this.setAttribute('aria-activedescendant', activeItem.id);
            activeItem.setVirtualFocus(true);
        }
    }

    #initializeVirtualFocus() {
        const items = this.#getItems();
        if (items.length === 0) return;

        let initialIndex = -1;

        if (this.value) {
            const selectedValues = this.multiple 
                ? this.value.split(',') 
                : [this.value];
            
            initialIndex = items.findIndex(item => selectedValues.includes(item.value));
        }

        if (initialIndex === -1) {
            initialIndex = 0;
        }

        this.#setActiveIndex(initialIndex, items);
    }

    render() {
        this.#shadowRoot.innerHTML = `
            <slot></slot>
        `;
    }

    //  ------------------------------------------------------------------------
    //  Form callbacks                                                                     
    //  ------------------------------------------------------------------------ 
    formResetCallback() {
        this.value = this.#initialValue;
    }

    formDisabledCallback(disabled: boolean) {
        this.disabled = disabled;
    }

    formStateRestoreCallback(state: string) {
        this.value = state;
    }
} 
