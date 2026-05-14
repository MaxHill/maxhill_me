import { BindAttribute, MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { createRef, ref } from "lit-html/directives/ref.js";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { get_DB } from "../../../../db";
import { LagPuttingGameService } from "../lag-putting-service";
import type { LagPuttingGame, PuttResult } from "../lag-putting-service";
import type { MListboxChangeEvent } from "@maxhill/components/m-listbox";


const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Record score for a specific game
 *
 * @customElement
 * @tagname m-lag-putting-scorecard-page
 */
export class MLagPuttingScorecardPage extends MElement {
  static tagName = "m-lag-putting-scorecard-page";

  @BindAttribute({ attribute: "game-key" })
  gameKey: string = "";
  currentGame: LagPuttingGame | null = null;

  lagPuttingGameService!: LagPuttingGameService;
  private unsubscribe!: () => void;
  private puttsContainerRef = createRef<HTMLDivElement>();
  private navStripRef = createRef<HTMLElement>();
  private scrollObserver: IntersectionObserver | null = null;

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
      this.setupScrollObserver();
    });

    this.render();
    this.setupScrollObserver();
  }

  disconnectedCallback() {
    this.unsubscribe();
    this.scrollObserver?.disconnect();
  }

  private setupScrollObserver() {
    this.scrollObserver?.disconnect();

    const container = this.puttsContainerRef.value;
    const nav = this.navStripRef.value;
    if (!container || !nav) return;

    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length === 0) return;

        const mostVisible = visible[0].target as HTMLElement;
        const puttId = mostVisible.id; // "putt-1", "putt-2", etc.

        const links = nav.querySelectorAll("a");
        links.forEach((link) => link.removeAttribute("data-active"));

        const matchingLink = nav.querySelector(`a[href="#${puttId}"]`);
        if (matchingLink) {
          matchingLink.setAttribute("data-active", "");
          matchingLink.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });
        }
      },
      {
        root: container,
        threshold: 0.5,
      },
    );

    const puttCards = container.querySelectorAll(".putt-card");
    puttCards.forEach((card) => this.scrollObserver!.observe(card));
  }

  handleNavClick = (e: MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLAnchorElement;
    if (target.tagName !== "A" || !target.hash) return;

    const targetId = target.hash.slice(1);
    const targetElement = this.shadowRoot?.getElementById(targetId);

    if (targetElement) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      targetElement.scrollIntoView({
        behavior: prefersReducedMotion ? "instant" : "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  };

  handleChange = async (e: MListboxChangeEvent) => {
    if (!e.detail.option || !this.currentGame) return;

    const puttIndexStr = (e.target as HTMLElement).getAttribute("data-putt-index");
    if (!puttIndexStr) {
      console.error("No putt index found on target");
      return;
    }

    const puttIndex = parseInt(puttIndexStr, 10);
    const optionValue = e.detail.option.value;

    let result: PuttResult;
    switch (optionValue) {
      case "+3m-long": {
        result = { outcome: "+3m", leave: "long" };
        break;
      }
      case "2-3m-long": {
        result = { outcome: "2-3m", leave: "long" };
        break;
      }
      case "1-2m-long": {
        result = { outcome: "1-2m", leave: "long" };
        break;
      }
      case "0.5-1m-long": {
        result = { outcome: "0.5-1m", leave: "long" };
        break;
      }
      case "0-0.5m-long": {
        result = { outcome: "0-0.5m", leave: "long" };
        break;
      }

      case "holed": {
        result = { outcome: "holed" };
        break;
      }

      case "0-0.5m-short": {
        result = { outcome: "0-0.5m", leave: "short" };
        break;
      }
      case "0.5-1m-short": {
        result = { outcome: "0.5-1m", leave: "short" };
        break;
      }
      case "1-2m-short": {
        result = { outcome: "1-2m", leave: "short" };
        break;
      }
      case "2-3m-short": {
        result = { outcome: "2-3m", leave: "short" };
        break;
      }
      case "+3m-short": {
        result = { outcome: "+3m", leave: "short" };
        break;
      }

      default: {
        console.error("Unknown option value:", optionValue);
        return; // or throw an error
      }
    }

    const currentResult = this.currentGame.putts[puttIndex].result;
    if (
      currentResult &&
      currentResult.outcome === result.outcome &&
      ("leave" in currentResult ? currentResult.leave : undefined) ===
        ("leave" in result ? result.leave : undefined)
    ) {
      return;
    }

    this.currentGame.putts[puttIndex].result = result;

    try {
      await this.lagPuttingGameService.recordPuttResult(this.currentGame._key, puttIndex, result);
    } catch (error) {
      console.error("Failed to save putt result:", error);
    }
  };

  private getListboxValue(putt: LagPuttingGame["putts"][0]): string {
    if (!putt.result) return "";
    if (putt.result.outcome === "holed") return "holed";
    return `${putt.result.outcome}-${putt.result.leave}`;
  }

  private formatRoundDate(createdAt: string | undefined): string {
    if (!createdAt) return "—";
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  private formatScore(score: number): string {
    if (score === 0) return "E";
    return score > 0 ? `+${score}` : `${score}`;
  }

  private getScoreClass(putt: LagPuttingGame["putts"][0]): string {
    if (!putt.result) return "";
    switch (putt.result.outcome) {
      case "holed": return "nav--holed";
      case "0-0.5m": return "nav--birdie";
      case "0.5-1m": return "nav--par";
      case "1-2m": return "nav--bogey";
      case "2-3m": return "nav--double-bogey";
      case "+3m": return "nav--tripple-bogey";
      default: return "";
    }
  }

  private render() {
    if (!this.currentGame) return;

    const game = this.currentGame;
    const outScore = this.lagPuttingGameService.calculateOutScore(game.putts);
    const inScore = this.lagPuttingGameService.calculateInScore(game.putts);
    const totalScore = this.lagPuttingGameService.calculateTotalScore(game.putts);

    render(
      html`
        <div class="page-header">
          <a href="/lag-putting" class="back-link">← All rounds</a>
          <span class="round-date">${this.formatRoundDate(game.createdAt)}</span>
        </div>

        <div class="hud">
          <div class="hud-cell">
            <span class="hud-label">Out</span>
            <span class="hud-value">${this.formatScore(outScore)}</span>
          </div>
          <div class="hud-cell">
            <span class="hud-label">In</span>
            <span class="hud-value">${this.formatScore(inScore)}</span>
          </div>
          <div class="hud-cell">
            <span class="hud-label">Total</span>
            <span class="hud-value hud-value--total">${this.formatScore(totalScore)}</span>
          </div>
        </div>

        <nav class="nav-strip" aria-label="Putt navigation" ${ref(this.navStripRef)} @click="${this.handleNavClick}">
          ${game.putts.map((putt, index) =>
            html`
              <a
                href="${`#putt-${index + 1}`}"
                class="${this.getScoreClass(putt)}"
                ?data-completed="${putt.result !== null}"
              >${index + 1}</a>
            `
          )}
        </nav>

        <div class="putts-container" ${ref(this.puttsContainerRef)}>
          ${game.putts.map((putt, index) => {
            const holeScore = this.lagPuttingGameService.calculateHoleScore(putt);
            return html`
              <div class="putt-card" id="${`putt-${index + 1}`}">
                <div class="putt-header">
                  <div>
                    <span class="putt-number">Putt ${index + 1} / 18</span>
                    <div class="putt-distance">${putt.distance}m</div>
                  </div>
                  ${putt.result
                    ? html`<span
                        class="putt-score"
                        ?data-negative="${holeScore < 0}"
                        ?data-positive="${holeScore > 0}"
                      >${this.formatScore(holeScore)}</span>`
                    : html`<span class="putt-score">-</span>`}
                </div>

                <m-listbox
                  data-putt-index="${index}"
                  @m-listbox-change="${this.handleChange}"
                >
                  <m-option value="+3m-long" class="tripple-bogey" ?selected="${this
                    .getListboxValue(putt) === "+3m-long"}"><span>↑ 3m</span><span class="score-name">Triple Bogey</span></m-option>
                  <m-option value="2-3m-long" class="double-bogey" ?selected="${this
                    .getListboxValue(putt) === "2-3m-long"}"><span>↑ 2-3m</span><span class="score-name">Double Bogey</span></m-option>
                  <m-option value="1-2m-long" class="bogey" ?selected="${this.getListboxValue(
                    putt,
                  ) === "1-2m-long"}"><span>↑ 1-2m</span><span class="score-name">Bogey</span></m-option>
                  <m-option value="0.5-1m-long" class="par" ?selected="${this.getListboxValue(
                    putt,
                  ) === "0.5-1m-long"}"><span>↑ 0.5-1m</span><span class="score-name">Par</span></m-option>
                  <m-option value="0-0.5m-long" class="birdie" ?selected="${this.getListboxValue(
                    putt,
                  ) === "0-0.5m-long"}"><span>↑ 0-0.5m</span><span class="score-name">Birdie</span></m-option>
                  <m-option value="holed" class="holed" ?selected="${this.getListboxValue(putt) ===
                    "holed"}"><span>Holed</span><span class="score-name">Eagle</span></m-option>
                  <m-option value="0-0.5m-short" class="birdie" ?selected="${this.getListboxValue(
                    putt,
                  ) === "0-0.5m-short"}"><span>↓ 0-0.5m</span><span class="score-name">Birdie</span></m-option>
                  <m-option value="0.5-1m-short" class="par" ?selected="${this.getListboxValue(
                    putt,
                  ) === "0.5-1m-short"}"><span>↓ 0.5-1m</span><span class="score-name">Par</span></m-option>
                  <m-option value="1-2m-short" class="bogey" ?selected="${this.getListboxValue(
                    putt,
                  ) === "1-2m-short"}"><span>↓ 1-2m</span><span class="score-name">Bogey</span></m-option>
                  <m-option value="2-3m-short" class="double-bogey" ?selected="${this
                    .getListboxValue(putt) === "2-3m-short"}"><span>↓ 2-3m</span><span class="score-name">Double Bogey</span></m-option>
                  <m-option value="+3m-short" class="tripple-bogey" ?selected="${this
                    .getListboxValue(putt) === "+3m-short"}"><span>↓ 3m</span><span class="score-name">Triple Bogey</span></m-option>
                </m-listbox>
              </div>
            `;
          })}
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

MLagPuttingScorecardPage.define();

export default MLagPuttingScorecardPage;
