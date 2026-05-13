import { MElement } from "@maxhill/web-component-utils";
import type { TableChangeEvent } from "@maxhill/idb-distribute";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { createRef, ref } from "lit-html/directives/ref.js";
import { asyncAppend } from "lit-html/directives/async-append.js";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { get_DB } from "../../../../db.ts";
import { LagPuttingGame, LagPuttingGameService } from "../lag-putting-service.ts";
import { CreateLagPuttingSubmitEventEvent } from "../m-create-lag-putting-game-form/events";
import { lagPuttingHud } from "../lag-putting-game-hud.ts";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Listing page for the lag putting game
 *
 * @customElement
 * @tagname m-lag-putting-listing-page
 */
export class MLagPuttingListingPage extends MElement {
  static tagName = "m-lag-putting-listing-page";

  private dialogRef = createRef<HTMLDialogElement>();

  lagPuttingGameService!: LagPuttingGameService;
  private unsubscribe!: () => void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.lagPuttingGameService = new LagPuttingGameService(db);
    this.unsubscribe = this.lagPuttingGameService.subscribe((_: TableChangeEvent) => {
      this.render();
    });
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe();
  }

  private handleOpenDialog = () => {
    this.dialogRef.value?.showModal();
  };

  private handleCloseDialog = () => {
    this.dialogRef.value?.close();
  };

  private handleSubmit = async (e: CreateLagPuttingSubmitEventEvent) => {
    await this.lagPuttingGameService.createGame(e.detail.value);
    this.handleCloseDialog();
  };

  private render() {
    const games = this.lagPuttingGameService.table.query() as AsyncIterable<LagPuttingGame>;

    render(
      html`
        <div class="stack" data-direction="row" data-justify="content-between">
          <h1 class="h1">Lag Putting Practice</h1>
          <button
            type="button"
            class="button new-game-button"
            data-variant="secondary"
            @click="${this.handleOpenDialog}"
            aria-label="Start a new game"
          >
            Start new game
          </button>

          <dialog ${ref(this.dialogRef)} class="new-game-dialog">
            <m-create-lag-putting-game-form
              @create-lag-putt-cancel="${this.handleCloseDialog}"
              @create-lag-putting-submit-event="${this.handleSubmit}"
            />
          </dialog>
        </div>

        <h2>Rounds</h2>

        <div class="collection" data-padding="body" data-size="10" data-gap="3">
          ${asyncAppend(games, (g) => {
            const game = g as LagPuttingGame;
            return html`
              <m-card href="${"/game/" + game._key}">
                ${lagPuttingHud(game, this.lagPuttingGameService)}
              </m-card>
            `;
          })}
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

export default MLagPuttingListingPage;
