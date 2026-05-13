import { MElement } from "@maxhill/web-component-utils";
import type { TableChangeEvent } from "@maxhill/idb-distribute";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { get_DB } from "../../../../db.ts";
import { LagPuttingGame, LagPuttingGameService } from "../lag-putting-service.ts";
import { CreateLagPuttingSubmitEventEvent } from "../m-create-lag-putting-game-form/events";

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

    private dialogRef: HTMLDialogElement | null = null;

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

    private handleSubmit = async (e: CreateLagPuttingSubmitEventEvent) => {
        console.log("what's the value?", e.detail.value);
        const game = await this.lagPuttingGameService.createGame(e.detail.value);
        console.log("TODO: navigate to the game", game);
        this.handleCloseDialog();
    };

    private async render() {
        const games = [];
        for await (const game of this.lagPuttingGameService.table.query()) {
            games.push(game as LagPuttingGame);
        }

        render(
            html`
        <div class="stack" data-direction="row" data-justify="content-between">
          <h1 class="h1">m-lag-putting-listing-page</h1>
          <button
            type="button"
            class="button new-game-button"
            data-variant="secondary"
            @click="${this.handleOpenDialog}"
            aria-label="Start a new game"
          >
            Start new game
          </button>

          <dialog id="testing" ${ref((el) => { this.dialogRef = el as HTMLDialogElement ?? null; })} class="new-game-dialog">
            <m-create-lag-putting-game-form
              @create-lag-putt-cancel="${this.handleCloseDialog}"
              @create-lag-putting-submit-event="${this.handleSubmit}"
            />
          </dialog>
        </div>
        <h2>List of games</h2>

        <div class="collection" data-padding="body" data-size="10" data-gap="3">
            ${games.map((game) => {
                const completedPutts = game?.putts.filter(p => p.result !== null).length || 0;
                const totalPutts = 18;
                const outScore = this.lagPuttingGameService.calculateOutScore(game.putts);
                const inScore = this.lagPuttingGameService.calculateInScore(game.putts);
                const totalScore = this.lagPuttingGameService.calculateTotalScore(game.putts);
                return html`
                <m-card href=${"/game/" + game._key}>
                    <dl class="game-hud">
                      <dt>Created</dt>
                      <dd>${game.createdAt || '-'}</dd>

                      <dt>Player</dt>
                      <dd>${game?.playerName}</dd>

                      <dt>Course</dt>
                      <dd>${game?.courseName}</dd>

                      <dt>Pratice area</dt>
                      <dd>${game?.practiceAreaName}</dd>

                      <dt>Progress</dt>
                      <dd>${completedPutts}/${totalPutts}</dd>

                      <dt>Out Score</dt>
                      <dd>${outScore > 0 ? '+' : ''}${outScore}</dd>

                      <dt>In Score</dt>
                      <dd>${inScore > 0 ? '+' : ''}${inScore}</dd>

                      <dt>Total Score</dt>
                      <dd>${totalScore > 0 ? '+' : ''}${totalScore}</dd>
                    </dl>
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
