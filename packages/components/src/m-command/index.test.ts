import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MCommand } from './index';

MCommand.define();

describe('m-command', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture<MCommand>(html`
        <m-command command="focus" commandfor="#target"></m-command>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
