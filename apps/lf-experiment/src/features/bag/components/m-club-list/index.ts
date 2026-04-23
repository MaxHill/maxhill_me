import { MElement, BindAttribute } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { ClubService } from "../../club-service";
import { get_DB } from "../../../../db";
import { ShotType } from "../../shot-type-service";
import { TableChangeEvent } from "@maxhill/idb-distribute";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
import "@maxhill/components/m-card";

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
 * 
 * @attr {boolean} interactive - Whether cards are clickable (default: true)
 */
export class MClubList extends MElement {
  static tagName = "m-club-list";

  @BindAttribute({ type: "boolean" })
  interactive: boolean = true;

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

  private render() {
    render(
      this.shadowRoot!,
      html`
        <div>
          <h2 class="h1">Clubs</h2>
          ${this.clubs.length > 0
            ? html`
                <div class="clubs" role="list" aria-label="List of clubs in your bag">
                  ${this.clubs.map(
                    (club) => html`
                      <m-card 
                        href=${this.interactive ? `/bag/edit/${club._key}` : undefined}
                        role="listitem"
                        aria-label=${`${club.name}, ${club.shotTypes?.length || 0} shot types`}
                      >
                        <div class="card-content">
                          <div class="name">${club.name}</div>
                          <div class="club-type">${club.clubType}</div>
                          <div class="shot-types">
                            <span class="label">Shot types</span>
                            <span>
                              ${club.shotTypes && club.shotTypes.length > 0
                                ? club.shotTypes.map((shotType: ShotType) => shotType.name).join(", ")
                                : "None"}
                            </span>
                          </div>
                        </div>
                      </m-card>
                    `
                  )}
                  ${this.interactive ? html`
                    <m-card 
                      href="/bag/add"
                      class="add-club-card"
                      aria-label="Add new club to bag"
                    >
                      <div class="add-club-content">
                        <span class="plus-icon">+</span>
                        <span class="label">Add club</span>
                      </div>
                    </m-card>
                  ` : null}
                </div>
              `
            : html`
                <div class="empty-state">
                  <p class="empty-message">No clubs in your bag yet.</p>
                  <a href="/bag/add" class="empty-cta-button">+ Add club</a>
                </div>
              `}
        </div>
      `
    );
  }
}

export default MClubList;
