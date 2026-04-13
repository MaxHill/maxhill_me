import { registerAll } from "@maxhill/components/register-all";
import { MShotTypeList } from "./features/bag/components/m-shot-type-list";
import { MAddShotTypeForm } from "./features/bag/components/m-add-shot-type-form";
import { MAddClubForm } from "./features/bag/components/m-add-club-form";
import MClubList from "./features/bag/components/m-club-list";

// Register all components
registerAll();
MShotTypeList.define();
MAddShotTypeForm.define();
MAddClubForm.define();
MClubList.define();

// Render the app (temporary until we add router)
const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <div class="grid" data-cols="2" data-gap="4">
      <m-add-club-form></m-add-club-form>
      <m-club-list></m-club-list>
      <m-shot-type-list></m-shot-type-list>
      <m-add-shot-type-form></m-add-shot-type-form>
    </div>
  `;
}
