import { expect, html, fixture } from '@open-wc/testing';
import { MClubList } from './index';

MClubList.define();

describe('m-club-list', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-club-list>Test content</m-club-list>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
