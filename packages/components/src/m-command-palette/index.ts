import { MElement } from "../utils/m-element";
import { query, queryAll } from "../utils/query";
import styles from "./index.css?inline";
import MCommand from "../m-command";
import MListbox from "../m-listbox";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * List filter and execute m-command elements
 * 
 * @customElement
 * @tagname m-command-palette
 * 
 * @slot - Default slot for component content
 * 
 * @attr {string} example - An example property
 * 
 * @prop {string} example - An example property
 * 
 * @fires m-command-palette-change - Fired when the example changes (detail: { example: string })
 */
export class MCommandPalette extends MElement {
    static tagName = 'm-command-palette';
    static observedAttributes = [];

    private _shadowRoot: ShadowRoot;

    @queryAll('m-command', { dom: "document" })
    private commandElements!: MCommand[];

    @query("form")
    private formElement!: HTMLFormElement;

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open' });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();
        // this.dispatchEvent(new MCommandPaletteChangeEvent({ example: this.example }));

        document.addEventListener("m-command-register", this.render)
        document.addEventListener("m-command-unregister", this.render)
        this.formElement.addEventListener("submit", this.handleSubmit)
    }

    disconnectedCallback() {
        document.removeEventListener("m-command-register", this.render)
        document.removeEventListener("m-command-unregister", this.render)
        this.formElement.removeEventListener("submit", this.handleSubmit);
    }

    private handleSubmit = (e: SubmitEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);

        // Access as object
        const data = Object.fromEntries(formData);
        const listbox = this._shadowRoot.querySelector('m-listbox') as MListbox;
    const selectedCommand = listbox?.value;
        console.log(data, selectedCommand)
    }


    private render() {
        this._shadowRoot.innerHTML = `
            <form>
                <m-search-list target="m-listbox">
                    <label>
                        Search commands
                        <input type="search"/>
                    </label>
                    <m-listbox name="command" skip="[data-match='false']" label="Commands">
                        ${this.commandElements.reduce((acc, e) => `${acc}<m-option value="${e.id}">${e.id}</m-option>`, "")}
                    </m-listbox>
                </m-search-list>
                <button type="submit">Select</button>
            </form>
        `;
    }
}

export default MCommandPalette;
