import { expect, html, fixture } from "@open-wc/testing";
import { MOption } from "./index";
import { MListbox } from "../m-listbox";

MOption.define();
MListbox.define();

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("m-option", () => {
  // Suite registration groups independent tests, not runtime logic.
  // oxlint-disable-next-line max-lines-per-function
  describe("accessibility", () => {
    it("should be accessible within m-listbox", async () => {
      const el = await fixture(html`
        <m-listbox label="Test options">
          <m-option value="1">Option 1</m-option>
          <m-option value="2">Option 2</m-option>
        </m-listbox>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
