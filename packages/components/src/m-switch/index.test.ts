import { expect, html, fixture } from '@open-wc/testing';
import { MSwitch } from './index';

MSwitch.define();

describe('m-switch', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-switch>Test content</m-switch>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
