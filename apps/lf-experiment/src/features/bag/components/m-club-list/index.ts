import { MElement, BindAttribute, query, queryAll } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { ClubService } from "../../club-service";
import { get_DB } from "../../../../db";
import { ShotLog } from "../../../shot-log/shot-log-service";
import { ShotType } from "../../shot-type-service";
import { TableChangeEvent } from "@maxhill/idb-distribute";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Display a list of all clubs in the bag
 * 
 * @customElement
 * @tagname m-club-list
 * 
 */
export class MClubList extends MElement {
    static tagName = 'm-club-list';

    private clubService!: ClubService;

    @query("#club-list-item-template")
    private template!: HTMLTemplateElement;

    @query("#clubs")
    private clubsContainer!: HTMLUListElement;

    unsubscribe!: () => void;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [baseStyleSheet];
    }

    async connectedCallback() {
        const db = await get_DB();
        this.clubService = new ClubService(db);
        this.unsubscribe = this.clubService.subscribe(async (_: TableChangeEvent) => {
            await this.render()
        });
        await this.render();
    }

    async disconnectedCallback() {
        this.unsubscribe();
    }

    private async render() {
        this.shadowRoot!.innerHTML = `
            <template id="club-list-item-template">
                <li>
                    <div class="name"></div>
                    <div class="shot-types"></div>
                </li>
            </template>

            <div>
                <h2>Clubs</h2>
                <ul id="clubs"></ul>
            </div>
        `;

        for await (const golf_club of this.clubService.table.query()) {
            const clone = document.importNode(this.template.content, true);

            const name = clone.querySelector(".name");
            if (name) name.textContent = `${golf_club.name} ${golf_club.clubType}`;

            const club = clone.querySelector(".shot-types");
            if (club) {
                club.textContent = golf_club.shotTypes
                    .map((shotType: ShotType) => shotType.name)
                    .join(", ");
            }

            this.clubsContainer?.appendChild(clone);
        }
    }
}

export default MClubList;
