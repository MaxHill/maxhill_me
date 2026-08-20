// Import global styles first to ensure document.adoptedStyleSheets is set up
import "./styles/global-styles.ts";

// Register shared web components (m-popover-menu, m-fit-text, etc.)
import "@maxhill/components/register-all";

import "./features/router/router.ts";
import "./features/menu/main-menu.ts";
import "@maxhill/components/m-empty-state";
import { MShotTypeList } from "./features/bag/components/m-shot-type-list";
import { MAddShotTypeForm } from "./features/bag/components/m-add-shot-type-form";
import { MShotTypeForm } from "./features/bag/components/m-shot-type-form";
import { MClubForm } from "./features/bag/components/m-club-form";
import MClubList from "./features/bag/components/m-club-list";
import MListingPage from "./features/bag/m-listing-page/index.ts";
import { MBagListPage } from "./features/bag/pages/m-bag-list-page";
import { MBagAddPage } from "./features/bag/pages/m-bag-add-page";
import { MBagEditPage } from "./features/bag/pages/m-bag-edit-page";
import { MLagPuttingListingPage } from "./features/pratice-games/lag-putting/m-lag-putting-listing-page";
import { MCreateLagPuttingGameForm } from "./features/pratice-games/lag-putting/m-create-lag-putting-game-form"


// Register app components
MShotTypeList.define();
MAddShotTypeForm.define();
MShotTypeForm.define();
MClubForm.define();
MClubList.define();
MListingPage.define();
MCreateLagPuttingGameForm.define();

// Register new page components
MBagListPage.define();
MBagAddPage.define();
MBagEditPage.define();
MLagPuttingListingPage.define();

// Register service worker only in production builds. In dev, Vite serves modules
// directly and the service worker file isn't emitted.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration.scope);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    console.log("Service Worker updated, reloading page...");
    window.location.reload();
  });
}
