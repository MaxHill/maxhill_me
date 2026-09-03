import { MElement } from "@maxhill/web-component-utils";
import styles from "./index.css?inline";

/**
 * Displays short status messages from application events.
 *
 * @customElement
 * @tagname m-notifications
 */
export class MNotifications extends MElement {
  static tagName = "m-notifications";

  private messageElement!: HTMLDivElement;
  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    this.shadowRoot!.append(style);

    this.messageElement = document.createElement("div");
    this.messageElement.className = "message";
    this.messageElement.setAttribute("role", "status");
    this.messageElement.setAttribute("aria-live", "polite");
    this.messageElement.hidden = true;
    this.shadowRoot!.append(this.messageElement);
  }

  connectedCallback() {
    document.addEventListener("club-saved", this.handleClubSaved);
    document.addEventListener("shot-type-created", this.handleShotTypeCreated);
  }

  disconnectedCallback() {
    document.removeEventListener("club-saved", this.handleClubSaved);
    document.removeEventListener("shot-type-created", this.handleShotTypeCreated);
    if (this.hideTimer) clearTimeout(this.hideTimer);
  }

  private handleClubSaved = (event: Event) => {
    const { club, mode } = (event as CustomEvent).detail ?? {};
    if (!club?.name || !club?.clubType || (mode !== "add" && mode !== "edit")) return;

    this.showMessage(`Club ${club.name} ${club.clubType} ${mode === "add" ? "added" : "saved"}`);
  };

  private handleShotTypeCreated = (event: Event) => {
    const { name } = (event as CustomEvent).detail ?? {};
    if (!name) return;

    this.showMessage(`Shot type ${name} added`);
  };

  private showMessage(message: string) {
    this.messageElement.textContent = message;
    this.messageElement.hidden = false;
    this.messageElement.classList.remove("enter");
    // Force a reflow so consecutive events restart the entrance animation.
    void this.messageElement.offsetWidth;
    this.messageElement.classList.add("enter");

    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.messageElement.hidden = true;
    }, 4000);
  }
}

MNotifications.define();

export default MNotifications;
