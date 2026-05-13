import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { html, render } from "lit-html";
import "@maxhill/components/m-fit-text";
import "../../components/m-club-list";
import "../../components/m-club-form";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Bag edit page - shows list + edit form
 * Route: /bag/edit/:clubKey
 *
 * @customElement
 * @tagname m-bag-edit-page
 *
 * @attr {string} club-key - The key of the club to edit
 */
export class MBagEditPage extends MElement {
  static tagName = "m-bag-edit-page";

  @BindAttribute({ attribute: "club-key" })
  clubKey: string = "";

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    // Re-render to propagate the new club-key down to the list & form.
    // Skipped until first connection so we don't render into a detached
    // shadow root during construction-time attribute setup.
    if (this.isConnected) this.render();
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    // lit-html diffs against the previous template by default, so inner
    // <m-club-list> / <m-club-form> instances stay alive across re-renders
    // and just get their attributes updated.
    render(
      html`
        <div class="page-container">
          <m-fit-text font-display class="title">Hardware</m-fit-text>
          <m-club-list interactive selected-club-key=${this.clubKey} class="club-list"></m-club-list>
          <m-club-form club-key=${this.clubKey} class="form"></m-club-form>
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

export default MBagEditPage;

