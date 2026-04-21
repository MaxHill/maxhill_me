import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
import { get_DB } from "../../../../db";
import { ShotTypeService } from "../../shot-type-service";
import { globalStyleSheet } from "../../../../styles/global-styles";
import MInput from "@maxhill/components/m-input";
import MTextarea from "@maxhill/components/m-textarea";

// Register library components
MInput.define();
MTextarea.define();

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MAddShotTypeForm extends MElement {
  static tagName = "m-add-shot-type-form";

  private shot_type_repository!: ShotTypeService;
  private formRef: HTMLFormElement | null = null;

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
    if (!this.formRef) return;

    const formData = new FormData(this.formRef);
    const name = formData.get("name")?.toString();
    const description = formData.get("description")?.toString();

    if (!name || !description) {
      return;
    }

    await this.shot_type_repository.addShotType({
      name,
      description,
    });

    this.formRef.reset();
  };

  private renderComponent() {
    render(this.shadowRoot!, html`
      <form 
        ref=${(el: any) => this.formRef = el}
        class="form box" 
        aria-label="Add new shot type form"
        @submit=${this.handleFormSubmit}
      >
        <h2>Add shot type</h2>
        
        <m-input required min="2" name="name" label="Name" aria-required="true"></m-input>
        <m-textarea required minlength="10" name="description" label="Description" rows="4" placeholder="Enter a detailed description..." clearable aria-required="true"></m-textarea>

        <button class="button" type="submit" aria-label="Submit form to add shot type">Add</button>
      </form>
    `);
  }
}
