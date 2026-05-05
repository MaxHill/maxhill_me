import { MElement, BindAttribute, query, queryAll } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "../../../../vendor/uhtml/src/dom/index.js";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { get_DB } from "../../../../db.ts";
import { LagPuttingGameService} from "../lag-putting-service.ts";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Listing page for the lag putting game
 * 
 * @customElement
 * @tagname m-lag-putting-listing-page
 * 
 * @slot - Default slot for component content
 * 
 * @attr {string} example - An example property
 * 
 * @prop {string} example - An example property
 */
export class MLagPuttingListingPage extends MElement {
    static tagName = 'm-lag-putting-listing-page';

    @BindAttribute()
    example: string = '';

    @query('slot')
    private defaultSlot!: HTMLSlotElement;

    private dialogRef: HTMLDialogElement | null = null;

    lagPuttingGameService!: LagPuttingGameService;
    private unsubscribe!: () => void;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
    }

    async connectedCallback() {
        const db = await get_DB();
        this.lagPuttingGameService = new LagPuttingGameService(db);
        this.unsubscribe = this.lagPuttingGameService.subscribe(async (_: TableChangeEvent) => {
          await this.render();
        });
          await this.render();
    }

    disconnectedCallback() {
        this.unsubscribe();
    }

      private handleOpenDialog = () => {
        if (this.dialogRef) {
          this.dialogRef.showModal();
        }
      };

      private handleCloseDialog = () => {
        if (this.dialogRef) {
          this.dialogRef.close();
        }
      };

      private handleSubmit = () => {
          console.log("what's the value?")
      };

    private async render() {
        const games = [];
        for await (const game of this.lagPuttingGameService.table.query()) {
          games.push(game as LagPuttingGame);
        }

        render(this.shadowRoot!, html`
            <div class="stack" data-direction="row" data-justify="content-between">
            <h1 class="h1">m-lag-putting-listing-page</h1>
          <button 
            type="button" 
            class="button new-game-button" 
            data-variant="secondary"
            @click=${this.handleOpenDialog}
            aria-label="Start a new game"
          >Start new game</button>

        <dialog id="testing" ref=${(el: any) => this.dialogRef = el} class="new-game-dialog">
          <m-start-lag-putting-game-form
            @submit=${this.handleSubmit}
            @create-lag-putt-cancel=${this.handleCloseDialog}
          />
        </dialog>
            </div>
            <h2>List of games</h2>
            ${games.map(game => html`<li>${game._key}</li>`)}
        `);
    }
}

export default MLagPuttingListingPage;
