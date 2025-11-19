import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MCommandPalette } from './index';
import '../m-search-list';
import '../m-listbox';
import '../m-option';

MCommandPalette.define();

describe('m-command-palette', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette></m-command-palette>
      `);

      await expect(el).to.be.accessible();
    });
  });
});
