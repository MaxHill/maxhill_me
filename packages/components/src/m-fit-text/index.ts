import styles from "./index.css?inline";
import type { MComponent } from "../types";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

try {
    CSS.registerProperty({
        name: '--captured-length',
        syntax: '<length>',
        initialValue: '0px',
        inherits: true
    });
} catch (e) {
}

try {
    CSS.registerProperty({
        name: '--captured-length2',
        syntax: '<length>',
        initialValue: '0px',
        inherits: true
    });
} catch (e) {
}

/**
 * Fit text to the full width of the element using CSS container queries
 * 
 * @slot - Default slot for text content
 */
class MFitText extends HTMLElement {
    static observedAttributes = [];

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() { this.render(); }

    render() {
        if (!this.shadowRoot) return;
        this.shadowRoot.adoptedStyleSheets = [baseStyleSheet];

        const content = this.innerHTML || "";

        this.shadowRoot.innerHTML = `
            <span class="text-fit">
                <span>
                    <span>${content}</span>
                </span>
                <span aria-hidden="true">${content}</span>
            </span>
        `;
    }

    static define(tag = 'm-fit-text', registry = customElements) {
        if (!registry.get(tag)) {
            registry.define(tag, this);
        }
        return this;
    }
}

const MFitTextComponent: typeof MFitText & MComponent = MFitText;

export default MFitTextComponent;
