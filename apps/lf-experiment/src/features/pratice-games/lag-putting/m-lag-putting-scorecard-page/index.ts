import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "uhtml";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { get_DB } from "../../../../db";
import { LagPuttingGameService } from "../lag-putting-service";
import type { LagPuttingGame, PuttResult, PuttOutcome } from "../lag-putting-service";
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

        const row = await this.lagPuttingGameService.table.get(this.gameKey);
        this.currentGame = row ? (row as LagPuttingGame) : null;

        this.unsubscribe = this.lagPuttingGameService.subscribe(() => {
            this.render();

        })

        this.render();
    }

    disconnectedCallback() {
        this.unsubscribe()
    }


    handleNavClick = (e: MouseEvent) => {
        e.preventDefault();
        const target = e.target as HTMLAnchorElement;
        if (target.tagName !== 'A' || !target.hash) return;

        const targetId = target.hash.slice(1);
        const targetElement = this.shadowRoot?.getElementById(targetId);
        
        if (targetElement) {
            targetElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'start' 
            });
        }
    }

    handleChange = async (e: MListboxChangeEvent) => {
        if (!e.detail.option || !this.currentGame) return;

        const puttIndexStr = (e.target as HTMLElement).getAttribute("data-putt-index");
        if (!puttIndexStr) {
            console.error("No putt index found on target");
            return;
        }

        const puttIndex = parseInt(puttIndexStr, 10);
        const optionValue = e.detail.option.value;

        // Create the PuttResult
        let result: PuttResult;
        switch (optionValue) {
            case "+3m-long": { result = { outcome: "+3m", leave: "long" }; break; }
            case "2-3m-long": { result = { outcome: "2-3m", leave: "long" }; break; }
            case "1-2m-long": { result = { outcome: "1-2m", leave: "long" }; break; }
            case "0.5-1m-long": { result = { outcome: "0.5-1m", leave: "long" }; break; }
            case "0-0.5m-long": { result = { outcome: "0-0.5m", leave: "long" }; break; }

            case "holed": { result = { outcome: "holed" }; break; }

            case "0-0.5m-short": { result = { outcome: "0-0.5m", leave: "short" }; break; }
            case "0.5-1m-short": { result = { outcome: "0.5-1m", leave: "short" }; break; }
            case "1-2m-short": { result = { outcome: "1-2m", leave: "short" }; break; }
            case "2-3m-short": { result = { outcome: "2-3m", leave: "short" }; break; }
            case "+3m-short": { result = { outcome: "+3m", leave: "short" }; break; }

            default: {
                console.error("Unknown option value:", optionValue);
                return; // or throw an error
            }
        }

        const currentResult = this.currentGame.putts[puttIndex].result;
        if (currentResult && currentResult === result) {
            console.log("Value unchanged, skipping save");
            return;
        }

        this.currentGame.putts[puttIndex].result = result;

        try {
            await this.lagPuttingGameService.recordPuttResult(this.currentGame._key, puttIndex, result);
        } catch (error) {
            console.error("Failed to save putt result:", error);
        }
    }

    private getListboxValue(putt: LagPuttingGame['putts'][0]): string {
        if (!putt.result) return "";
        if (putt.result.outcome === "holed") return "holed";
        // Combine outcome and leave direction for unique value
        return `${putt.result.outcome}-${putt.result.leave}`;
    }

    private render() {
        const completedPutts = this.currentGame?.putts.filter(p => p.result !== null).length || 0;
        const totalPutts = 18;
        const outScore = this.currentGame ? this.lagPuttingGameService.calculateOutScore(this.currentGame.putts) : 0;
        const inScore = this.currentGame ? this.lagPuttingGameService.calculateInScore(this.currentGame.putts) : 0;
        const totalScore = this.currentGame ? this.lagPuttingGameService.calculateTotalScore(this.currentGame.putts) : 0;

        render(
            this.shadowRoot!,
            html`
        <h1>Game</h1>
        <dl class="game-hud">
          <dt>Player</dt>
          <dd>${this.currentGame?.playerName}</dd>

          <dt>Course</dt>
          <dd>${this.currentGame?.courseName}</dd>

          <dt>Pratice area</dt>
          <dd>${this.currentGame?.practiceAreaName}</dd>

          <dt>Progress</dt>
          <dd>${completedPutts}/${totalPutts}</dd>

          <dt>Out Score</dt>
          <dd>${outScore > 0 ? '+' : ''}${outScore}</dd>

          <dt>In Score</dt>
          <dd>${inScore > 0 ? '+' : ''}${inScore}</dd>

          <dt>Total Score</dt>
          <dd>${totalScore > 0 ? '+' : ''}${totalScore}</dd>
        </dl>

        <nav class="exposed-grid stack" data-direction="row" data-border @click=${this.handleNavClick}>
          ${this.currentGame?.putts.map((putt, index) => html`
            <a href=${`#putt-${index + 1}`} data-padding="2">${index + 1}${putt.result ? '*' : ''}</a>
          `) || html``}
        </nav>

        <div class="putts-container">
          ${this.currentGame?.putts.map((
                putt,
                index,
            ) =>
                html`
              <m-card id=${`putt-${index + 1}`}>
                <dl>
                <dt>Putt no</dt>
                <dd>${index + 1}</dd>

                <dt>Distance</dt>
                <dd>${putt.distance}m</dd>

                <dt>Result</dt>
                <dd>${putt.result?.outcome}</dd>

                <dt>Leave</dt>
                <dd>${putt.result && putt.result.outcome !== "holed" ? putt.result.leave : "-"}</dd>
                </dl>
                <m-listbox
                  data-putt-index="${index}"
                  @m-listbox-change="${this.handleChange}"
                >
                  <m-option value="+3m-long" class="tripple-bogey" ?selected=${this.getListboxValue(putt) === "+3m-long"}>+3m</m-option>
                  <m-option value="2-3m-long" class="double-bogey" ?selected=${this.getListboxValue(putt) === "2-3m-long"}>+2-3m</m-option>
                  <m-option value="1-2m-long" class="bogey" ?selected=${this.getListboxValue(putt) === "1-2m-long"}>+1-2m</m-option>
                  <m-option value="0.5-1m-long" class="par" ?selected=${this.getListboxValue(putt) === "0.5-1m-long"}>+0.5-1m</m-option>
                  <m-option value="0-0.5m-long" class="birdie" ?selected=${this.getListboxValue(putt) === "0-0.5m-long"}>+0-0.5m</m-option>
                  <m-option value="holed" class="holed" ?selected=${this.getListboxValue(putt) === "holed"}>Holed</m-option>
                  <m-option value="0-0.5m-short" class="birdie" ?selected=${this.getListboxValue(putt) === "0-0.5m-short"}>-0-0.5m</m-option>
                  <m-option value="0.5-1m-short" class="par" ?selected=${this.getListboxValue(putt) === "0.5-1m-short"}>-0.5-1m</m-option>
                  <m-option value="1-2m-short" class="bogey" ?selected=${this.getListboxValue(putt) === "1-2m-short"}>-1-2m</m-option>
                  <m-option value="2-3m-short" class="double-bogey" ?selected=${this.getListboxValue(putt) === "2-3m-short"}>-2-3m</m-option>
                  <m-option value="+3m-short" class="tripple-bogey" ?selected=${this.getListboxValue(putt) === "+3m-short"}>-3m</m-option>
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
