import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import { html, render } from "lit-html";
import { globalStyleSheet } from "../../../../styles/global-styles";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MDangerZone extends MElement {
  static tagName = "m-danger-zone";

  @BindAttribute()
  title: string = "Danger zone";

  @BindAttribute({ attribute: "action-label" })
  actionLabel: string = "Delete";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.renderComponent();
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (this.isConnected && oldValue !== newValue) this.renderComponent();
  }

  private handleActionClick = () => {
    this.dispatchEvent(new CustomEvent("danger-zone-action", {
      bubbles: true,
      composed: true,
    }));
  };

  private renderComponent() {
    render(
      html`
        <details class="danger-zone box" data-variant="surface">
          <summary>${this.title}</summary>
          <div class="content">
            <slot></slot>
            <button
              type="button"
              class="button action"
              data-style="destructive"
              @click=${this.handleActionClick}
            >
              ${this.actionLabel}
            </button>
          </div>
        </details>
      `,
      this.shadowRoot!,
    );
  }
}

export default MDangerZone;
