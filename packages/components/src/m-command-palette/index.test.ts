import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MCommandPalette } from './index';

MCommandPalette.define();

describe.skip('m-command-palette', () => {
  describe('basic rendering', () => {
    it('should render', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette example="test">
          Test content
        </m-command-palette>
      `);

      expect(el).to.be.instanceOf(MCommandPalette);
      expect(el.example).to.equal('test');
    });

    it('should have default example', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette>Test</m-command-palette>
      `);

      expect(el.example).to.equal('');
    });
  });

  describe('attributes', () => {
    it('should reflect example attribute', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette example="initial">Test</m-command-palette>
      `);

      expect(el.example).to.equal('initial');
      expect(el.getAttribute('example')).to.equal('initial');

      el.example = 'updated';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('example')).to.equal('updated');
    });
  });

  describe('events', () => {
    it('should dispatch m-command-palette-change event', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette example="initial">Test</m-command-palette>
      `);

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-command-palette-change', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      el.example = 'changed';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(eventFired).to.equal(true);
      expect(eventDetail.example).to.equal('changed');
    });

    it('should dispatch standard change event', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette example="initial">Test</m-command-palette>
      `);

      let changeEventFired = false;

      el.addEventListener('change', () => {
        changeEventFired = true;
      });

      el.example = 'changed';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(changeEventFired).to.equal(true);
    });
  });
});
