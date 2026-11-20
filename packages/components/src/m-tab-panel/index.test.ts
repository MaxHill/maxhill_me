import { expect, html, fixture } from "@open-wc/testing";
import { MTabPanel } from "./index";
import { MTabList } from "../m-tab-list";
import { MTab } from "../m-tab";

MTabPanel.define();
MTabList.define();
MTab.define();

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("m-tab-panel", () => {
  // Suite registration groups independent tests, not runtime logic.
  // oxlint-disable-next-line max-lines-per-function
  describe("accessibility", () => {
    it("should be accessible within m-tab-list", async () => {
      const el = await fixture(html`
        <m-tab-list label="Test tabs">
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab-panel id="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel id="panel-2">Panel 2</m-tab-panel>
        </m-tab-list>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
