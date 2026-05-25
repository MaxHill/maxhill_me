import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MCommandPalette } from './index';
import '../m-search-list';
import '../m-listbox';
import '../m-option';

MCommandPalette.define();

describe('m-command-palette', () => {
  describe('accessibility', () => {
    it('should be accessible', async () => {
      // m-command-palette renders options from m-command elements in the document
      const command = document.createElement('m-command');
      command.id = 'command_test';
      command.dataset.label = 'Test Command';
      document.body.appendChild(command);

      const el = await fixture<MCommandPalette>(html`
        <m-command-palette></m-command-palette>
      `);

      await expect(el).to.be.accessible();
      command.remove();
    });
  });
});
