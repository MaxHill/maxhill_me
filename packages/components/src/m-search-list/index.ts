import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { fuzzySearch } from "../utils/search";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A search list component that filters items based on user input using fuzzy search.
 * Filters items by matching against their text content and data-keywords attribute.
 * 
 * ### Example
 * <m-search-list>
 *   <input slot="controller" type="search" placeholder="Search...">
 *     <div data-keywords="javascript js">JavaScript</div>
 *     <div data-keywords="typescript ts">TypeScript</div>
 *     <div data-keywords="python py">Python</div>
 *     <p slot="empty">No match found</p>
 *     <p slot="initial">Search programming languages</p>
 * </m-search-list>
 * 
 * ### With target selector
 * <m-search-list target="ul">
 *   <input slot="controller" type="search">
 *   <div>
 *     <ul>
 *       <li>Item 1</li>
 *       <li>Item 2</li>
 *     </ul>
 *   </div>
 * </m-search-list>
 * 
 * @customElement
 * @tagname m-search-list
 * 
 * @slot controller - Slot for the input element
 * @slot (default) - Slot for the list container and items
 * @slot empty - Slot for content to display when no items match the search
 * @slot initial - Slot for content to display before any search is performed
 * 
 * @attr {string} target - CSS selector for the container element whose children should be filtered
 * 
 * @prop {string} target - CSS selector for the container element
 * @prop {HTMLInputElement | null} input - The input element used for search
 * @prop {Element[]} items - Array of filterable items
 * 
 * @cssstate initial - Applied when no search query has been entered
 * @cssstate match - Applied when a search query is entered and matches are found
 * @cssstate empty - Applied when a search query is entered and no matches are found
 * 
 */
export class MSearchList extends MElement {
    static tagName = 'm-search-list';
    static observedAttributes = ['target'];

    private state: "initial" | "searching" | "empty" = "initial"
    private resultsMessage: string = '';
    private resultsTimeout?: ReturnType<typeof setTimeout>;

    private _internals: ElementInternals;
    private defaultSlot!: HTMLSlotElement;
    private emptySlot!: HTMLSlotElement;
    get emptySlotHasContent() {
        return this.emptySlot && this.emptySlot.assignedElements().length > 0
    }

    private initialSlot!: HTMLSlotElement
    get initialSlotHasContent() {
        return this.initialSlot && this.initialSlot.assignedElements().length > 0
    }

    @BindAttribute()
    target?: string;

    #shadowRoot: ShadowRoot;
    #ariaLiveRegion!: HTMLDivElement;

    get input(): HTMLInputElement | null {
        const input = this.querySelector('input');
        if (!input) {
            throw new Error("No input element found");
        }
        return input as HTMLInputElement;
    }

    get items(): Element[] {
        if (this.target) {
            const targetElement = this.querySelector(this.target);
            if (!targetElement) {
                return [];
            }
            return [...targetElement.children];
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
        this.defaultSlot = this.#shadowRoot.querySelector('slot:not([name])') as HTMLSlotElement;
        this.emptySlot = this.#shadowRoot.querySelector('slot[name="empty"]') as HTMLSlotElement;
        this.initialSlot = this.#shadowRoot.querySelector('slot[name="initial"]') as HTMLSlotElement;
        this.#ariaLiveRegion = this.#shadowRoot.querySelector('#results') as HTMLDivElement;

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
    }

    private handleInput = (e: Event) => {
        const input = e.target as HTMLInputElement;
        this.searchItems(input.value);
    }

    private searchItems(query: string) {
        let matchCount = 0;
        const totalCount = this.items.length;

        for (const item of this.items) {
            const keywords = item.getAttribute("data-keywords");
            const text = item.textContent;
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
            <slot name="controller"></slot>
            <div id="results" class="visually-hidden" role="region" aria-live="polite"></div>
            <slot></slot>
            <slot name="empty" hidden></slot>
            <slot name="initial" hidden></slot>
        `;
    }
}
