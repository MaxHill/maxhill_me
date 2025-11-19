import { expect, html, fixture } from '@open-wc/testing';
import MFitText from './index';

MFitText.define();

describe('m-fit-text', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-fit-text>Text that will scale</m-fit-text>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
