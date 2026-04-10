import { registerAll } from "@maxhill/components/register-all";
import { MShotTypeList } from "./features/bag/components/m-shot-type-list";
import { MAddShotTypeForm } from "./features/bag/components/m-add-shot-type-form";
import { MAddClubForm } from "./features/bag/components/m-add-club-form";
import MClubList from "./features/bag/components/m-club-list";
registerAll();

MShotTypeList.define();
MAddShotTypeForm.define();
MAddClubForm.define();
MClubList.define();
