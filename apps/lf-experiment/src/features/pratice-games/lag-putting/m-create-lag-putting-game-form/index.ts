import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { ref, createRef } from "lit-html/directives/ref.js";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { CreateLagPuttCancelEvent, CreateLagPuttingSubmitEventEvent } from "./events";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form for creating a new lag putting game
 *
 * @customElement
 * @tagname m-create-lag-putting-game-form
 */
export class MCreateLagPuttingGameForm extends MElement {
  static tagName = "m-create-lag-putting-game-form";

  private formRef = createRef<HTMLFormElement>();

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
    if (!this.formRef.value) throw new Error("No form ref found");
    const formData = new FormData(this.formRef.value);
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
      html`
        <form
          ${ref(this.formRef)}
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
            label="Practice area name"
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
      this.shadowRoot!,
    );
  }
}

export default MCreateLagPuttingGameForm;
