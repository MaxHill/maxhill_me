import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";
import { globalStyleSheet } from "../../../styles/global-styles";
import { html, render } from "lit-html";
import "@maxhill/components/m-fit-text";
import { authClient } from "../../auth/auth-client";
import { UserSettingsService } from "../../user-settings/user-settings-service";
import { get_DB } from "../../../db";
import { renderSyncBanner } from "../../user-settings/sync-banner";

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

  async connectedCallback() {
    const db = await get_DB();
    this.settings = new UserSettingsService(db);

    this.unsubscribe = authClient.onAuthChange((authenticated) => {
      if (authenticated) {
        this.showBanner = false;
      } else {
        this.showBanner = true;
        this.settings!.remove("banner_dismissed");
      }
      this.render();
    });

    const token = await authClient.getToken();
    if (!token) {
      const dismissed = await this.settings.get<boolean>("banner_dismissed");
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
          <m-fit-text font-display class="title">Max Hill</m-fit-text>
          <p class="intro">
            Practice tools for the range and the green.
          </p>
        </div>
      `,
      this.shadowRoot!,
    );
  }
}

MLandingPage.define();

export default MLandingPage;
