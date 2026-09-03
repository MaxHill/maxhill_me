import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../styles/global-styles";
import { html, render } from "lit-html";
import "@maxhill/components/m-fit-text";
import { authClient } from "../../auth/auth-client";
import { UserSettingsService } from "../../user-settings/user-settings-service";
import { get_DB } from "../../../db";
import { renderSyncBanner } from "../../user-settings/sync-banner";

import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import clubsSvg from "../../../dither/out/clubs.svg?raw";
import ballSvg from "../../../dither/out//golfball-big.svg?raw";


const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Landing page - links to the app's main features.
 * Route: /
 *
 * @customElement
 * @tagname m-landing-page
 *
 * @slot - Default slot for page content
 */
export class MLandingPage extends MElement {
    static tagName = "m-landing-page";

    private showBanner = false;
    private unsubscribe?: () => void;
    private settings?: UserSettingsService;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
    }

    connectedCallback() {
        this.render();
        void this.initialize();
    }

    private async initialize() {
        const db = await get_DB();
        if (!this.isConnected) return;

        this.settings = new UserSettingsService(db);

        this.unsubscribe = authClient.onAuthChange((authenticated) => {
            if (authenticated) {
                this.showBanner = false;
            } else {
                this.showBanner = true;
                void this.settings!.remove("banner_dismissed");
            }
            this.render();
        });

        const token = await authClient.getToken();
        if (!this.isConnected) return;

        if (!token) {
            const dismissed = await this.settings.get<boolean>("banner_dismissed");
            if (!this.isConnected) return;
            this.showBanner = !dismissed;
        }

        this.render();
    }

    disconnectedCallback() {
        this.unsubscribe?.();
    }

    private dismiss() {
        this.showBanner = false;
        this.settings!.set("banner_dismissed", true);
        this.render();
    }

    private render() {
        render(
            html`
        <div class="page-container">
          ${renderSyncBanner({
                visible: this.showBanner,
                onSignIn: () => authClient.authorize(),
                onDismiss: () => this.dismiss(),
            })}

          <section class="hero">
            <p class="eyebrow">Golf practice workspace</p>
            <m-fit-text font-display class="title">Train with intent</m-fit-text>
            <p class="intro">
              Start a round, tune your bag, and keep your sessions moving forward.
            </p>
          </section>

          <section class="actions" aria-label="Next actions">
            <a class="action-card box" href="/lag-putting">
              <div class="action-body">
                <div class="art">
                    ${unsafeSVG(ballSvg)}
                </div>
                <p class="action-kicker">Practice game</p>
                <h2>Lag Putting</h2>
                <p>Start a round, score each putt, and track consistency over 18 holes.</p>
              </div>
              <span class="action-link">Open game</span>
            </a>

            <a class="action-card box" href="/bag">
              <div class="action-body">
                <div class="art">
                    ${unsafeSVG(clubsSvg)}
                </div>
                <p class="action-kicker">Equipment</p>
                <h2>Manage bag</h2>
                <p>Update clubs and shot types so your practice data stays useful.</p>
              </div>
              <span class="action-link">View bag</span>
            </a>
          </section>


        </div>
      `,
            this.shadowRoot!,
        );
    }
}

MLandingPage.define();

export default MLandingPage;
