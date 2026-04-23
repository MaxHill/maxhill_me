import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
import { get_DB } from "../../../../db";
import { ShotType, ShotTypeService } from "../../shot-type-service";
import { TableChangeEvent } from "@maxhill/idb-distribute";
import { globalStyleSheet } from "../../../../styles/global-styles";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MShotTypeList extends MElement {
  static tagName = "m-shot-type-list";

  private shot_type_repository!: ShotTypeService;
  private shotTypes: ShotType[] = [];
  private unsubscribe!: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.shot_type_repository = new ShotTypeService(db);

    this.unsubscribe = this.shot_type_repository.subscribe(async (_: TableChangeEvent) => {
      await this.renderComponent();
    });

    await this.renderComponent();
  }

  async disconnectedCallback() {
    this.unsubscribe?.();
  }

  private async renderComponent() {
    // Load shot types from database
    this.shotTypes = [];
    for await (const shotType of this.shot_type_repository.table.query()) {
      this.shotTypes.push(shotType);
    }

    render(this.shadowRoot!, html`
      <div>
        <h2 class="h1">Shot types</h2>
        <p>List of all shot types in the bag</p>
        ${this.shotTypes.length > 0 ? html`
          <ul class="grid exposed-grid" id="shots" role="list" aria-label="List of shot types">
            ${this.shotTypes.map(shotType => html`
              <li>
                <div class="name">${shotType.name}</div>
                <div class="description">${shotType.description}</div>
                <a class="edit-link">Edit</a>
              </li>
            `)}
          </ul>
        ` : html`
          <p style="color: var(--color-text-muted, #666); font-style: italic;">
            No shot types yet. Add one to get started!
          </p>
        `}
      </div>
    `);
  }
}
