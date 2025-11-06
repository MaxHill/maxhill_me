import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import {fuzzySearch} from "../utils/search";
import styles from "./index.css?inline";

// TODO: Empty state 
// TODO: Initial state
// TODO: Refactor state
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
 * 
 * @attr {string} target - CSS selector for the container element whose children should be filtered
 * 
 * @prop {string} target - CSS selector for the container element
 * @prop {HTMLInputElement | null} input - The input element used for search
 * @prop {Element[]} items - Array of filterable items
 * 
 */
export class MSearchList extends MElement {
    static tagName = 'm-search-list';
    static observedAttributes = ['target'];

    @BindAttribute()
    target?: string;

    #shadowRoot: ShadowRoot;

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
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();
        requestAnimationFrame(() => {
            this.input?.addEventListener("input", this.handleInput);
            if (this.input?.value) {
                this.searchItems(this.input.value);
            }
        });
    }
    disconnectedCallback() {
        this.input?.removeEventListener("input", this.handleInput)
    }

    private handleInput = (e: Event) => {
        const input = e.target as HTMLInputElement;
        this.searchItems(input.value);
    }

    private searchItems(query: string) {
        let hasMatch = false;
        for (const item of this.items) {
            const keywords = item.getAttribute("data-keywords");
            const text = item.textContent;
            const match = query ? fuzzySearch(query, text + " " + keywords) : true;
            if(match) {
                item.removeAttribute("hidden")
                item.setAttribute("data-match", "true")
                hasMatch = true;
            } else {
                item.setAttribute("hidden", "")
                item.setAttribute("data-match", "false")
            }
        }
        this.toggleEmptySlot(!hasMatch);
    }

    private toggleEmptySlot(show: boolean) {
        const emptySlot = this.#shadowRoot.querySelector('slot[name="empty"]') as HTMLSlotElement;
        if (!emptySlot) return;
        
        if (show) {
            emptySlot.style.display = 'block';
        } else {
            emptySlot.style.display = 'none';
        }
    }


    render() {
        this.#shadowRoot.innerHTML = `
            <slot name="controller"></slot>
            <slot></slot>
            <slot name="empty" style="display: none;"></slot>
        `;
    }
}
