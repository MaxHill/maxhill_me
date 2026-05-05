import { expect, html, fixture } from '@open-wc/testing';
import { MLagPuttingListingPage } from './index';

MLagPuttingListingPage.define();

describe('m-lag-putting-listing-page', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-lag-putting-listing-page>Test content</m-lag-putting-listing-page>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
