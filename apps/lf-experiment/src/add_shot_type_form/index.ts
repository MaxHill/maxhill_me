import { MElement, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { get_DB } from "../db";
import { ShotTypeRepository } from "../shot_type_repository";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class AddShotTypeForm extends MElement {
    static tagName = 'm-add-shot-type-form';

    private shot_type_repository!: ShotTypeRepository;

    @query("#add-shot-type-form")
    private add_shot_type_form!: HTMLFormElement;

    #shadowRoot: ShadowRoot;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    async connectedCallback() {
        const db = await get_DB();
        this.shot_type_repository = new ShotTypeRepository(db);

        this.render();
        this.add_shot_type_form.addEventListener("submit", this.handleFormSubmit.bind(this));
    }

    disconnectedCallback() {
        this.add_shot_type_form.removeEventListener("submit", this.handleFormSubmit)
    }

    private async handleFormSubmit(e: Event) {
        e.preventDefault();
        const formData = new FormData(this.add_shot_type_form);

        const name = formData.get("name")?.toString();
        const club = formData.get("club")?.toString();
        const description = formData.get("description")?.toString();

        if (!name || !club || !description) {
            return;
        }

        await this.shot_type_repository.addShotType({
            name, club, description
        });

        this.add_shot_type_form.reset()
    }

    render() {
        this.#shadowRoot.innerHTML = `
            <form id="add-shot-type-form" class="form box">
                <h2>Add a new shot type</h2>
                
                <m-input required min="2" name="name" label="Name"></m-input>
                <m-input required min="2" name="club" label="Club"></m-input>
                <m-textarea required minlength="10" name="description" label="Description" rows="4" placeholder="Enter a detailed description..." clearable></m-textarea>

                <button>Add</button>
            </form>
        `;
    }
}
