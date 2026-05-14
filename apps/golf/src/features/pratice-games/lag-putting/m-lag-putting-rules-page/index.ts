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
          <a href="/lag-putting" class="back-link">&larr; Back</a>
        </div>

        <div class="rules-content">
          <h1>Lag Putting Test</h1>
          <p class="source">
            Source:
            <a href="${LagPuttingGameMetadata.source}" target="_blank" rel="noopener">
              Landslaget / tournytt.se
            </a>
          </p>

          <section>
            <h2>Purpose</h2>
            <p>Score test for lag putting. A competition-style test of distance control from 8-22 meters with varying putts throughout.</p>
          </section>

          <section>
            <h2>Instructions</h2>
            <p>18 putts from 8 to 22 meters. One putt per position. Each putt should be unique and randomly chosen. Measure from the center of the hole to the center of the ball. If performed during warm-up or practice play, one putt per hole.</p>
          </section>

          <section>
            <h2>Equipment</h2>
            <p>Putter, ball, tape measure, tape on putter at 50 cm.</p>
          </section>

          <section>
            <h2>Distances</h2>
            <p>18 putts in the following sequence (repeated 3 times):</p>
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
            <h2>Scoring</h2>
            <table>
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                <tr data-score="eagle"><td>Holed</td><td>-2</td></tr>
                <tr data-score="birdie"><td>0 - 0.5m</td><td>-1</td></tr>
                <tr data-score="par"><td>0.5 - 1m</td><td>0</td></tr>
                <tr data-score="bogey"><td>1 - 2m</td><td>+1</td></tr>
                <tr data-score="double"><td>2 - 3m</td><td>+2</td></tr>
                <tr data-score="triple"><td>+3m</td><td>+3</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>Benchmarks</h2>

            <h3>Men</h3>
            <table>
              <thead>
                <tr><th>Level</th><th>Average</th></tr>
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

            <h3>Women</h3>
            <table>
              <thead>
                <tr><th>Level</th><th>Average</th></tr>
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

            <p class="note">Max score: -36</p>
            <p class="note">Men's record: -15 (Johan Edfors, 2011-12-01)</p>
            <p class="note">Women's record: -6 (Christine Hallström, 2011-07-25)</p>
            <p class="note">Average score for tests on-course is 4.5 points worse.</p>
          </section>
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

MLagPuttingRulesPage.define();

export default MLagPuttingRulesPage;
