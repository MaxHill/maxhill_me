import { expect, html, fixture } from "@open-wc/testing";
import { MSearchList } from "./index";
import "../m-listbox";
import "../m-option";

MSearchList.define();

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("m-search-list", () => {
  // Suite registration groups independent tests, not runtime logic.
  // oxlint-disable-next-line max-lines-per-function
  describe("accessibility", () => {
    it("should be accessible", async () => {
      const el = await fixture(html`
        <m-search-list target="m-listbox">
          <label>
            Search
            <input type="search" />
          </label>
          <m-listbox label="Results">
            <m-option value="1">Option 1</m-option>
            <m-option value="2">Option 2</m-option>
          </m-listbox>
        </m-search-list>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
