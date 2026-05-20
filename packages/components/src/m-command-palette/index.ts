import { MElement } from "@maxhill/web-component-utils";
import { query, queryAll } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import MCommand from "../m-command";
import MListbox from "../m-listbox";
import MInput from "../m-input";

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

    @queryAll('m-command', { dom: "document" })
    private commandElements!: MCommand[];

    @query("form")
    private formElement!: HTMLFormElement;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();

        document.addEventListener("m-command-register", this.handleReRender)
        document.addEventListener("m-command-unregister", this.handleReRender)
        this.shadowRoot!.addEventListener("submit", this.handleSubmit)
    }

    disconnectedCallback() {
        document.removeEventListener("m-command-register", this.handleReRender)
        document.removeEventListener("m-command-unregister", this.handleReRender)
        this.shadowRoot!.removeEventListener("submit", this.handleSubmit);
    }

    private handleSubmit = (e: Event) => {
        e.preventDefault();
        const listbox = this.shadowRoot!.querySelector('m-listbox') as MListbox;
        const selectedCommandId = Array.isArray(listbox?.value) ? listbox.value[0] : listbox?.value;
        if (!selectedCommandId) return;

        const commandEl = document.getElementById(selectedCommandId as string) as MCommand | null;
        if (commandEl) {
            commandEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            // Trigger the command's handler directly
            const event = new KeyboardEvent('keydown');
            (commandEl as any).handleChange(event);
        }
    }


    private handleReRender = () => {
        this.render();
    }

    private render() {
        const commands = document.querySelectorAll('m-command');
        this.shadowRoot!.innerHTML = `
            <form>
                <m-search-list target="m-listbox">
                    <m-input slot="controller" type="search" placeholder="Search commands..."></m-input>
                    <m-listbox name="command" skip="[data-match='false']" label="Commands">
                        ${Array.from(commands).reduce((acc, e) => {
                            const label = e.id.replace(/^command_/, '').replace(/-/g, ' ');
                            return `${acc}<m-option value="${e.id}">${label}</m-option>`;
                        }, "")}
                    </m-listbox>
                </m-search-list>
                <button type="submit">Select</button>
            </form>
        `;
    }
}

// Auto-define when using default import
MCommandPalette.define();

export default MCommandPalette;