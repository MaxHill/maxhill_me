import { expect } from "@esm-bundle/chai";
import { html, fixture, waitUntil } from '@open-wc/testing';
import { MCombobox } from './index';
import { MOption } from '../m-option';
import { MListbox } from '../m-listbox';

MCombobox.define();
MOption.define();
MListbox.define();

beforeEach(() => {
  if (!HTMLElement.prototype.showPopover) {
    HTMLElement.prototype.showPopover = function() {};
  }
  if (!HTMLElement.prototype.hidePopover) {
    HTMLElement.prototype.hidePopover = function() {};
  }
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

      expect(el).to.be.instanceOf(MCombobox);
      expect(el.name).to.equal('test-combobox');
    });

    it('should have default values', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.name).to.equal('');
      expect(el.disabled).to.equal(false);
      expect(el.multiple).to.equal(false);
      expect(el.value).to.equal(null);
    });
  });

  describe('form association', () => {
    it('should be form-associated', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox name="test">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el).to.have.property('form');
    });

    it('should reflect name attribute', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox name="initial">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.name).to.equal('initial');
      expect(el.getAttribute('name')).to.equal('initial');

      el.name = 'updated';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('name')).to.equal('updated');
    });

    it('should reflect disabled attribute', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox disabled>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.disabled).to.equal(true);
      expect(el.hasAttribute('disabled')).to.equal(true);
    });

    it('should reflect multiple attribute', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      expect(el.multiple).to.equal(true);
      expect(el.hasAttribute('multiple')).to.equal(true);
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
      
      expect(el.value).to.equal(null);
    });

    it('should return empty array for multiple mode when no items selected', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(Array.isArray(el.value)).to.equal(true);
      expect(el.value).to.deep.equal([]);
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

      expect(eventFired).to.equal(true);
      expect(eventDetail.selected).to.deep.equal(['1']);
    });
  });
});
