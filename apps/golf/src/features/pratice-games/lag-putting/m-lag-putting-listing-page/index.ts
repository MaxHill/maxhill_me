import { MElement } from "@maxhill/web-component-utils";
import type { TableChangeEvent } from "@maxhill/syncdb";
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

  private createDialogRef = createRef<HTMLDialogElement>();
  private editDialogRef = createRef<HTMLDialogElement>();

  lagPuttingGameService!: LagPuttingGameService;
  private unsubscribe!: () => void;
  private hasGames = false;
  private selectedGame: LagPuttingGame | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  async connectedCallback() {
    const db = await get_DB();
    this.lagPuttingGameService = new LagPuttingGameService(db);
    await this.refreshHasGames();
    this.unsubscribe = this.lagPuttingGameService.subscribe((_: TableChangeEvent) => {
      this.handleGamesChanged();
    });
    this.render();
  }

  private handleGamesChanged = async () => {
    await this.refreshHasGames();
    this.render();
  };

  private async refreshHasGames() {
    const games = await this.lagPuttingGameService.listGames();
    this.hasGames = games.length > 0;
  }

  disconnectedCallback() {
    this.unsubscribe();
  }

  private handleOpenCreateDialog = () => {
    this.createDialogRef.value?.showModal();
  };

  private handleCloseCreateDialog = () => {
    this.createDialogRef.value?.close();
  };

  private handleCreateSubmit = async (e: CreateLagPuttingSubmitEventEvent) => {
    await this.lagPuttingGameService.createGame(e.detail.value);
    this.handleCloseCreateDialog();
  };

  private handleOpenEditDialog = (game: LagPuttingGame) => {
    this.selectedGame = game;
    this.render();
    this.editDialogRef.value?.showModal();
  };

  private handleCloseEditDialog = () => {
    this.editDialogRef.value?.close();
    this.selectedGame = null;
    this.render();
  };

  private handleEditSubmit = async (e: CreateLagPuttingSubmitEventEvent) => {
    if (!this.selectedGame) return;

    const updatedGame: LagPuttingGame = {
      ...this.selectedGame,
      courseName: e.detail.value.courseName,
      practiceAreaName: e.detail.value.practiceAreaName,
    };

    await this.lagPuttingGameService.updateGame(updatedGame);
    this.handleCloseEditDialog();
  };

  private handleDeleteSelectedGame = async () => {
    if (!this.selectedGame) return;

    const shouldDelete = confirm(`Delete round from ${this.formatDate(this.selectedGame.createdAt)}?`);
    if (!shouldDelete) return;

    await this.lagPuttingGameService.deleteGame(this.selectedGame._key);
    this.handleCloseEditDialog();
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
            @click="${this.handleOpenCreateDialog}"
          >New round</button>
          <a href="/lag-putting/regler" class="button" data-variant="secondary">Rules</a>
        </div>

        <dialog ${ref(this.createDialogRef)} class="new-game-dialog">
          <m-create-lag-putting-game-form
            @create-lag-putt-cancel="${this.handleCloseCreateDialog}"
            @create-lag-putting-submit-event="${this.handleCreateSubmit}"
          ></m-create-lag-putting-game-form>
        </dialog>

        <dialog ${ref(this.editDialogRef)} class="edit-game-dialog">
          ${this.selectedGame
            ? html`
                <m-create-lag-putting-game-form
                  mode="edit"
                  course-name="${this.selectedGame.courseName}"
                  practice-area-name="${this.selectedGame.practiceAreaName}"
                  @create-lag-putt-cancel="${this.handleCloseEditDialog}"
                  @create-lag-putting-submit-event="${this.handleEditSubmit}"
                ></m-create-lag-putting-game-form>

                <details class="danger-zone">
                  <summary>danger-zone</summary>
                  <button
                    type="button"
                    class="button danger-zone-delete"
                    data-variant="secondary"
                    @click="${this.handleDeleteSelectedGame}"
                  >
                    Delete game
                  </button>
                </details>
              `
            : null}
        </dialog>

        ${this.hasGames
          ? html`
            <div class="game-list">
              ${asyncAppend(games, (g) => {
                const game = g as LagPuttingGame;
                const totalScore = this.lagPuttingGameService.calculateTotalScore(game.putts);
                const completed = game.putts.filter((p) => p.result !== null).length;
                const isComplete = completed === 18;

                return html`
                  <div class="game-row">
                    <a class="game-row-link" href="${"/lag-putting/" + game._key}">
                      <div class="game-meta">
                        <span class="game-date">${this.formatDate(game.createdAt)}</span>
                        <span class="game-details">${game.courseName}</span>
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
                    <button
                      type="button"
                      class="button game-edit-button"
                      data-variant="secondary"
                      @click="${() => this.handleOpenEditDialog(game)}"
                    >
                      Edit
                    </button>
                  </div>
                `;
              })}
            </div>
          `
          : html`
            <m-empty-state
              title="$ lag-putting --list"
              message="No rounds yet. Start your first lag putting round to track progress over time."
            >
              <button slot="action" type="button" class="button" @click=${this.handleOpenCreateDialog}>
                New round
              </button>
            </m-empty-state>
          `}
      `,
      this.shadowRoot!,
    );
  }
}

export default MLagPuttingListingPage;
