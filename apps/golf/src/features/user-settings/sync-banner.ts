/**
 * Renders the "Sign in to sync" banner.
 * Pure synchronous template function — no state, no side effects.
 */

import { html, nothing } from "lit-html";

export interface SyncBannerCallbacks {
  visible: boolean;
  onSignIn: () => void;
  onDismiss: () => void;
}

export function renderSyncBanner({ visible, onSignIn, onDismiss }: SyncBannerCallbacks) {
  if (!visible) return nothing;

  return html`
    <div class="box">
      <p>Sign in to sync your data across devices.</p>
      <div class="stack" data-direction="row" data-gap="1">
        <button class="button" @click=${onSignIn}>Sign in</button>
        <button class="button" data-variant="secondary" @click=${onDismiss}>Dismiss</button>
      </div>
    </div>
  `;
}
