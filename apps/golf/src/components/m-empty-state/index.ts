import { MElement, BindAttribute, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { globalStyleSheet } from "../../styles/global-styles";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Reusable empty state with title, message and optional action slot.
 *
 * @customElement
 * @tagname m-empty-state
 *
 * @slot action - Optional action content, typically a link or button
 *
 * @attr {string} title - Empty state title
 * @attr {string} message - Empty state message
 */
export class MEmptyState extends MElement {
  static tagName = "m-empty-state";

  @BindAttribute()
  title: string = "";

  @BindAttribute()
  message: string = "";

  @query('slot[name="action"]')
  private actionSlot?: HTMLSlotElement;

  private hasAction = false;
  private hasWarnedMissingContent = false;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.render();
    this.updateActionPresence();
    this.warnIfMissingContent();
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (oldValue === newValue) return;
    this.render();
    this.updateActionPresence();
    this.warnIfMissingContent();
  }

  private handleActionSlotChange = () => {
    this.updateActionPresence();
  };

  private updateActionPresence() {
    const nextHasAction = (this.actionSlot?.assignedElements().length || 0) > 0;
    if (nextHasAction !== this.hasAction) {
      this.hasAction = nextHasAction;
      this.render();
    }
  }

  private warnIfMissingContent() {
    if (this.hasWarnedMissingContent) return;

    const missingTitle = this.title.trim().length === 0;
    const missingMessage = this.message.trim().length === 0;

    if (missingTitle || missingMessage) {
      console.warn(
        `[m-empty-state] Missing required content: ${missingTitle ? "title" : ""}${
          missingTitle && missingMessage ? ", " : ""
        }${missingMessage ? "message" : ""}`,
        this,
      );
      this.hasWarnedMissingContent = true;
    }
  }

  private render() {
    render(
      html`
        <div class="empty-state">
          <p class="title">${this.title}</p>
          <p class="message">${this.message}</p>
          ${this.hasAction
            ? html`
                <div class="action">
                  <slot name="action" @slotchange=${this.handleActionSlotChange}></slot>
                </div>
              `
            : html`<slot name="action" @slotchange=${this.handleActionSlotChange}></slot>`}
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

export default MEmptyState;
