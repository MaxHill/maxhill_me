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

  private formatDate(createdAt: string | undefined): string {
    if (!createdAt) return "—";
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  private formatScore(score: number): string {
    if (score === 0) return "E";
    return score > 0 ? `+${score}` : `${score}`;
  }

  private render() {
    const games = this.lagPuttingGameService.queryGamesNewestFirst();

    render(
      html`
        <div class="page-header">
          <h1>Lag Putting</h1>
        </div>

        <div class="actions-bar">
          <button
            type="button"
            class="button"
            @click="${this.handleOpenDialog}"
          >New round</button>
          <a href="/lag-putting/regler" class="button" data-variant="secondary">Rules</a>
        </div>

        <dialog ${ref(this.dialogRef)} class="new-game-dialog">
          <m-create-lag-putting-game-form
            @create-lag-putt-cancel="${this.handleCloseDialog}"
            @create-lag-putting-submit-event="${this.handleSubmit}"
          ></m-create-lag-putting-game-form>
        </dialog>

        <div class="game-list">
          ${asyncAppend(games, (g) => {
            const game = g as LagPuttingGame;
            const totalScore = this.lagPuttingGameService.calculateTotalScore(game.putts);
            const completed = game.putts.filter((p) => p.result !== null).length;
            const isComplete = completed === 18;

            return html`
              <a class="game-row" href="${"/lag-putting/" + game._key}">
                <div class="game-meta">
                  <span class="game-date">${this.formatDate(game.createdAt)}</span>
                  <span class="game-details">${game.playerName} · ${game.courseName}</span>
                </div>
                <span
                  class="game-progress"
                  ?data-incomplete="${!isComplete}"
                >${completed}/18</span>
                <span
                  class="game-score"
                  ?data-negative="${totalScore < 0}"
                  ?data-positive="${totalScore > 0}"
                >${this.formatScore(totalScore)}</span>
              </a>
            `;
          })}
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

export default MLagPuttingListingPage;
