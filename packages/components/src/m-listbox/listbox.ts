import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { query, queryAll } from "../utils/query";
import type { MListboxItem } from "./listbox-item";
import styles from "./listbox.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Event detail for m-listbox-select and m-listbox-unselected events
 */
export interface MListboxSelectEventDetail {
    /** The list box item that was selected or unselected */
    item: MListboxItem;
    /** Whether the item is now selected */
    selected: boolean;
}

/**
 * Event detail for m-listbox-change events
 */
export interface MListboxChangeEventDetail {
    /** Array of currently selected item values */
    selected: string[];
}

/**
 * Event detail for m-listbox-focus-change events
 */
export interface MListboxFocusChangeEventDetail {
    /** The list box item that received focus, or null if focus was cleared */
    item: MListboxItem | null;
}

/**
 * A form-associated listbox component for single or multiple selection.
 * Supports keyboard navigation, form integration, and accessible selection patterns.
 * 
 * @customElement
 * @tagname m-listbox
 * 
 * @example Basic usage
 * <m-listbox name="fruit">
 *   <m-listbox-item value="apple">Apple</m-listbox-item>
 *   <m-listbox-item value="pear">Pear</m-listbox-item>
 *   <m-listbox-item value="orange">Orange</m-listbox-item>
 * </m-listbox>
 * 
 * @example Multiple selection
 * <m-listbox name="fruits" multiple>
 *   <m-listbox-item value="apple">Apple</m-listbox-item>
 *   <m-listbox-item value="pear">Pear</m-listbox-item>
 *   <m-listbox-item value="orange">Orange</m-listbox-item>
 * </m-listbox>
 * 
 * @example Preselected value using selected attribute
 * <m-listbox name="fruit">
 *   <m-listbox-item value="apple">Apple</m-listbox-item>
 *   <m-listbox-item value="pear" selected>Pear</m-listbox-item>
 *   <m-listbox-item value="orange">Orange</m-listbox-item>
 * </m-listbox>
 * 
 * @example Preselected value using value attribute
 * <m-listbox name="fruit" value="pear">
 *   <m-listbox-item value="apple">Apple</m-listbox-item>
 *   <m-listbox-item value="pear">Pear</m-listbox-item>
 *   <m-listbox-item value="orange">Orange</m-listbox-item>
 * </m-listbox>
 * 
 * @example Form integration
 * <form id="fruit-form">
 *   <label>Select your favorite fruit:</label>
 *   <m-listbox name="favorite-fruit">
 *     <m-listbox-item value="apple">Apple</m-listbox-item>
 *     <m-listbox-item value="pear" selected>Pear</m-listbox-item>
 *     <m-listbox-item value="orange">Orange</m-listbox-item>
 *   </m-listbox>
 *   <button type="submit">Submit</button>
 *   <div class="box"></div>
 * </form>
 * ```js
 * const form = document.getElementById('fruit-form');
 * const box = form.querySelector('.box');
 * 
 * form.addEventListener('submit', (e) => {
 *   e.preventDefault();
 *   const formData = new FormData(form);
 *   box.textContent = `Selected: ${formData.get('favorite-fruit')}`;
 * });
 * ```
 * 
 * @example Accessing selected items
 * ```js
 * const listbox = document.querySelector('m-listbox');
 * 
 * // Get the current value (single-select mode)
 * console.log(listbox.value); // 'apple'
 * 
 * // Get all selected values (useful in multiple mode)
 * console.log(listbox.selectedValues); // ['apple', 'banana']
 * 
 * // Get selected item elements
 * listbox.selectedItems.forEach(item => {
 *   console.log(item.textContent); // 'Apple', 'Banana'
 *   console.log(item.value); // 'apple', 'banana'
 * });
 * ```
 * 
 * @example Programmatic selection
 * ```js
 * const listbox = document.querySelector('m-listbox');
 * 
 * // Select an item programmatically
 * const appleItem = listbox.querySelector('[value="apple"]');
 * listbox.select(appleItem);
 * 
 * // Navigate and select with methods
 * listbox.selectFirst(); // Select first item
 * listbox.selectNext();  // Select next item
 * listbox.selectLast();  // Select last item
 * ```
 * 
 * @example Listening to selection changes
 * ```js
 * const listbox = document.querySelector('m-listbox');
 * 
 * listbox.addEventListener('m-listbox-change', (e) => {
 *   console.log('Selected values:', e.detail.selected);
 * });
 * 
 * listbox.addEventListener('change', (e) => {
 *   console.log('Standard change event fired');
 *   console.log('Current value:', listbox.value);
 * });
 * ```
 * 
 * @slot - The default slot accepts m-listbox-item elements
 * 
 * @attr {string} name - The form control name
 * @attr {boolean} multiple - Whether multiple items can be selected
 * 
 * @prop {string | string[] | null} value - The value of the first selected item (or array in multiple mode)
 * @prop {string[]} selectedValues - Array of all selected item values
 * @prop {MListboxItem[]} selectedItems - Array of all selected item elements
 * @prop {boolean} multiple - Whether multiple selection is enabled
 * @prop {HTMLFormElement | null} form - The associated form element
 * @prop {string} name - The form control name
 * 
 * @event m-listbox-select - Fired when an item is selected. Detail: { item: MListboxItem, selected: boolean }
 * @event m-listbox-unselected - Fired when an item is unselected. Detail: { item: MListboxItem, selected: boolean }
 * @event m-listbox-change - Fired when the selection changes. Detail: { selected: string[] }
 * @event m-listbox-focus-change - Fired when focus moves to a different item. Detail: { item: MListboxItem | null }
 * 
 */
export class MListbox extends MElement {
    static tagName = 'm-listbox';
    static formAssociated = true;
    static observedAttributes = ['multiple', 'name', 'label', 'disabled', 'value'];

    @BindAttribute()
    label?: string;

    @BindAttribute()
    multiple: boolean = false;

    @BindAttribute()
    name: string = '';

    @BindAttribute()
    disabled: boolean = false;

    @queryAll('m-listbox-item', { dom: "light" })
    private items!: MListboxItem[];

    @query('#last-selected')
    private ariaLiveRegion!: HTMLDivElement;
    private ariaLiveTimeout?: ReturnType<typeof setTimeout>;

    private _focusedElement: MListboxItem | null = null;
    set focusedElement(el: MListboxItem | null) {
        this._focusedElement = el;
        if (el) {
            this.setAttribute("aria-activedescendant", el?.id)
        } else {
            this.removeAttribute("aria-activedescendant")
        }

    }
    get focusedElement() {
        return this._focusedElement;
    }

    private internals: ElementInternals;

    /*** ----------------------------
     *  Getters 
     * ----------------------------- */
    /**
     * Returns an array of all selected items.
     */
    get selectedItems(): MListboxItem[] {
        return this.items.filter(item => !!item.selected);
    }

    /**
     * Returns the value of the first selected item, or null if nothing is selected.
     * In multiple mode, returns an array of all selected values.
     * Useful for single-select mode.
     */
    get value(): string | string[] | null { 
        if (this.multiple) return this.selectedValues;
        return this.selectedItems[0]?.value ?? null; 
    }

    /**
     * Returns an array of all selected item values.
     * Useful for multiple-select mode.
     */
    get selectedValues(): string[] {
        return this.selectedItems.reduce<string[]>((acc, item) => {
            if (item.value) acc.push(item.value);
            return acc;
        }, []);
    }

    /**
     * Returns the associated form element, if any.
     */
    get form(): HTMLFormElement | null { return this.internals.form; }

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <slot></slot>
            <div id="last-selected" class="visually-hidden" role="region" aria-live="polite"></div>
        `;
        shadow.adoptedStyleSheets = [baseStyleSheet];
        this.internals = this.attachInternals();
        this.tabIndex = 0;
    }

    /*** ----------------------------
     *  Lifecycle
     * ----------------------------- */
    connectedCallback(): void {
        this.setAttribute("role", "listbox");
        
        if (this.multiple) {
            this.setAttribute("aria-multiselectable", "true");
        }
        
        if (this.disabled) {
            this.setAttribute("aria-disabled", "true");
            this.setAttribute("tabindex", "-1");
        } else {
            this.setAttribute("tabIndex", "0");
        }

        this.addEventListener('keydown', this.handleKeydown);
        this.addEventListener('focus', this.handleFocus, true);
        this.addEventListener('blur', this.handleBlur, true);
        this.addEventListener('click', this.handleClick);
        
        const valueAttr = this.getAttribute('value');
        if (valueAttr) {
            requestAnimationFrame(() => {
                const matchingItem = this.items.find(item => item.value === valueAttr);
                if (matchingItem && !matchingItem.selected) {
                    this.select(matchingItem);
                }
            });
        }
    }

    disconnectedCallback(): void {
        this.removeEventListener('keydown', this.handleKeydown);
        this.removeEventListener('focus', this.handleFocus, true);
        this.removeEventListener('blur', this.handleBlur, true);
        this.removeEventListener('click', this.handleClick);
    }


    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'label') {
            this.setAttribute("aria-label", newValue || "")
        }
        if (name === 'multiple') {
            this.items.forEach(item => (item.selected = false));
            this.focusedElement = null;
            this.updateFormValue();
            if (this.multiple) {
                this.setAttribute("aria-multiselectable", "true");
            } else {
                this.removeAttribute("aria-multiselectable");
            }
        }
        if (name === 'disabled') {
            if (this.disabled) {
                this.setAttribute("aria-disabled", "true");
                this.setAttribute("tabindex", "-1");
            } else {
                this.removeAttribute("aria-disabled");
                this.setAttribute("tabindex", "0");
            }
        }
        if (name === 'value' && newValue) {
            requestAnimationFrame(() => {
                const matchingItem = this.items.find(item => item.value === newValue);
                if (matchingItem && !matchingItem.selected) {
                    this.select(matchingItem);
                }
            });
        }
    }


    /*** ----------------------------
     *  Form association
     * ----------------------------- */
    private updateFormValue(): void {
        if (this.selectedValues.length === 0) {
            this.internals.setFormValue(null);
        } else if (this.selectedValues.length === 1) {
            this.internals.setFormValue(this.selectedValues[0]);
        } else {
            const formData = new FormData();
            for (const val of this.selectedValues) formData.append(this.name, val);
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
    /**
     * Sets focus to a specific list box item.
     * Removes focus from the previously focused item and dispatches a focus-change event.
     * 
     * @param item - The item to focus, or null to clear focus
     */
    setFocus(item: MListboxItem | null): void {
        if (!item) return;
        if (this.focusedElement) this.focusedElement.removeAttribute('focused');

        item.focused = true
        this.focusedElement = item;

        this.dispatchEvent(
            new CustomEvent<MListboxFocusChangeEventDetail>('m-listbox-focus-change', {
                detail: { item },
                bubbles: true,
                composed: true,
            })
        );
    }

    /**
     * Moves focus to the first item in the list.
     */
    focusFirst(): void {
        this.setFocus(this.items[0] ?? null);
    }

    /**
     * Moves focus to the last item in the list.
     */
    focusLast(): void {
        this.setFocus(this.items[this.items.length - 1] ?? null);
    }

    /**
     * Moves focus to the next item in the list.
     * Wraps around to the first item if at the end.
     */
    focusNext(): void {
        if (!this.focusedElement) return this.focusFirst();
        const idx = this.items.indexOf(this.focusedElement);
        const next = this.items[idx + 1] ?? this.items[0];
        this.setFocus(next);
    }

    /**
     * Moves focus to the previous item in the list.
     * Wraps around to the last item if at the beginning.
     */
    focusPrev(): void {
        if (!this.focusedElement) return this.focusLast();
        const idx = this.items.indexOf(this.focusedElement);
        const prev = this.items[idx - 1] ?? this.items[this.items.length - 1];
        this.setFocus(prev);
    }

    /**
     * Clears focus from the currently focused item.
     */
    focusBlur(): void {
        if (this.focusedElement) {
            this.focusedElement.removeAttribute('focused');
            this.focusedElement = null;
        }
    }

    /*** ----------------------------
     *  Selection Management
     * ----------------------------- */
    /**
     * Selects or toggles selection of a list box item.
     * In single-select mode, deselects all other items and selects the target item.
     * In multiple-select mode, toggles the selection state of the target item.
     * Dispatches m-listbox-select, m-listbox-unselected, and m-listbox-change events.
     * 
     * @param item - The item to select or toggle
     */
    select(item: MListboxItem | null): void {
        if (!item) return;

        if (!this.multiple) {
            // single-select mode: reset others
            this.items.forEach(i => {
                if (i !== item && i.selected) {
                    i.selected = false;
                    this.dispatchEvent(
                        new CustomEvent<MListboxSelectEventDetail>('m-listbox-unselected', {
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
            new CustomEvent<MListboxSelectEventDetail>(eventName, {
                detail: { item, selected: item.selected! },
                bubbles: true,
                composed: true,
            })
        );

        this.dispatchEvent(
            new CustomEvent<MListboxChangeEventDetail>('m-listbox-change', {
                detail: { selected: this.selectedValues },
                bubbles: true,
                composed: true,
            })
        );

        this.dispatchEvent(new Event('change', { bubbles: true }));

        this.updateAriaLive();
        this.updateFormValue();
    }

    /**
     * Selects the currently focused item.
     */
    selectFocused(): void {
        if (this.focusedElement) this.select(this.focusedElement);
    }

    /**
     * Selects the first item in the list.
     */
    selectFirst(): void {
        if (this.items[0]) this.select(this.items[0]);
    }

    /**
     * Selects the last item in the list.
     */
    selectLast(): void {
        if (this.items.length) this.select(this.items[this.items.length - 1]);
    }

    /**
     * Selects the next item in the list.
     * Wraps around to the first item if at the end.
     */
    selectNext(): void {
        if (!this.focusedElement) return this.selectFirst();
        const idx = this.items.indexOf(this.focusedElement);
        const next = this.items[idx + 1] ?? this.items[0];
        this.select(next);
    }

    /**
     * Selects the previous item in the list.
     * Wraps around to the last item if at the beginning.
     */
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
            .find(el => (el as HTMLElement).tagName === 'M-LISTBOX-ITEM') as
            | MListboxItem
            | undefined;

        if (item && !item.disabled) {
            if (!this.multiple) this.select(item);
            else {
                this.setFocus(item);
                this.select(item);
            }
        }
    };

    private updateAriaLive() {
        if (this.ariaLiveTimeout) {
            clearTimeout(this.ariaLiveTimeout);
        }

        this.ariaLiveTimeout = setTimeout(() => {
            const lastSelected = this.selectedItems[this.selectedItems.length - 1];
            this.ariaLiveRegion.textContent = `Last selected ${lastSelected.textContent}`
        }, 1000);
    }
}
