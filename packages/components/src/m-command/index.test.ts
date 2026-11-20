import { expect, html, fixture } from "@open-wc/testing";
import { MCommand } from "./index";

MCommand.define();

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("m-command", () => {
  // Suite registration groups independent tests, not runtime logic.
  // oxlint-disable-next-line max-lines-per-function
  describe("accessibility", () => {
    it("should be accessible", async () => {
      const el = await fixture<MCommand>(html`
        <m-command command="focus" commandfor="#target"></m-command>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
