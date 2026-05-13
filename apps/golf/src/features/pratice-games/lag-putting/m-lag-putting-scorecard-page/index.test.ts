import { expect, html, fixture } from '@open-wc/testing';
import { MLagPuttingScorecardPage } from './index';

MLagPuttingScorecardPage.define();

describe('m-lag-putting-scorecard-page', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-lag-putting-scorecard-page>Test content</m-lag-putting-scorecard-page>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
