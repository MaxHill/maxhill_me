import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MTabList } from './index';
import { MTab } from '../m-tab';
import { MTabPanel } from '../m-tab-panel';

MTabList.define();
MTab.define();
MTabPanel.define();

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m-tab-list', () => {
  describe('accessibility', () => {
    it('passes automated a11y tests', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list label="Settings" tab="general">
          <m-tab name="general">General</m-tab>
          <m-tab name="privacy">Privacy</m-tab>
          <m-tab-panel name="general">General settings content</m-tab-panel>
          <m-tab-panel name="privacy">Privacy settings content</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 2);
      await expect(el).to.be.accessible();
    });
  });
});
