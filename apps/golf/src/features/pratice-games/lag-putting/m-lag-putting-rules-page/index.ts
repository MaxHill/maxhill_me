import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { html, render } from "lit-html";
import { globalStyleSheet } from "../../../../styles/global-styles";
import { LagPuttingGameMetadata } from "../lag-putting-service";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Rules and information page for the lag putting test
 *
 * @customElement
 * @tagname m-lag-putting-rules-page
 */
export class MLagPuttingRulesPage extends MElement {
  static tagName = "m-lag-putting-rules-page";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    render(
      html`
        <div class="page-header">
          <a href="/lag-putting" class="back-link">&larr; Tillbaka</a>
        </div>

        <div class="rules-content">
          <h1>Lagputt-test</h1>
          <p class="source">
            Källa:
            <a href="${LagPuttingGameMetadata.source}" target="_blank" rel="noopener">
              Landslaget / tournytt.se
            </a>
          </p>

          <section>
            <h2>Syfte</h2>
            <p>${LagPuttingGameMetadata.purpose}</p>
          </section>

          <section>
            <h2>Beskrivning</h2>
            <p>${LagPuttingGameMetadata.description}</p>
          </section>

          <section>
            <h2>Instruktioner</h2>
            <p>${LagPuttingGameMetadata.instructions}</p>
          </section>

          <section>
            <h2>Utrustning</h2>
            <p>${LagPuttingGameMetadata.equipment}</p>
          </section>

          <section>
            <h2>Avstånd</h2>
            <p>18 puttar i följande ordning (upprepas 3 gånger):</p>
            <div class="distance-sequence">
              <span>22m</span>
              <span>12m</span>
              <span>18m</span>
              <span>10m</span>
              <span>14m</span>
              <span>8m</span>
            </div>
          </section>

          <section>
            <h2>Poängsystem</h2>
            <table>
              <thead>
                <tr>
                  <th>Resultat</th>
                  <th>Poäng</th>
                </tr>
              </thead>
              <tbody>
                <tr data-score="eagle"><td>Hålad</td><td>-2</td></tr>
                <tr data-score="birdie"><td>0 - 0.5m</td><td>-1</td></tr>
                <tr data-score="par"><td>0.5 - 1m</td><td>0</td></tr>
                <tr data-score="bogey"><td>1 - 2m</td><td>+1</td></tr>
                <tr data-score="double"><td>2 - 3m</td><td>+2</td></tr>
                <tr data-score="triple"><td>+3m</td><td>+3</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Jämförelsetal</h2>

            <h3>Herrar / Pojkar</h3>
            <table>
              <thead>
                <tr><th>Nivå</th><th>Snitt</th></tr>
              </thead>
              <tbody>
                <tr><td>World Class</td><td>-5.5</td></tr>
                <tr><td>European Tour</td><td>-2.9</td></tr>
                <tr><td>Challenge Tour</td><td>-1.5</td></tr>
                <tr><td>HCP +2</td><td>+0.2</td></tr>
                <tr><td>HCP Scratch</td><td>+2.0</td></tr>
                <tr><td>HCP 5</td><td>+6.3</td></tr>
                <tr><td>HCP 10</td><td>+10.7</td></tr>
              </tbody>
            </table>

            <h3>Damer / Flickor</h3>
            <table>
              <thead>
                <tr><th>Nivå</th><th>Snitt</th></tr>
              </thead>
              <tbody>
                <tr><td>World Class</td><td>+1.0</td></tr>
                <tr><td>LET</td><td>+3.6</td></tr>
                <tr><td>HCP +2</td><td>+5.8</td></tr>
                <tr><td>HCP Scratch</td><td>+7.6</td></tr>
                <tr><td>HCP 5</td><td>+11.9</td></tr>
                <tr><td>HCP 10</td><td>+16.3</td></tr>
              </tbody>
            </table>

            <p class="note">Maxscore: -36</p>
            <p class="note">Rekord herrar: -15 (Johan Edfors, 2011-12-01)</p>
            <p class="note">Rekord damer: -6 (Christine Hallström, 2011-07-25)</p>
            <p class="note">Snittscore för test gjort på bana är 4.5 poäng sämre.</p>
          </section>
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

MLagPuttingRulesPage.define();

export default MLagPuttingRulesPage;
