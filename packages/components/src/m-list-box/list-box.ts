import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import type { MListBoxItem } from "./list-box-item";
import styles from "./list-box.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Event detail for m-listbox-select and m-listbox-unselected events
 */
export interface MListBoxSelectEventDetail {
    /** The list box item that was selected or unselected */
    item: MListBoxItem;
    /** Whether the item is now selected */
    selected: boolean;
}

/**
 * Event detail for m-listbox-change events
 */
export interface MListBoxChangeEventDetail {
    /** Array of currently selected item values */
    selected: string[];
}

/**
 * Event detail for m-listbox-focus-change events
 */
export interface MListBoxFocusChangeEventDetail {
    /** The list box item that received focus, or null if focus was cleared */
    item: MListBoxItem | null;
}

/**
 * A form-associated listbox component for single or multiple selection.
 * Supports keyboard navigation, form integration, and accessible selection patterns.
 * 
 * @customElement
 * @tagname m-list-box
 * 
 * @example Basic usage
 * <m-list-box name="fruit">
 *   <m-list-box-item value="apple">Apple</m-list-box-item>
 *   <m-list-box-item value="pear">Pear</m-list-box-item>
 *   <m-list-box-item value="orange">Orange</m-list-box-item>
 * </m-list-box>
 * 
 * @example Multiple selection
 * <m-list-box name="fruits" multiple>
 *   <m-list-box-item value="apple">Apple</m-list-box-item>
 *   <m-list-box-item value="pear">Pear</m-list-box-item>
 *   <m-list-box-item value="orange">Orange</m-list-box-item>
 * </m-list-box>
 * 
 * @example Form integration
 * <form>
 *   <label>Select your favorite fruit:</label>
 *   <m-list-box name="favorite-fruit">
 *     <m-list-box-item value="apple">Apple</m-list-box-item>
 *     <m-list-box-item value="pear" selected>Pear</m-list-box-item>
 *     <m-list-box-item value="orange">Orange</m-list-box-item>
 *   </m-list-box>
 *   <button type="submit">Submit</button>
 * </form>
 * 
 * @slot - The default slot accepts m-list-box-item elements
 * 
 * @attr {string} name - The form control name
 * @attr {boolean} multiple - Whether multiple items can be selected
 * 
 * @prop {string | null} value - The value of the first selected item
 * @prop {string[]} values - Array of all selected item values
 * @prop {boolean} multiple - Whether multiple selection is enabled
 * @prop {HTMLFormElement | null} form - The associated form element
 * @prop {string} name - The form control name
 * 
 * @event m-listbox-select - Fired when an item is selected. Detail: { item: MListBoxItem, selected: boolean }
 * @event m-listbox-unselected - Fired when an item is unselected. Detail: { item: MListBoxItem, selected: boolean }
 * @event m-listbox-change - Fired when the selection changes. Detail: { selected: string[] }
 * @event m-listbox-focus-change - Fired when focus moves to a different item. Detail: { item: MListBoxItem | null }
 * 
 */
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
        return Array.from(this.querySelectorAll<MListBoxItem>('m-list-box-item'));
    }

    private get selected(): MListBoxItem[] {
        return this.items.filter(item => !!item.selected);
    }

    /**
     * Returns the value of the first selected item, or null if nothing is selected.
     * Useful for single-select mode.
     */
    get value(): string | null {
        return this.selected[0]?.value ?? null;
    }

    /**
     * Returns an array of all selected item values.
     * Useful for multiple-select mode.
     */
    get values(): string[] {
        return this.selected.reduce<string[]>((acc, item) => {
            if (item.value) acc.push(item.value);
            return acc;
        }, []);
    }

    /**
     * Whether the listbox allows multiple selection.
     * When true, arrow keys move focus without selecting.
     * When false (default), arrow keys both move focus and select.
     * 
     * @attr multiple
     */
    get multiple(): boolean {
        return this.hasAttribute('multiple');
    }

    set multiple(value: boolean) {
        if (value) this.setAttribute('multiple', '');
        else this.removeAttribute('multiple');
    }

    /**
     * Returns the associated form element, if any.
     */
    get form(): HTMLFormElement | null {
        return this.internals.form;
    }

    /**
     * The name of the form control. Submitted with the form as part of a name/value pair.
     * 
     * @attr name
     */
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
    /**
     * Sets focus to a specific list box item.
     * Removes focus from the previously focused item and dispatches a focus-change event.
     * 
     * @param item - The item to focus, or null to clear focus
     */
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
