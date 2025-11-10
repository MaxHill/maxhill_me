import { query } from "../utils/query";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

const DEFAULT_COPY_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
</svg>
`;

/**
 * A button component that copies text to the clipboard with visual feedback.
 * 
 * @customElement
 * @tagname m-copy-button
 * 
 * @slot - Default slot for button label/content
 * @slot icon - Optional slot for custom icon (overrides default copy icon)
 * 
 * @attr {string} value - The text to copy to clipboard (required)
 * @attr {boolean} show-icon - Show/hide the copy icon (default: true)
 * @attr {string} feedback - Custom feedback message shown on successful copy (default: "Copied!")
 * 
 * @prop {string} value - The text to copy to clipboard (required)
 * @prop {boolean} showIcon - Show/hide the copy icon (default: true)
 * @prop {string} feedback - Custom feedback message shown on successful copy (default: "Copied!")
 * 
 * @fires copy-success - Fired when text is successfully copied (detail: { value: string })
 * @fires copy-error - Fired when copy fails (detail: { error: Error })
 * 
 * @cssprop --copy-button-gap - Gap between content and icon (default: var(--size-1))
 * @cssprop --copy-button-icon-size - Size of the icon (default: 1rem)
 * @cssprop --copy-button-icon-opacity - Opacity of icon in normal state (default: 0.5)
 * @cssprop --copy-button-icon-opacity-hover - Opacity of icon on hover (default: 1)
 * 
 * @csspart button - The button element
 * @csspart icon - Icon wrapper
 * @csspart feedback - Feedback tooltip
 * 
 * @example
 * Basic
 * <m-copy-button value="Hello World">
 *   Copy Text
 * </m-copy-button>
 * 
 * @example
 * Custom feedback
 * <m-copy-button value="npm install" feedback="Installed!">
 *   Copy command
 * </m-copy-button>
 * 
 * @example
 * Without icon
 * <m-copy-button value="code snippet" show-icon="false">
 *   Copy
 * </m-copy-button>
 */
class MCopyButton extends HTMLElement {
    static observedAttributes = ["value", "show-icon", "feedback"];

    @query("button")
    private button!: HTMLButtonElement;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.render();
        this.attachEventListeners();
    }

    attributeChangedCallback() {
        this.render();
    }

    get value() {
        return this.getAttribute("value") || "";
    }

    get showIcon() {
        const attr = this.getAttribute("show-icon");
        return attr === null || attr === "true";
    }

    get feedback() {
        return this.getAttribute("feedback") || "Copied!";
    }

    render() {
        if (!this.shadowRoot) return;

        this.shadowRoot.adoptedStyleSheets = [baseStyleSheet];

        const hasCustomIcon = this.querySelector('[slot="icon"]');

        this.shadowRoot.innerHTML = `
      <button type="button" part="button">
        <span class="content">
          <slot></slot>
        </span>
        ${
            this.showIcon
                ? `
          <span part="icon" class="icon">
            ${hasCustomIcon ? '<slot name="icon"></slot>' : DEFAULT_COPY_ICON}
          </span>
        `
                : ""
        }
        <span part="feedback" class="feedback">${this.feedback}</span>
      </button>
    `;
    }

    attachEventListeners() {
        if (!this.button) return;

        this.button.addEventListener("click", async () => {
            if (!this.value) return;

            try {
                await navigator.clipboard.writeText(this.value);

                this.button.classList.add("copied");

                this.dispatchEvent(
                    new CustomEvent("copy-success", {
                        detail: { value: this.value },
                        bubbles: true,
                        composed: true,
                    }),
                );

                this.button.addEventListener(
                    "animationend",
                    () => {
                        this.button.classList.remove("copied");
                    },
                    { once: true },
                );
            } catch (err) {
                console.error("Failed to copy:", err);

                this.dispatchEvent(
                    new CustomEvent("copy-error", {
                        detail: { error: err },
                        bubbles: true,
                        composed: true,
                    }),
                );
            }
        });
    }

    static define(tag = "m-copy-button", registry = customElements) {
        if (!registry.get(tag)) {
            registry.define(tag, this);
        }
        return this;
    }
}

export default MCopyButton;
