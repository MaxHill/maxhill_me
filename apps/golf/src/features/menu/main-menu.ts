/**
 * Persistent main menu behavior: keeps the theme button label in sync,
 * and wires up the theme switcher radio forms in the popover menus.
 * Also renders auth status (sign in / sign out) into menu placeholders.
 *
 * Shares theme behavior with the site app.
 */

import { authClient } from "../auth/auth-client";
import { installThemeSwitchers } from "@maxhill/web-component-utils/theme-switcher";

let authRenderVersion = 0;

function renderAuthStatus() {
  const containers = document.querySelectorAll<HTMLElement>(".auth-status");
  const renderVersion = ++authRenderVersion;
  void authClient.getToken().then((token) => {
    if (renderVersion !== authRenderVersion) {
      return;
    }

    for (const container of containers) {
      container.replaceChildren();
      if (token) {
        container.classList.add("auth-account");

        const email = document.createElement("span");
        email.className = "auth-email";
        email.hidden = true;
        container.append(email);

        const signOutButton = document.createElement("button");
        signOutButton.className = "button";
        signOutButton.dataset.variant = "secondary";
        signOutButton.dataset.size = "compact";
        signOutButton.textContent = "Sign out";
        signOutButton.addEventListener("click", () => {
          void authClient.logout();
        });
        container.append(signOutButton);

        void authClient.getUserEmail(token).then((address) => {
          if (renderVersion !== authRenderVersion || !address) {
            return;
          }
          email.textContent = address;
          email.hidden = false;
        });
      } else {
        container.classList.remove("auth-account");
        const signInButton = document.createElement("button");
        signInButton.className = "button";
        signInButton.dataset.size = "compact";
        signInButton.textContent = "Sign in";
        signInButton.addEventListener("click", () => {
          void authClient.authorize();
        });
        container.append(signInButton);
      }
    }
  });
}

function init() {
  installThemeSwitchers();
  renderAuthStatus();
  authClient.onAuthChange(() => renderAuthStatus());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
