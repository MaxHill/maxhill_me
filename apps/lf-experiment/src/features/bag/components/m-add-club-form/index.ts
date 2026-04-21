import { MElement, BindAttribute, query } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import template from "./index.html?inline";
import MCombobox from "@maxhill/components/m-combobox/index";
import { ShotType, ShotTypeService } from "../../shot-type-service";
import { get_DB } from "../../../../db";
import { ClubService, ClubTypes } from "../../club-service";
import { globalStyleSheet } from "../../../../styles/global-styles";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form for adding a new club
 * 
 * @customElement
 * @tagname m-add-club-form
 */
export class MAddClubForm extends MElement {
    static tagName = 'm-add-club-form';

    @BindAttribute()
    example: string = '';

    @query('#shot-type-combobox')
    private shotTypeCombobox!: MCombobox;

    @query('#add-club-form')
    addClubForm!: HTMLFormElement;

    @query('#shot-type-option-template')
    private shotTypeOptionTemplate!: HTMLTemplateElement;

    // @query("#shot-type-combobox")
    // shotTypeCombobox!: MCombobox;

    private shotTypeService!: ShotTypeService
    private clubService!: ClubService

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
    }

    async connectedCallback() {
        const db = await get_DB();
        this.shotTypeService = new ShotTypeService(db);
        this.clubService = new ClubService(db);
        await this.render();
        this.addClubForm.addEventListener("submit", this.handleFormSubmit.bind(this));
    }

    disconnectedCallback() {
        this.addClubForm.removeEventListener("submit", this.handleFormSubmit)
    }

    private async handleFormSubmit(e: Event) {
        e.preventDefault();
        const formData = new FormData(this.addClubForm);

        const name = formData.get("name")?.toString();
        const clubType = formData.get("clubType")?.toString() as ClubTypes;
        const shotTypes = await Promise.all(formData.getAll("shotTypes").map(async (key) => {
            return await this.shotTypeService.table.get(key.toString());
        })) as ShotType[];

        if (!name || !clubType || !shotTypes) {
            return;
        }

        await this.clubService.addClub({ name, clubType, shotTypes });

        this.addClubForm.reset()
    }

    private async render() {
        this.shadowRoot!.innerHTML = template;
        await this.renderShotTypeOptions();
    }

    private async renderShotTypeOptions() {
        this.shotTypeCombobox.innerHTML = "";
        const shotTypesIterator = this.shotTypeService.table.query();
        for await (const shotType of shotTypesIterator) {
            if (!shotType._key) continue;

            const clone = document.importNode(this.shotTypeOptionTemplate.content, true);
            const option = clone.querySelector('m-option');

            if (option) {
                option.setAttribute('value', shotType._key);
                option.textContent = shotType.name;
            }

            this.shotTypeCombobox.appendChild(clone);
        }
    }
}

export default MAddClubForm;
