import { expect, html, fixture } from '@open-wc/testing';
import MCard from './index';

MCard.define();

describe('m-card', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-card>
          <h2 slot="title">Card Title</h2>
          <p>Card content goes here.</p>
          <div slot="footer">Footer content</div>
        </m-card>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
