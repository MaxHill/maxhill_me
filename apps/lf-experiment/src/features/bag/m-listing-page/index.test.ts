import { expect, html, fixture } from '@open-wc/testing';
import { MListingPage } from './index';

MListingPage.define();

describe('m-listing-page', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-listing-page>Test content</m-listing-page>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
