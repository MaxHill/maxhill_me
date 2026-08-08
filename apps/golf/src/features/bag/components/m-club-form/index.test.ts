import { expect, fixture, html } from "@open-wc/testing";
import { MClubForm } from "./index";
import { get_DB } from "../../../../db";
import { ClubService } from "../../club-service";
import { ShotTypeService } from "../../shot-type-service";

MClubForm.define();

describe("m-club-form", () => {
  describe("regression: dirty value flag blocks navigation updates", () => {
    it("updates the name input when club-key changes after the user has typed", async () => {
      const db = await get_DB();
      const shotTypeService = new ShotTypeService(db);
      const clubService = new ClubService(db);

      const shotType = { name: "Full swing", description: "A regular full swing" };
      // addShotType creates the row with a generated key; fetch it back
      await shotTypeService.addShotType(shotType);
      const shotTypes: any[] = [];
      for await (const st of shotTypeService.table.query()) {
        shotTypes.push(st);
      }
      const seededShotType = shotTypes[0];

      const keyA = `test-club-a-${crypto.randomUUID()}`;
      const keyB = `test-club-b-${crypto.randomUUID()}`;
      await clubService.setClub(keyA, {
        name: "Club A",
        clubType: "iron",
        shotTypes: [seededShotType],
      });
      await clubService.setClub(keyB, {
        name: "Club B",
        clubType: "wedge",
        shotTypes: [seededShotType],
      });

      const form = await fixture<MClubForm>(html`
        <m-club-form club-key=${keyA}></m-club-form>
      `);

      await new Promise((r) => setTimeout(r, 200));

      const nameInput = form.shadowRoot!.querySelector(
        'm-input[name="name"]',
      ) as HTMLElement & { value: string };
      const innerNativeInput = (): HTMLInputElement =>
        nameInput.shadowRoot!.querySelector("input")!;

      expect(innerNativeInput().value).to.equal("Club A");

      const native = innerNativeInput();
      native.value = "User Edited Name";
      native.dispatchEvent(new Event("input", { bubbles: true }));
      native.dispatchEvent(new Event("blur", { bubbles: true }));
      expect(innerNativeInput().value).to.equal("User Edited Name");

      form.setAttribute("club-key", keyB);
      await new Promise((r) => setTimeout(r, 200));

      expect(innerNativeInput().value).to.equal("Club B");
    });

    it("keeps shared shot type selected when switching between clubs", async () => {
      const db = await get_DB();
      const shotTypeService = new ShotTypeService(db);
      const clubService = new ClubService(db);

      await shotTypeService.addShotType({
        name: "Stock",
        description: "Shared across clubs",
      });

      const shotTypes: any[] = [];
      for await (const st of shotTypeService.table.query()) {
        shotTypes.push(st);
      }
      const sharedShotType = shotTypes.find((s) => s.name === "Stock") ?? shotTypes[0];

      const keyA = `test-club-a-${crypto.randomUUID()}`;
      const keyB = `test-club-b-${crypto.randomUUID()}`;

      await clubService.setClub(keyA, {
        name: "Club A",
        clubType: "iron",
        shotTypes: [sharedShotType],
      });
      await clubService.setClub(keyB, {
        name: "Club B",
        clubType: "wedge",
        shotTypes: [sharedShotType],
      });

      const form = await fixture<MClubForm>(html`
        <m-club-form club-key=${keyA}></m-club-form>
      `);

      await new Promise((r) => setTimeout(r, 200));

      form.setAttribute("club-key", keyB);
      await new Promise((r) => setTimeout(r, 200));

      const shotTypesListbox = form.shadowRoot!.querySelector(
        'm-listbox[name="shotTypes"]',
      ) as any;

      expect(shotTypesListbox.selectedValues).to.deep.equal([sharedShotType._key]);
    });
  });
});
