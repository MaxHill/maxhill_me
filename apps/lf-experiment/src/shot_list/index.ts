import { MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { get_DB } from "../db";
import { ShotTypeRepository } from "../shot_type_repository";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class ShotList extends MElement {
    static tagName = 'm-shot-list';

    private shot_type_repository!: ShotTypeRepository;

    @query("#shot-list-item-template")
    private template!: HTMLTemplateElement;

    @query("#shots")
    private shots_container!: HTMLUListElement;

    #shadowRoot: ShadowRoot;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    async connectedCallback() {
        const db = await get_DB();
        this.shot_type_repository = new ShotTypeRepository(db);

        await this.render();
    }

    async render() {
        this.#shadowRoot.innerHTML = `
            <template id="shot-list-item-template">
                <li>
                    <div class="name"></div>
                    <div class="club"></div>
                    <div class="description"></div>
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
