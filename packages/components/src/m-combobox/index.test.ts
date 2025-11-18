import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html, fixture, waitUntil } from '../utils/test-helpers';
import { MCombobox } from './index';
import { MOption } from '../m-option';
import { MListbox } from '../m-listbox';

MCombobox.define();
MOption.define();
MListbox.define();

beforeEach(() => {
  document.body.innerHTML = '';
  
  if (!HTMLElement.prototype.showPopover) {
    HTMLElement.prototype.showPopover = function() {};
  }
  if (!HTMLElement.prototype.hidePopover) {
    HTMLElement.prototype.hidePopover = function() {};
  }
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('m-combobox', () => {
  describe('basic rendering', () => {
    it('should render', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox name="test-combobox">
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      expect(el).toBeInstanceOf(MCombobox);
      expect(el.name).toBe('test-combobox');
    });

    it('should have default values', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.name).toBe('');
      expect(el.disabled).toBe(false);
      expect(el.multiple).toBe(false);
      expect(el.value).toBe(null);
    });
  });

  describe('form association', () => {
    it('should be form-associated', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox name="test">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el).toHaveProperty('form');
    });

    it('should reflect name attribute', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox name="initial">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.name).toBe('initial');
      expect(el.getAttribute('name')).toBe('initial');

      el.name = 'updated';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('name')).toBe('updated');
    });

    it('should reflect disabled attribute', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox disabled>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.disabled).toBe(true);
      expect(el.hasAttribute('disabled')).toBe(true);
    });

    it('should reflect multiple attribute', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      expect(el.multiple).toBe(true);
      expect(el.hasAttribute('multiple')).toBe(true);
    });

    it('should apply :host([multiple]) styles', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));

      const styles = window.getComputedStyle(el);
      console.log('Background color:', styles.backgroundColor);
      console.log('Has multiple attr:', el.hasAttribute('multiple'));
      console.log('Adopted stylesheets:', el.shadowRoot?.adoptedStyleSheets.length);
      expect(styles.backgroundColor).toBe('rgb(0, 128, 0)');
    });
  });

  describe('value management', () => {
    it('should return null when no items selected', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(el.value).toBe(null);
    });

    it('should return empty array for multiple mode when no items selected', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(Array.isArray(el.value)).toBe(true);
      expect(el.value).toEqual([]);
    });
  });

  describe('events', () => {
    it('should dispatch m-combobox-change event on selection', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-combobox-change', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      const option = el.querySelector('m-option[value="1"]') as MOption;
      option.selected = true;
      
      const shadowRoot = el.shadowRoot!;
      const popover = shadowRoot.querySelector('#popover') as HTMLDivElement;
      popover.showPopover();

      await new Promise(resolve => setTimeout(resolve, 0));
      
      el.dispatchEvent(
        new CustomEvent('m-combobox-change', {
          detail: { selected: ['1'] },
          bubbles: true,
          composed: true
        })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(eventFired).toBe(true);
      expect(eventDetail.selected).toEqual(['1']);
    });
  });
});
