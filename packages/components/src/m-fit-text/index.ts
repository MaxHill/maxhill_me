import styles from "./index.css?inline";

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
 * @customElement
 * @tagname m-fit-text
 * 
 * @slot - Default slot for text content
 *
 * @attribute font-display - Weather to use display font
 *
 */
class MFitText extends HTMLElement {
    static observedAttributes = ['font-display'];

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() { this.render(); }

    render() {
        if (!this.shadowRoot) return;
        this.shadowRoot.adoptedStyleSheets = [baseStyleSheet];

        const content = this.innerHTML || "";
        const fontDisplay = this.hasAttribute('font-display');
        const className = fontDisplay ? 'text-fit font-display' : 'text-fit';

        this.shadowRoot.innerHTML = `
            <span class="${className}">
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

export default MFitText;
