import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html, fixture, waitUntil } from '../utils/test-helpers';
import { MCommandPalette } from './index';

MCommandPalette.define();

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m-command-palette', () => {
  describe('basic rendering', () => {
    it('should render', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette example="test">
          Test content
        </m-command-palette>
      `);

      expect(el).toBeInstanceOf(MCommandPalette);
      expect(el.example).toBe('test');
    });

    it('should have default example', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette>Test</m-command-palette>
      `);

      expect(el.example).toBe('');
    });
  });

  describe('attributes', () => {
    it('should reflect example attribute', async () => {
      const el = await fixture<MCommandPalette>(html`
        <m-command-palette example="initial">Test</m-command-palette>
      `);

      expect(el.example).toBe('initial');
      expect(el.getAttribute('example')).toBe('initial');

      el.example = 'updated';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('example')).toBe('updated');
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

      expect(eventFired).toBe(true);
      expect(eventDetail.example).toBe('changed');
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

      expect(changeEventFired).toBe(true);
    });
  });
});
