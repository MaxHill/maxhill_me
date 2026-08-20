import { MElement, BindAttribute } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { get_DB } from "../../../../db";
import { ShotType, ShotTypeService } from "../../shot-type-service";
import { TableChangeEvent } from "@maxhill/syncdb";
import { globalStyleSheet } from "../../../../styles/global-styles";
import "@maxhill/components/m-card";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Display a list of all shot types
 *
 * @customElement
 * @tagname m-shot-type-list
 * 
 * @attr {boolean} interactive - Whether items are clickable (default: true)
 */
export class MShotTypeList extends MElement {
  static tagName = "m-shot-type-list";

  @BindAttribute()
  interactive: boolean = true;

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
    this.shotTypes = [];
    for await (const shotType of this.shot_type_repository.table.query()) {
      this.shotTypes.push(shotType as ShotType);
    }
    
    this.shotTypes.sort((a, b) => a.name.localeCompare(b.name));

    render(html`
      <div class="shot-type-container">
        <h2 class="h1">Shot Types</h2>
        ${this.shotTypes.length > 0 ? html`
          <div class="shot-types" role="list" aria-label="List of shot types">
            ${this.shotTypes.map(shotType => {
              const key = shotType._key;
              return html`
              <m-card 
                href=${this.interactive ? `/bag/shot-type/edit/${key}` : undefined}
                role="listitem"
                aria-label=${`${shotType.name}, ${shotType.description || "no description"}`}
                class="shot-type-card"
              >
                <div class="shot-type-content">
                  <div class="name">
                    ${shotType.name}
                  </div>
                  ${shotType.description ? html`<div class="description">${shotType.description}</div>` : null}
                </div>
              </m-card>
            `})}
            ${this.interactive ? html`
              <a
                href="/bag/shot-type/add"
                class="button create-shot-type-button"
                data-variant="secondary"
                data-margin="bs-2"
                aria-label="Create new shot type"
              >
                + Create New Shot Type
              </a>
            ` : null}
          </div>
        ` : html`
          <m-empty-state
            title="$ shottype --list"
            message="No shot types configured. Add shot types to categorize different ways you can hit each club."
          >
            <a slot="action" href="/bag/shot-type/add">+ Add Shot Type</a>
          </m-empty-state>
        `}
      </div>
    `, this.shadowRoot!);
  }
}
