import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "uhtml";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { get_DB } from "../../../../db";
import { LagPuttingGame, LagPuttingGameService } from "../lag-putting-service";
import { TableChangeEvent } from "@maxhill/idb-distribute";
import type { MListboxChangeEvent } from "@maxhill/components/m-listbox";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Record score for a specific game
 *
 * @customElement
 * @tagname m-lag-putting-scorecard-page
 *
 * @slot - Default slot for component content
 *
 * @attr {string} example - An example property
 *
 * @prop {string} example - An example property
 */
export class MLagPuttingScorecardPage extends MElement {
  static tagName = "m-lag-putting-scorecard-page";

  @BindAttribute({ attribute: "game-key" })
  gameKey: string = "";
  currentGame: LagPuttingGame | null = null;

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
      this.render();
    });

    const row = await this.lagPuttingGameService.table.get(this.gameKey);
    this.currentGame = row ? (row as LagPuttingGame) : null;

    this.render();
  }

  async disconnectedCallback() {
    this.unsubscribe();
  }

  handleChange(e: MListboxChangeEvent) {
    console.log("e", e);
    console.log("target:", e.target);
    console.log("selected:", e.detail.selected);
    console.log("option:", e.detail.option);
  }

  private render() {
    render(
      this.shadowRoot!,
      html`
        <h1>Game</h1>
        <dl>
          <dt>Player</dt>
          <dd>${this.currentGame?.playerName}</dd>

          <dt>Course</dt>
          <dd>${this.currentGame?.courseName}</dd>

          <dt>Pratice area</dt>
          <dd>${this.currentGame?.practiceAreaName}</dd>
        </dl>

        <div class="putts-container">
          ${this.currentGame?.putts.map((
            putt,
            index,
          ) =>
            html`
              <m-card>
                <div slot="title">Putt no.${index}</div>
                <span>Distance:${putt.distance}</span>
                <m-listbox
                  data-putt-number="${index}"
                  @m-listbox-change="${this.handleChange}"
                >
                  <m-option value="+3m" class="tripple-bogey">+3m</m-option>
                  <m-option value="2-3m" class="double-bogey">+2-3m</m-option>
                  <m-option value="1-2m" class="bogey">+1-2m</m-option>
                  <m-option value="0.5-1m" class="par">+0.5-1m</m-option>
                  <m-option value="0-0.5m" class="birdie">+0-0.5m</m-option>
                  <m-option value="holed" class="holed">Holesd</m-option>
                  <m-option value="0-0.5m" class="birdie">-0-0.5m</m-option>
                  <m-option value="0.5-1m" class="par">-0.5-1m</m-option>
                  <m-option value="1-2m" class="bogey">-1-2m</m-option>
                  <m-option value="2-3m" class="double-bogey">-2-3m</m-option>
                  <m-option value="+3m" class="tripple-bogey">-3m</m-option>
                </m-listbox>
              </m-card>
            `
          )}
        </div>
      `,
    );
  }
}

// Auto-define when using default import
MLagPuttingScorecardPage.define();

export default MLagPuttingScorecardPage;
