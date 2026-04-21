import { MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { ClubService } from "../../club-service";
import { get_DB } from "../../../../db";
import { ShotType } from "../../shot-type-service";
import { TableChangeEvent } from "@maxhill/idb-distribute";
import { globalStyleSheet } from "../../../../styles/global-styles";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Display a list of all clubs in the bag
 *
 * @customElement
 * @tagname m-club-list
 */
export class MClubList extends MElement {
  static tagName = "m-club-list";

  private clubService!: ClubService;

  @query("#club-list-item-template")
  private template!: HTMLTemplateElement;

  @query("#clubs")
  private clubsContainer!: HTMLUListElement;

  unsubscribe!: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.clubService = new ClubService(db);
    this.unsubscribe = this.clubService.subscribe(async (_: TableChangeEvent) => {
      await this.render();
    });
    await this.render();
  }

  async disconnectedCallback() {
    this.unsubscribe?.();
  }

  private async render() {
    this.shadowRoot!.innerHTML = `
            <template id="club-list-item-template">
                <li role="listitem">
                    <div class="name"></div>
                    <div class="shot-types"></div>
                    <a class="edit-link" tabindex="0">Edit</a>
                </li>
            </template>

            <div>
                <h2>Clubs</h2>
                <ul id="clubs" role="list" aria-label="List of clubs in your bag"></ul>
                <p id="empty-message" style="display: none; color: var(--color-text-muted, #666); font-style: italic;">No clubs in your bag yet. Add one to get started!</p>
            </div>
        `;

    let hasClubs = false;
    for await (const golf_club of this.clubService.table.query()) {
      hasClubs = true;
      const clone = document.importNode(this.template.content, true);

      const name = clone.querySelector(".name");
      if (name) name.textContent = `${golf_club.name} ${golf_club.clubType}`;

      const club = clone.querySelector(".shot-types");
      if (club) {
        club.textContent = golf_club.shotTypes && golf_club.shotTypes.length > 0
          ? golf_club.shotTypes.map((shotType: ShotType) => shotType.name).join(", ")
          : "No shot types";
      }

      const editLink = clone.querySelector(".edit-link") as HTMLAnchorElement;
      if (editLink) {
        editLink.href = `/bag/club/${golf_club._key}/edit`;
        editLink.setAttribute('aria-label', `Edit ${golf_club.name} ${golf_club.clubType}`);
        
        // Add keyboard support for Enter key
        editLink.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            editLink.click();
          }
        });
      }

      this.clubsContainer?.appendChild(clone);
    }

    // Show empty message if no clubs
    if (!hasClubs) {
      const emptyMessage = this.shadowRoot!.querySelector('#empty-message') as HTMLElement;
      if (emptyMessage) {
        emptyMessage.style.display = 'block';
      }
    }
  }
}

export default MClubList;
