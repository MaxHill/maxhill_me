import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MTabList } from './tab-list';
import { MTab } from './tab';
import { MTabPanel } from './tab-panel';

MTabList.define();
MTab.define();
MTabPanel.define();

function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((result, str, i) => result + str + (values[i] || ''), '');
}

async function fixture<T extends HTMLElement>(template: string): Promise<T> {
  const container = document.createElement('div');
  container.innerHTML = template;
  const element = container.firstElementChild as T;
  document.body.appendChild(element);
  await new Promise(resolve => setTimeout(resolve, 0));
  return element;
}

async function waitUntil(condition: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitUntil timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m-tab-list', () => {
  describe('keyboard navigation', () => {
    it('should navigate to next tab with ArrowRight', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab panel="panel-3">Tab 3</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
          <m-tab-panel name="panel-3">Panel 3</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 3);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const secondTab = tabs[1] as MTab;

      firstTab.focus();
      expect(document.activeElement).toBe(firstTab);

      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      
      expect(document.activeElement).toBe(secondTab);
      expect(secondTab.active).toBe(true);
    });

    it('should navigate to previous tab with ArrowLeft', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab panel="panel-3">Tab 3</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
          <m-tab-panel name="panel-3">Panel 3</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 3);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const secondTab = tabs[1] as MTab;

      secondTab.focus();
      expect(document.activeElement).toBe(secondTab);

      secondTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      
      expect(document.activeElement).toBe(firstTab);
      expect(firstTab.active).toBe(true);
    });

    it('should wrap to last tab when pressing ArrowLeft on first tab', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab panel="panel-3">Tab 3</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
          <m-tab-panel name="panel-3">Panel 3</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 3);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const lastTab = tabs[2] as MTab;

      firstTab.focus();
      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      
      expect(document.activeElement).toBe(lastTab);
      expect(lastTab.active).toBe(true);
    });

    it('should wrap to first tab when pressing ArrowRight on last tab', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab panel="panel-3">Tab 3</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
          <m-tab-panel name="panel-3">Panel 3</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 3);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const lastTab = tabs[2] as MTab;

      lastTab.focus();
      lastTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      
      expect(document.activeElement).toBe(firstTab);
      expect(firstTab.active).toBe(true);
    });

    it('should navigate to first tab with Home key', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab panel="panel-3">Tab 3</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
          <m-tab-panel name="panel-3">Panel 3</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 3);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const lastTab = tabs[2] as MTab;

      lastTab.focus();
      lastTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      
      expect(document.activeElement).toBe(firstTab);
      expect(firstTab.active).toBe(true);
    });

    it('should navigate to last tab with End key', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab panel="panel-3">Tab 3</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
          <m-tab-panel name="panel-3">Panel 3</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 3);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const lastTab = tabs[2] as MTab;

      firstTab.focus();
      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      
      expect(document.activeElement).toBe(lastTab);
      expect(lastTab.active).toBe(true);
    });

    it('should navigate with vim keys (h for left, l for right)', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 2);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const secondTab = tabs[1] as MTab;

      firstTab.focus();
      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      expect(document.activeElement).toBe(secondTab);

      secondTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      expect(document.activeElement).toBe(firstTab);
    });

    it('should skip disabled tabs when navigating', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2" disabled>Tab 2</m-tab>
          <m-tab panel="panel-3">Tab 3</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
          <m-tab-panel name="panel-3">Panel 3</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 3);
      
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const thirdTab = tabs[2] as MTab;

      firstTab.focus();
      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      
      expect(document.activeElement).toBe(thirdTab);
      expect(thirdTab.active).toBe(true);
    });

    it('should prevent default on Space key', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 1);
      
      const tab = el.querySelector('m-tab') as MTab;
      tab.focus();

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      tab.dispatchEvent(event);
      
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('panel visibility', () => {
    it('should show only the active panel', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 2);
      
      const panels = el.querySelectorAll('m-tab-panel');
      const panel1 = panels[0] as MTabPanel;
      const panel2 = panels[1] as MTabPanel;

      expect(panel1.visible).toBe(true);
      expect(panel2.visible).toBe(false);
    });

    it('should switch panels when tab changes', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 2);
      
      const tabs = el.querySelectorAll('m-tab');
      const panels = el.querySelectorAll('m-tab-panel');
      const firstTab = tabs[0] as MTab;
      const panel1 = panels[0] as MTabPanel;
      const panel2 = panels[1] as MTabPanel;

      firstTab.focus();
      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      
      expect(panel1.visible).toBe(false);
      expect(panel2.visible).toBe(true);
    });
  });

  describe('ARIA attributes', () => {
    it('should have role="tablist" on m-tab-list', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
        </m-tab-list>
      `);

      expect(el.getAttribute('role')).toBe('tablist');
    });

    it('should have role="tab" on m-tab', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 1);
      const tab = el.querySelector('m-tab') as MTab;

      expect(tab.getAttribute('role')).toBe('tab');
    });

    it('should have role="tabpanel" on m-tab-panel', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 1);
      const panel = el.querySelector('m-tab-panel') as MTabPanel;

      expect(panel.getAttribute('role')).toBe('tabpanel');
    });

    it('should set aria-controls on tab to link to panel', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 1);
      const tab = el.querySelector('m-tab') as MTab;
      const panel = el.querySelector('m-tab-panel') as MTabPanel;

      await waitUntil(() => tab.getAttribute('aria-controls') !== null);

      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    });

    it('should set aria-labelledby on panel to link to tab', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 1);
      const tab = el.querySelector('m-tab') as MTab;
      const panel = el.querySelector('m-tab-panel') as MTabPanel;

      await waitUntil(() => panel.getAttribute('aria-labelledby') !== null);

      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    });

    it('should set aria-selected="true" on active tab', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 2);
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const secondTab = tabs[1] as MTab;

      await waitUntil(() => firstTab.getAttribute('aria-selected') !== null);

      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      
      await waitUntil(() => secondTab.getAttribute('aria-selected') === 'true');

      expect(firstTab.getAttribute('aria-selected')).toBe('false');
      expect(secondTab.getAttribute('aria-selected')).toBe('true');
    });

    it('should set tabindex="0" on active tab and tabindex="-1" on inactive tabs', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2">Tab 2</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 2);
      const tabs = el.querySelectorAll('m-tab');
      const firstTab = tabs[0] as MTab;
      const secondTab = tabs[1] as MTab;

      await waitUntil(() => firstTab.getAttribute('tabindex') !== null);

      firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      await waitUntil(() => secondTab.getAttribute('tabindex') === '0');

      expect(firstTab.getAttribute('tabindex')).toBe('-1');
      expect(secondTab.getAttribute('tabindex')).toBe('0');
    });

    it('should set aria-disabled="true" on disabled tab', async () => {
      const el = await fixture<MTabList>(html`
        <m-tab-list>
          <m-tab panel="panel-1">Tab 1</m-tab>
          <m-tab panel="panel-2" disabled>Tab 2</m-tab>
          <m-tab-panel name="panel-1">Panel 1</m-tab-panel>
          <m-tab-panel name="panel-2">Panel 2</m-tab-panel>
        </m-tab-list>
      `);

      await waitUntil(() => el.querySelectorAll('m-tab').length === 2);
      const tabs = el.querySelectorAll('m-tab');
      const secondTab = tabs[1] as MTab;

      await waitUntil(() => secondTab.getAttribute('aria-disabled') !== null);

      expect(secondTab.getAttribute('aria-disabled')).toBe('true');
      expect(secondTab.disabled).toBe(true);
    });
  });
});
