import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { fuzzySearch } from "../utils/search";
import { query } from "../utils/query";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A search list component that filters items based on user input using fuzzy search.
 * Filters items by matching against their text content and data-keywords attribute.
 * 
 * Features debounced input handling and accessible screen reader announcements
 * for search results.
 * 
 * @customElement
 * @tagname m-search-list
 * 
 * @slot controller - Slot for the input element that controls the search
 * @slot (default) - Slot for the list container and items to be filtered
 * @slot empty - Optional content to display when no items match the search query
 * @slot initial - Optional content to display before any search query is entered
 * 
 * @attr {string} target - CSS selector for the container element whose children should be filtered
 * @attr {number} debounce - Time in milliseconds to debounce input events (default: 150ms)
 * 
 * @prop {string} target - CSS selector for the container element
 * @prop {number} debounce - Time in milliseconds to debounce input events
 * @prop {HTMLInputElement | null} input - The input element used for search
 * @prop {Element[]} items - Array of filterable items
 * 
 * @cssstate initial - Applied when no search query has been entered
 * @cssstate match - Applied when a search query is entered and matches are found
 * @cssstate empty - Applied when a search query is entered and no matches are found
 */
export class MSearchList extends MElement {
    static tagName = 'm-search-list';
    static observedAttributes = ['target'];

    private state: "initial" | "searching" | "empty" = "initial"
    private resultsMessage: string = '';
    private resultsTimeout?: ReturnType<typeof setTimeout>;
    private debounceTimeout?: ReturnType<typeof setTimeout>;

    private _internals: ElementInternals;

    @query('slot:not([name])')
    private defaultSlot!: HTMLSlotElement;

    @query('slot[name="empty"]')
    private emptySlot!: HTMLSlotElement;
    get emptySlotHasContent() {
        return this.emptySlot && this.emptySlot.assignedElements().length > 0
    }

    @query('slot[name="initial"]')
    private initialSlot!: HTMLSlotElement
    get initialSlotHasContent() {
        return this.initialSlot && this.initialSlot.assignedElements().length > 0
    }

    @BindAttribute()
    target?: string;

    @BindAttribute()
    debounce: number = 150;

    #shadowRoot: ShadowRoot;

    @query('#results')
    #ariaLiveRegion!: HTMLDivElement;

    get input(): HTMLInputElement | null {
        let input = this.querySelector('input');
        if (!input) { input = this.querySelector("m-input") }
        if (!input) { throw new Error("No input or m-input element found"); }

        return input as HTMLInputElement;
    }

    get items(): Element[] {
        if (this.target) {
            const targetElement = this.querySelector(this.target);

            if (!targetElement) {
                return [];
            }
            if(targetElement instanceof HTMLSlotElement) {
                return targetElement.assignedElements();
            } else {
            return [...targetElement.querySelectorAll(':scope > *')];
            }
        }
        return [...this.children].filter(el => !el.hasAttribute('slot'));
    }

    constructor() {
        super();
        this._internals = this.attachInternals();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();

        this.emptySlot.addEventListener('slotchange', () => {
            this.toggleSlots();
        });
        this.initialSlot.addEventListener('slotchange', () => {
            this.toggleSlots();
        });

        requestAnimationFrame(() => {
            this.input?.addEventListener("input", this.handleInput);
            if (this.input?.value) {
                this.searchItems(this.input.value);
            } else {
                this.toggleSlots();
            }
        });

    }
    disconnectedCallback() {
        this.input?.removeEventListener("input", this.handleInput);
        if (this.resultsTimeout) {
            clearTimeout(this.resultsTimeout);
        }
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
    }

    private handleInput = (e: Event) => {
        const input = e.target as HTMLInputElement;

        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        this.debounceTimeout = setTimeout(() => {
            this.searchItems(input.value);
        }, this.debounce);
    }

    private searchItems(query: string) {
        let matchCount = 0;
        const totalCount = this.items.length;
        console.log(this.items)

        for (const item of this.items) {
            const keywords = item.getAttribute("data-keywords") || "";
            const text = item.textContent || "";
            const match = query ? fuzzySearch(query, text + " " + keywords) : true;
            if (match) {
                item.setAttribute("data-match", "true")
                matchCount++;
            } else {
                item.setAttribute("data-match", "false")
            }
        }

        const hasMatch = matchCount > 0;

        if (hasMatch === true && !!query) {
            this._internals.states.add("match")
            this._internals.states.delete("empty")
            this._internals.states.delete("initial")
            this.state = "searching"
        } else if (hasMatch === false && !!query) {
            this._internals.states.delete("match")
            this._internals.states.add("empty")
            this._internals.states.delete("initial")
            this.state = "empty"
        } else {
            this._internals.states.delete("match")
            this._internals.states.delete("empty")
            this._internals.states.add("initial")
            this.state = "initial"
        }

        this.toggleSlots();
        this.updateAriaLive(query, matchCount, totalCount);
    }

    private updateAriaLive(query: string, matchCount: number, totalCount: number) {
        if (this.resultsTimeout) {
            clearTimeout(this.resultsTimeout);
        }

        this.resultsTimeout = setTimeout(() => {
            if (this.state === "initial") {
                this.resultsMessage = '';
            } else if (query && matchCount > 0) {
                this.resultsMessage = `Showing ${matchCount} of ${totalCount} items`;
            } else if (!query && totalCount > 0) {
                this.resultsMessage = `Showing all ${totalCount} items`;
            } else {
                this.resultsMessage = '';
            }

            if (this.#ariaLiveRegion) {
                this.#ariaLiveRegion.textContent = this.resultsMessage;
            }
        }, 1000);
    }

    private toggleSlots() {
        if (!this.defaultSlot) return;

        if (this.initialSlot) {
            this.initialSlot.hidden = this.state !== "initial" || !this.initialSlotHasContent;
        }

        if (this.emptySlot) {
            this.emptySlot.hidden = this.state !== "empty" || !this.emptySlotHasContent;
        }

        const showDefault = (this.state === "initial" && !this.initialSlotHasContent)
            || this.state === "searching"
            || (this.state === "empty" && !this.emptySlotHasContent);

        this.defaultSlot.hidden = !showDefault;
    }



    render() {
        this.#shadowRoot.innerHTML = `
            <div id="results" class="visually-hidden" role="region" aria-live="polite"></div>
            <slot name="controller"></slot>
            <slot></slot>
            <slot name="empty" hidden></slot>
            <slot name="initial" hidden></slot>
        `;
    }
}
