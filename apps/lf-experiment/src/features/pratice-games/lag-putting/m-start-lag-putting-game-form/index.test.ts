import { expect, html, fixture } from '@open-wc/testing';
import { MStartLagPuttingGameForm } from './index';

MStartLagPuttingGameForm.define();

describe('m-start-lag-putting-game-form', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture(html`
        <m-start-lag-putting-game-form>Test content</m-start-lag-putting-game-form>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
