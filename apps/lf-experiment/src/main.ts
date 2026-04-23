// Import global styles first to ensure document.adoptedStyleSheets is set up
import "./styles/global-styles.ts";

import "./features/router/router.ts";
import { MShotTypeList } from "./features/bag/components/m-shot-type-list";
import { MAddShotTypeForm } from "./features/bag/components/m-add-shot-type-form";
import { MClubForm } from "./features/bag/components/m-club-form";
import MClubList from "./features/bag/components/m-club-list";
import MListingPage from "./features/bag/m-listing-page/index.ts";
import { MBagListPage } from "./features/bag/pages/m-bag-list-page";
import { MBagAddPage } from "./features/bag/pages/m-bag-add-page";
import { MBagEditPage } from "./features/bag/pages/m-bag-edit-page";

// Register app components
MShotTypeList.define();
MAddShotTypeForm.define();
MClubForm.define();
MClubList.define();
MListingPage.define();

// Register new page components
MBagListPage.define();
MBagAddPage.define();
MBagEditPage.define();
