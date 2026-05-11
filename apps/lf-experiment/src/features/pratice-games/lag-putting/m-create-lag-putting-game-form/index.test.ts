import { expect, html, fixture } from '@open-wc/testing';
import { MCreateLagPuttingGameForm } from './index';

MCreateLagPuttingGameForm.define();

describe('m-create-lag-putting-game-form', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-create-lag-putting-game-form>Test content</m-create-lag-putting-game-form>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
