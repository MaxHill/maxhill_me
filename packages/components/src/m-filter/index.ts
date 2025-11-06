import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import {fuzzySearch} from "../utils/search";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

// TODO: Empty state
// TODO: Initial state
export class MFilter extends MElement {
    static tagName = 'm-filter';
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
        const slot = this.#shadowRoot.querySelector('slot:not([name])') as HTMLSlotElement;
        if (!slot) return [];

        const slottedElements = slot.assignedElements({ flatten: true });

        if (!this.target) {
            return slottedElements;
        }

        const container = slottedElements.find(el => el.matches(this.target!));
        return container ? Array.from(container.children) : [];
    }

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();
        this.input?.addEventListener("input", this.handleInput)
    }
    disconnectedCallback() {
        this.input?.removeEventListener("input", this.handleInput)
    }

    private handleInput = (e: Event) => {
        const input = e.target as HTMLInputElement;
        this.searchItems(input.value);
    }

    private searchItems(query: string) {
        for (const item of this.items) {
            const keywords = item.getAttribute("data-keywords");
            const text = item.textContent;
            const match = query ? fuzzySearch(query, text + " " + keywords) : true;
            if(match) {
                item.removeAttribute("hidden")
                item.setAttribute("data-match", "true")
            } else {
                item.setAttribute("hidden", "true")
                item.setAttribute("data-match", "false")
            }
        }
    }


    render() {
        this.#shadowRoot.innerHTML = `
            <slot name="controller"></slot>
            <slot></slot>
        `;
    }
}
