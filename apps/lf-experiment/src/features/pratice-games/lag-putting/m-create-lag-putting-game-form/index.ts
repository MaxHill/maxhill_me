import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "uhtml";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { CreateLagPuttCancelEvent, CreateLagPuttingSubmitEventEvent } from "./events";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form for creating a new lag putting game
 *
 * @customElement
 * @tagname m-create-lag-putting-game-form
 *
 * @slot - Default slot for component content
 *
 * @attr {string} example - An example property
 *
 * @prop {string} example - An example property
 */
export class MCreateLagPuttingGameForm extends MElement {
  static tagName = "m-create-lag-putting-game-form";

  private formRef: HTMLFormElement | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.render();
  }

  handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!this.formRef) throw new Error("No form ref found");
    const formData = new FormData(this.formRef);
    this.dispatchEvent(
      new CreateLagPuttingSubmitEventEvent({
        value: {
          playerName: formData.get("playerName")?.toString() || "",
          courseName: formData.get("courseName")?.toString() || "",
          practiceAreaName: formData.get("practiceAreaName")?.toString() || "",
        },
      }),
    );
  }

  private render() {
    render(
      this.shadowRoot!,
      html`
        <form
          ref="${(el: any) => this.formRef = el}"
          class="form"
          @submit="${this.handleSubmit.bind(this)}"
        >
          <h2>Start a new game</h2>
          <m-input
            name="playerName"
            label="Player name"
            required
          />
          <m-input
            name="courseName"
            label="Course name"
            required
          />
          <m-input
            name="practiceAreaName"
            label="Pratice area name"
            required
          />

          <div class="form-actions stack" data-direction="row" data-justify="content-between">
            <button class="button" value="yes">Start Game</button>
            <button
              @click="${() => {
                this.dispatchEvent(new CreateLagPuttCancelEvent({}));
              }}"
              type="button"
              class="button"
              data-variant="secondary"
              value="no"
            >
              Cancel
            </button>
          </div>
        </form>
      `,
    );
  }
}

export default MCreateLagPuttingGameForm;
