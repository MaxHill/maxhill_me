import { expect, html, fixture } from "@open-wc/testing";
import MCopyButton from "./index";

MCopyButton.define();

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("m-copy-button", () => {
  // Suite registration groups independent tests, not runtime logic.
  // oxlint-disable-next-line max-lines-per-function
  describe("accessibility", () => {
    it("should be accessible", async () => {
      const el = await fixture(html`
        <m-copy-button value="Text to copy">Copy</m-copy-button>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
