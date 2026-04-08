import { MElement, BindAttribute, query, queryAll } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import template from "./index.html?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form for adding a new club
 * 
 * @customElement
 * @tagname m-add-club-form
 * 
 * @slot - Default slot for component content
 * 
 * @attr {string} example - An example property
 * 
 * @prop {string} example - An example property
 */
export class MAddClubForm extends MElement {
    static tagName = 'm-add-club-form';

    @BindAttribute()
    example: string = '';

    @query('slot')
    private defaultSlot!: HTMLSlotElement;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();
    }

    private render() {
        this.shadowRoot!.innerHTML = template;
    }
}

export default MAddClubForm;
