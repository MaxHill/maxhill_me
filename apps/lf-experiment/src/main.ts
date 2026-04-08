import { registerAll } from "@maxhill/components/register-all";
import { MShotTypeList } from "./features/bag/components/shot-type-list";
import { MAddShotTypeForm } from "./features/bag/components/add-shot-type-form";
import { MAddClubForm } from "./features/bag/components/m-add-club-form";
registerAll();

MShotTypeList.define();
MAddShotTypeForm.define();
MAddClubForm.define();
