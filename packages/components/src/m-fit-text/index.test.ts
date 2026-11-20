import { expect, html, fixture } from "@open-wc/testing";
import MFitText from "./index";

MFitText.define();

// Suite registration groups independent tests, not runtime logic.
// oxlint-disable-next-line max-lines-per-function
describe("m-fit-text", () => {
  // Suite registration groups independent tests, not runtime logic.
  // oxlint-disable-next-line max-lines-per-function
  describe("accessibility", () => {
    it("should be accessible", async () => {
      const el = await fixture(html`
        <m-fit-text>Text that will scale</m-fit-text>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
