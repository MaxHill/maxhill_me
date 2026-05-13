import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { ref, createRef } from "lit-html/directives/ref.js";
import { get_DB } from "../../../../db";
import { ShotTypeService } from "../../shot-type-service";
import { globalStyleSheet } from "../../../../styles/global-styles";
import "@maxhill/components/m-input";
import "@maxhill/components/m-textarea";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MAddShotTypeForm extends MElement {
  static tagName = "m-add-shot-type-form";

  private shot_type_repository!: ShotTypeService;
  private formRef = createRef<HTMLFormElement>();

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.shot_type_repository = new ShotTypeService(db);
    this.renderComponent();
  }

  private handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    if (!this.formRef.value) return;

    const formData = new FormData(this.formRef.value);
    const name = formData.get("name")?.toString();
    const description = formData.get("description")?.toString();

    if (!name || !description) {
      return;
    }

    await this.shot_type_repository.addShotType({
      name,
      description,
    });

    this.formRef.value.reset();
  };

  private renderComponent() {
    render(html`
      <form 
        ${ref(this.formRef)}
        class="form box" 
        aria-label="Add new shot type form"
        @submit=${this.handleFormSubmit}
      >
        <h2>Add shot type</h2>
        
        <m-input required min="2" name="name" label="Name" aria-required="true"></m-input>
        <m-textarea required minlength="10" name="description" label="Description" rows="4" placeholder="Enter a detailed description..." clearable aria-required="true"></m-textarea>

        <button class="button" type="submit" aria-label="Submit form to add shot type">Add</button>
      </form>
    `, this.shadowRoot!);
  }
}
