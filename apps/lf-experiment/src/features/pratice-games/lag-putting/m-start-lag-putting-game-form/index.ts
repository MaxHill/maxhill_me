import { MElement, BindAttribute, query, queryAll } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { CreateLagPuttCancelEvent } from "../create-lag-puttin-cancel-event.ts";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form for creating a new lag putting game
 * 
 * @customElement
 * @tagname m-start-lag-putting-game-form
 * 
 * @slot - Default slot for component content
 * 
 * @attr {string} example - An example property
 * 
 * @prop {string} example - An example property
 */
export class MStartLagPuttingGameForm extends MElement {
    static tagName = 'm-start-lag-putting-game-form';

    @BindAttribute()
    example: string = '';

    @query('slot')
    private defaultSlot!: HTMLSlotElement;
    
    private formRef: HTMLFormElement | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
    }

    connectedCallback() {
        this.render();
    }

    handleSubmit(e: FormEvent) {
        e.preventDefault();
        alert("submitted")
    }

    private render() {
        render(this.shadowRoot!, html`
            <form class="form" @submit=${this.handleSubmit}>
                <h2>Start a new game</h2>
                <m-input
                    name="playerName"
                    label="Player name"
                />
                <m-input
                    name="courseName"
                    label="Course name"
                />
                <m-input
                    name="practiceAreaName"
                    label="Pratice area name"
                />

                <div class="form-actions stack" data-direction="row" data-justify="content-between">
                  <button class="button" value="yes">Start Game</button>
                  <button 
                    @click=${() => {
                        this.dispatchEvent(new CreateLagPuttCancelEvent({}));
                    }}
                    type="button"
                    class="button" 
                    data-variant="secondary" 
                    value="no">Cancel</button>
                </div>
            </form>
        `);
    }
}

export default MStartLagPuttingGameForm;
