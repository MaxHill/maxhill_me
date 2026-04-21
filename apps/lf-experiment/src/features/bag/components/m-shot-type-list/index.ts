import { MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { get_DB } from "../../../../db";
import { ShotTypeService } from "../../shot-type-service";
import { TableChangeEvent } from "@maxhill/idb-distribute";
import { globalStyleSheet } from "../../../../styles/global-styles";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MShotTypeList extends MElement {
  static tagName = "m-shot-type-list";

  private shot_type_repository!: ShotTypeService;

  @query("#shot-type-list-item-template")
  private template!: HTMLTemplateElement;

  @query("#shots")
  private shots_container!: HTMLUListElement;

  unsubscribe!: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.shot_type_repository = new ShotTypeService(db);

    this.unsubscribe = this.shot_type_repository.subscribe(async (_: TableChangeEvent) => {
      await this.render();
    });

    await this.render();
  }

  async disconnectedCallback() {
    this.unsubscribe();
  }

  async render() {
    this.shadowRoot!.innerHTML = `
            <template id="shot-type-list-item-template">
                <li>
                    <div class="name"></div>
                    <div class="club"></div>
                    <div class="description"></div>
                    <a class="edit-link">Edit</a>
                </li>
            </template>

            <div>
                <h2>Shot types</h2>
                <ul id="shots"> </ul>
            </div>
            `;

    for await (const shot_type of this.shot_type_repository.table.query()) {
      const clone = document.importNode(this.template.content, true);

      const name = clone.querySelector(".name");
      if (name) name.textContent = shot_type.name;

      const club = clone.querySelector(".club");
      if (club) club.textContent = shot_type.club;

      const description = clone.querySelector(".description");
      if (description) description.textContent = shot_type.description;

      this.shots_container?.appendChild(clone);
    }
  }
}
