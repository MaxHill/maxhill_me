import { expect, html, fixture } from '@open-wc/testing';
import { MAddClubForm } from './index';

MAddClubForm.define();

describe('m-add-club-form', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-add-club-form>Test content</m-add-club-form>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
