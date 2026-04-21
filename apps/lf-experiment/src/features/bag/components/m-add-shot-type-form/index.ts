import { MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { get_DB } from "../../../../db";
import { ShotTypeService } from "../../shot-type-service";
import { globalStyleSheet } from "../../../../styles/global-styles";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MAddShotTypeForm extends MElement {
  static tagName = "m-add-shot-type-form";

  private shot_type_repository!: ShotTypeService;

  @query("#add-shot-type-form")
  private add_shot_type_form!: HTMLFormElement;

  unsubscribe!: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.shot_type_repository = new ShotTypeService(db);

    this.render();
    this.add_shot_type_form.addEventListener("submit", this.handleFormSubmit);
  }

  disconnectedCallback() {
    this.add_shot_type_form?.removeEventListener("submit", this.handleFormSubmit);
  }

  private handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    const formData = new FormData(this.add_shot_type_form);

    const name = formData.get("name")?.toString();
    const description = formData.get("description")?.toString();

    if (!name || !description) {
      return;
    }

    await this.shot_type_repository.addShotType({
      name,
      description,
    });

    this.add_shot_type_form.reset();
  }

  render() {
    this.shadowRoot!.innerHTML = `
            <form id="add-shot-type-form" class="form box" aria-label="Add new shot type form">
                <h2>Add shot type</h2>
                
                <m-input required min="2" name="name" label="Name" aria-required="true"></m-input>
                <m-textarea required minlength="10" name="description" label="Description" rows="4" placeholder="Enter a detailed description..." clearable aria-required="true"></m-textarea>

                <button type="submit" aria-label="Submit form to add shot type">Add</button>
            </form>
        `;
  }
}
