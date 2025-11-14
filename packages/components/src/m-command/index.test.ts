import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html, fixture, waitUntil } from '../utils/test-helpers';
import { MCommand } from './index';

MCommand.define();

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe.skip('m-command', () => {
  describe('basic rendering', () => {
    it('should render', async () => {
      const el = await fixture<MCommand>(html`
        <m-command example="test">
          Test content
        </m-command>
      `);

      expect(el).toBeInstanceOf(MCommand);
      expect(el.example).toBe('test');
    });

    it('should have default example', async () => {
      const el = await fixture<MCommand>(html`
        <m-command>Test</m-command>
      `);

      expect(el.example).toBe('');
    });
  });

  describe('attributes', () => {
    it('should reflect example attribute', async () => {
      const el = await fixture<MCommand>(html`
        <m-command example="initial">Test</m-command>
      `);

      expect(el.example).toBe('initial');
      expect(el.getAttribute('example')).toBe('initial');

      el.example = 'updated';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('example')).toBe('updated');
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

      expect(eventFired).toBe(true);
      expect(eventDetail.example).toBe('changed');
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

      expect(changeEventFired).toBe(true);
    });
  });
});
