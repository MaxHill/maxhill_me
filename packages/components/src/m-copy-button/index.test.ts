import { expect, html, fixture } from '@open-wc/testing';
import MCopyButton from './index';

MCopyButton.define();

describe('m-copy-button', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-copy-button value="Text to copy">Copy</m-copy-button>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
