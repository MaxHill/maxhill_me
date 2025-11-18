import { expect } from "@esm-bundle/chai";
import { html, fixture, waitUntil } from '@open-wc/testing';
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
});
