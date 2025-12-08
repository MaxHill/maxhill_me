import { QueryOptions } from "./query";

export interface OptionLike extends HTMLElement {
    selected?: boolean;
    focused?: boolean;
    value?: string;
    disabled?: boolean;
}

export interface SelectionResult {
    itemToSelect: OptionLike;
    itemsToDeselect: OptionLike[];
    shouldToggle: boolean;
    newFocusTarget: OptionLike | null;
}

/**
 * Selection mode for OptionListManager.
 * - "single-select": Arrow keys move selection (m-listbox single-select)
 * - "single-focus": Arrow keys move focus only, Space/Enter selects (m-combobox single-select)
 * - "multiple": Arrow keys move focus only, Space/Enter toggles selection (multiple-select mode)
 */
export type SelectionMode = "single-select" | "single-focus" | "multiple";

export class OptionListManager {

    private selectionMode: SelectionMode = "single-select";
    private target: HTMLElement;
    private callbacks: {
        selectCallback(selection: SelectionResult): void,
        focusCallback(focus: OptionLike): void,
    };

    // Options accessors
    private optionsQuerySelector: string;
    private optionsQuery?: QueryOptions;
    get options(): OptionLike[] {
        let dom: null | ShadowRoot | Document | HTMLElement = this.target.shadowRoot;
        if (this.optionsQuery && this.optionsQuery.dom === "light") {
            dom = this.target;
        } else if (this.optionsQuery && this.optionsQuery.dom === "document") {
            dom = document;
        }
        return Array.from(dom?.querySelectorAll(this.optionsQuerySelector) ?? []) as OptionLike[];
    }

    get firstOption(): OptionLike | null {
        return this.options[0] ?? null;
    }

    get lastOption(): OptionLike | null {
        return this.options[this.options.length - 1] ?? null;
    }

    get nextOption(): OptionLike | null {
        if (!this.focusedElement) return this.firstOption;
        const idx = this.options.indexOf(this.focusedElement);
        return this.options[idx + 1] ?? this.options[0] ?? null;
    }

    get previousOption(): OptionLike | null {
        if (!this.focusedElement) return this.lastOption;
        const idx = this.options.indexOf(this.focusedElement);
        return this.options[idx - 1] ?? this.options[this.options.length - 1] ?? null;
    }

    get selectedOptions(): OptionLike[] {
        return this.options.filter(item => !!item.selected);
    }

    // Value accessors
    get selectedValues(): string[] {
        const result: string[] = [];
        for (const option of this.options) {
            if (option.selected && option.value) {
                result.push(option.value);
            }
        }
        return result;
    }

    constructor(
        target: HTMLElement, 
        optionsQuerySelector: string, 
        callbacksOrSelectionMode?: { selectCallback(selection: SelectionResult): void, focusCallback(focus: OptionLike): void } | SelectionMode,
        selectionModeOrOptionsQuery?: SelectionMode | QueryOptions, 
        optionsQuery?: QueryOptions
    ) {
        this.target = target;
        this.optionsQuerySelector = optionsQuerySelector;
        
        // Handle overloaded constructor signatures
        // Signature 1: (target, selector, callbacks, selectionMode?, optionsQuery?)
        // Signature 2: (target, selector, selectionMode?, optionsQuery?)
        if (typeof callbacksOrSelectionMode === 'object' && 'selectCallback' in callbacksOrSelectionMode) {
            // Signature 1: callbacks provided
            this.callbacks = callbacksOrSelectionMode;
            this.selectionMode = (selectionModeOrOptionsQuery as SelectionMode) || "single-select";
            this.optionsQuery = optionsQuery;
        } else {
            // Signature 2: selectionMode provided (or nothing)
            this.callbacks = {
                selectCallback: (_selection: SelectionResult) => {},
                focusCallback: (_focus: OptionLike) => {}
            };
            this.selectionMode = (callbacksOrSelectionMode as SelectionMode) || "single-select";
            this.optionsQuery = selectionModeOrOptionsQuery as QueryOptions;
        }
    }


    /*** ----------------------------
     *  Focus Management
     * ----------------------------- */
    focusedElement: OptionLike | null = null;


    focus(option: OptionLike | null): void {
        if (!option) return;
        if (this.focusedElement) this.focusedElement.removeAttribute('focused');

        option.focused = true;
        this.focusedElement = option;
        this.callbacks.focusCallback(option);
    }

    focusFirst(): void { this.focus(this.firstOption); }
    focusLast(): void { this.focus(this.lastOption); }
    focusNext(): void { this.focus(this.nextOption); }
    focusPrev(): void { this.focus(this.previousOption); }

    focusBlur(): void {
        if (this.focusedElement) {
            this.focusedElement.removeAttribute('focused');
            this.focusedElement = null;
            this.callbacks.focusCallback(null as any);
        }
    }


    //  ------------------------------------------------------------------------
    //  Selection Management                                                                     
    //  ------------------------------------------------------------------------ 
    //  Getters and methods related to selection management which can both be 
    //  in multiple and single and multiple mode
    select(option: OptionLike): void {
        if (!option) return;

        const result = this.selectionMode === "multiple"
            ? this.createSelectionResultMultiple(option)
            : this.createSelectionResultSingle(option);

        result.itemsToDeselect.forEach(i => {
            i.selected = false;
        });

        if (result.shouldToggle) {
            option.selected = !option.selected;
        } else {
            option.selected = true;
            if (result.newFocusTarget) {
                this.focus(result.newFocusTarget);
            }
        }

        this.callbacks.selectCallback(result);
    }

    selectFocused(): void {
        if (this.focusedElement) this.select(this.focusedElement);
    }

    selectFirst(): void {
        const first = this.firstOption
        if (first) this.select(first);
    }

    selectLast(): void {
        const last = this.lastOption;
        if (last) this.select(last);
    }

    selectNext(): void {
        const next = this.nextOption;
        if (next) this.select(next);
    }

    selectPrev(): void {
        const prev = this.previousOption;
        if (prev) this.select(prev);
    }

    createSelectionResultMultiple(option: OptionLike): SelectionResult {
        return {
            itemToSelect: option,
            itemsToDeselect: [],
            shouldToggle: true,
            newFocusTarget: this.focusedElement,
        };
    }

    createSelectionResultSingle(option: OptionLike): SelectionResult {
        const itemsToDeselect = this.selectedOptions.filter(i => i !== option);
        return {
            itemToSelect: option,
            itemsToDeselect,
            shouldToggle: false,
            newFocusTarget: option,
        };
    }

    //  ------------------------------------------------------------------------
    //  Keyboard management                                                                     
    //  ------------------------------------------------------------------------ 
    handleKeydown = (event: KeyboardEvent) => {
        event.stopPropagation();

        // Handle Space/Enter selection (common to both modes)
        if (event.key === ' ' || event.key === 'Enter') {
            this.selectFocused();
            event.preventDefault();
            return;
        }

        // Handle Ctrl+N/Ctrl+P shortcuts (alternative to Arrow keys)
        if (event.key === 'n' && event.ctrlKey) {
            event.preventDefault();
            this.selectionMode === "single-select" ? this.selectNext() : this.focusNext();
            return;
        }
        if (event.key === 'p' && event.ctrlKey) {
            event.preventDefault();
            this.selectionMode === "single-select" ? this.selectPrev() : this.focusPrev();
            return;
        }

        // Delegate to mode-specific navigation
        if (this.selectionMode === "single-select") {
            this.keyboardMoveSelect(event);  // Arrow keys select (m-listbox single-select)
        } else {
            this.keyboardMoveFocus(event);   // Arrow keys focus only (single-focus and multiple)
        }
    };

    /**
     * Handles keyboard navigation for single-focus and multiple modes.
     * Arrow keys move focus only. In multiple mode, Shift+Arrow extends selection.
     * @param {KeyboardEvent} event - Keyboard input event
     */
    private keyboardMoveFocus(event: KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            this.focusNext();
            if (event.shiftKey) {
                this.selectFocused();
            }
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            this.focusPrev();
            if (event.shiftKey) {
                this.selectFocused();
            }
            event.preventDefault();
        } else if (event.key === 'Home') {
            this.focusFirst();
            if (event.shiftKey) {
                this.selectFocused();
            }
            event.preventDefault();
        } else if (event.key === 'End') {
            this.focusLast();
            if (event.shiftKey) {
                this.selectFocused();
            }
            event.preventDefault();
        }
    }

    /**
     * Handles keyboard navigation for single-select mode.
     * Arrow keys move selection (focus follows selection).
     * @param {KeyboardEvent} event - Keyboard input event
     */
    private keyboardMoveSelect(event: KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            this.selectNext();
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            this.selectPrev();
            event.preventDefault();
        } else if (event.key === 'Home') {
            this.selectFirst();
            event.preventDefault();
        } else if (event.key === 'End') {
            this.selectLast();
            event.preventDefault();
        }
    }

}
