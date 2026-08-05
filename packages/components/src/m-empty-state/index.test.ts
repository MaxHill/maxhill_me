import { expect, html, fixture } from '@open-wc/testing';
import { MEmptyState } from './index';

MEmptyState.define();

describe('m-empty-state', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-empty-state title="$ empty --list" message="No items configured yet.">
          <a slot="action" href="/">Add item</a>
        </m-empty-state>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
