import { expect } from "@esm-bundle/chai";

import { html, fixture, waitUntil } from '@open-wc/testing';
import { MCommand } from './index';

MCommand.define();

describe.skip('m-command', () => {
  describe('basic rendering', () => {
    it('should render', async () => {
      const el = await fixture<MCommand>(html`
        <m-command example="test">
          Test content
        </m-command>
      `);

      expect(el).to.be.instanceOf(MCommand);
      expect(el.example).to.equal('test');
    });

    it('should have default example', async () => {
      const el = await fixture<MCommand>(html`
        <m-command>Test</m-command>
      `);

      expect(el.example).to.equal('');
    });
  });

  describe('attributes', () => {
    it('should reflect example attribute', async () => {
      const el = await fixture<MCommand>(html`
        <m-command example="initial">Test</m-command>
      `);

      expect(el.example).to.equal('initial');
      expect(el.getAttribute('example')).to.equal('initial');

      el.example = 'updated';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('example')).to.equal('updated');
    });
  });

  describe('events', () => {
    it('should dispatch m-command-change event', async () => {
      const el = await fixture<MCommand>(html`
        <m-command example="initial">Test</m-command>
      `);

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-command-change', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      el.example = 'changed';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(eventFired).to.equal(true);
      expect(eventDetail.example).to.equal('changed');
    });

    it('should dispatch standard change event', async () => {
      const el = await fixture<MCommand>(html`
        <m-command example="initial">Test</m-command>
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
