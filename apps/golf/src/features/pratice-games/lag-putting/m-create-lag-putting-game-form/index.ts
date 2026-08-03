import { BindAttribute, MElement } from "@maxhill/web-component-utils";
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

  @BindAttribute()
  mode: "create" | "edit" = "create";

  @BindAttribute({ attribute: "course-name" })
  courseName: string = "";

  @BindAttribute({ attribute: "practice-area-name" })
  practiceAreaName: string = "";

  private formRef = createRef<HTMLFormElement>();

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (oldValue === newValue) return;
    if (name === "mode" || name === "course-name" || name === "practice-area-name") {
      this.render();
    }
  }

  handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!this.formRef.value) throw new Error("No form ref found");
    const formData = new FormData(this.formRef.value);
    this.dispatchEvent(
      new CreateLagPuttingSubmitEventEvent({
        value: {
          courseName: formData.get("courseName")?.toString() || "",
          practiceAreaName: formData.get("practiceAreaName")?.toString() || "",
        },
      }),
    );
  }

  private render() {
    const isEditMode = this.mode === "edit";
    const title = isEditMode ? "Edit round" : "Start a new game";
    const submitLabel = isEditMode ? "Save changes" : "Start Game";

    render(
      html`
        <form
          ${ref(this.formRef)}
          class="form"
          @submit="${this.handleSubmit.bind(this)}"
        >
          <h2>${title}</h2>
          <m-input
            name="courseName"
            label="Course name"
            value="${this.courseName}"
            required
          ></m-input>
          <m-input
            name="practiceAreaName"
            label="Practice area name"
            value="${this.practiceAreaName}"
            required
          ></m-input>

          <div class="form-actions stack" data-direction="row" data-justify="content-between">
            <button class="button" value="yes">${submitLabel}</button>
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
