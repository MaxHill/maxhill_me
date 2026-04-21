import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { ClubService } from "../../club-service";
import { get_DB } from "../../../../db";
import { ShotType } from "../../shot-type-service";
import { TableChangeEvent } from "@maxhill/idb-distribute";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

interface Club {
  _key: string;
  name: string;
  clubType: string;
  shotTypes?: ShotType[];
}

/**
 * Display a list of all clubs in the bag
 *
 * @customElement
 * @tagname m-club-list
 */
export class MClubList extends MElement {
  static tagName = "m-club-list";

  private clubService!: ClubService;
  private clubs: Club[] = [];
  private unsubscribe!: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.clubService = new ClubService(db);
    this.unsubscribe = this.clubService.subscribe(async (_: TableChangeEvent) => {
      await this.loadAndRender();
    });
    await this.loadAndRender();
  }

  async disconnectedCallback() {
    this.unsubscribe?.();
  }

  private async loadAndRender() {
    // Load clubs into state array
    this.clubs = [];
    for await (const club of this.clubService.table.query()) {
      this.clubs.push(club as Club);
    }
    this.render();
  }

  private handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const link = e.target as HTMLAnchorElement;
      link.click();
    }
  }

  private render() {
    render(
      this.shadowRoot!,
      html`
        <div>
          <h2>Clubs</h2>
          ${this.clubs.length > 0
            ? html`
                <ul id="clubs" role="list" aria-label="List of clubs in your bag">
                  ${this.clubs.map(
                    (club) => html`
                      <li role="listitem">
                        <div class="name">${club.name} ${club.clubType}</div>
                        <div class="shot-types">
                          ${club.shotTypes && club.shotTypes.length > 0
                            ? club.shotTypes.map((shotType: ShotType) => shotType.name).join(", ")
                            : "No shot types"}
                        </div>
                        <a
                          class="edit-link"
                          href=${`/bag/club/${club._key}/edit`}
                          tabindex="0"
                          aria-label=${`Edit ${club.name} ${club.clubType}`}
                          @keydown=${(e: KeyboardEvent) => this.handleEditKeydown(e)}
                        >
                          Edit
                        </a>
                      </li>
                    `
                  )}
                </ul>
              `
            : html`
                <p style="color: var(--color-text-muted, #666); font-style: italic;">
                  No clubs in your bag yet. Add one to get started!
                </p>
              `}
        </div>
      `
    );
  }
}

export default MClubList;
