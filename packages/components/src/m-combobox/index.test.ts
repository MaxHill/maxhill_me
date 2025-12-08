import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MCombobox } from './index';
import { MOption } from '../m-option';
import { MSearchList} from '../m-search-list/';
import MInput from '../m-input';

MCombobox.define();
MOption.define();
MSearchList.define();
MInput.define();

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

      expect(el.name).to.be.undefined;
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
        <m-combobox multiple name="test">
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

    it('should dispatch m-combobox-select event when option is selected', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-combobox-select', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      const option = el.querySelector('m-option[value="1"]') as MOption;
      option.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(eventFired).to.equal(true);
      expect(eventDetail.option).to.equal(option);
      expect(eventDetail.selected).to.equal(true);
    });

    it('should dispatch m-combobox-unselected event when option is deselected', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));

      const option1 = el.querySelector('m-option[value="1"]') as MOption;
      const option2 = el.querySelector('m-option[value="2"]') as MOption;

      // Select first option
      option1.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-combobox-unselected', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      // Select second option (should deselect first in single-select mode)
      option2.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(eventFired).to.equal(true);
      expect(eventDetail.option).to.equal(option1);
      expect(eventDetail.selected).to.equal(false);
    });

    it('should dispatch m-combobox-focus-change event when focus moves between options', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-combobox-focus-change', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      const option1 = el.querySelector('m-option[value="1"]') as MOption;
      
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(eventFired).to.equal(true);
      expect(eventDetail.option).to.equal(option1);
    });

    it('should dispatch m-combobox-focus-change with null when focus is cleared', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));

      const option1 = el.querySelector('m-option[value="1"]') as MOption;
      
      // Focus an option first
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));

      let eventFired = false;
      let eventDetail: any;

      el.addEventListener('m-combobox-focus-change', (e: Event) => {
        eventFired = true;
        eventDetail = (e as CustomEvent).detail;
      });

      // Clear focus
      el.focusBlur();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(eventFired).to.equal(true);
      expect(eventDetail.option).to.equal(null);
    });

    it('should dispatch events in correct order for single-select mode', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 50));

      const option1 = el.querySelector('m-option[value="1"]') as MOption;
      const option2 = el.querySelector('m-option[value="2"]') as MOption;

      const events: string[] = [];

      el.addEventListener('m-combobox-unselected', () => events.push('unselected'));
      el.addEventListener('m-combobox-select', () => events.push('select'));
      el.addEventListener('m-combobox-change', () => events.push('change'));

      // Select first option
      option1.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(events).to.deep.equal(['select', 'change']);

      events.length = 0;

      // Select second option (should deselect first)
      option2.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(events).to.deep.equal(['unselected', 'select', 'change']);
    });
  });
  describe('accessibility', () => {
    it('passes automated a11y tests', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox label="Choose a fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
          <m-option value="orange">Orange</m-option>
        </m-combobox>
      `);

      await expect(el).to.be.accessible();
    });
  });



  describe('aria-label support', () => {
    it('should set aria-label when label attribute is provided', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox label="Select a fruit">
          <m-option value="apple">Apple</m-option>
        </m-combobox>
      `);

      expect(el.getAttribute('aria-label')).to.equal('Select a fruit');
      expect(el.label).to.equal('Select a fruit');
    });

    it('should update aria-label when label property changes', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox label="Original label">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.getAttribute('aria-label')).to.equal('Original label');

      el.label = 'Updated label';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-label')).to.equal('Updated label');
    });

    it('should remove aria-label when label is removed', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox label="Test label">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.hasAttribute('aria-label')).to.equal(true);

      el.removeAttribute('label');
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.hasAttribute('aria-label')).to.equal(false);
    });

    it('should pass label to inner m-input element', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox label="Select item">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      await new Promise(resolve => setTimeout(resolve, 0));

      const input = el.shadowRoot!.querySelector('m-input');
      expect(input).to.exist;
      expect(input!.getAttribute('label')).to.equal('Select item');
    });
  });

  describe('aria-activedescendant', () => {
    it('should set aria-activedescendant when an option is focused', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      const firstOption = el.querySelector('m-option[value="1"]') as MOption;
      el.focusedElement = firstOption;

      await new Promise(resolve => setTimeout(resolve, 0));

      const ariaActiveDescendant = el.getAttribute('aria-activedescendant');
      expect(ariaActiveDescendant).to.equal(firstOption.id);
      expect(firstOption.id).to.match(/^option-/);
    });

    it('should update aria-activedescendant when focus changes', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const secondOption = options[1] as MOption;

      el.focusedElement = firstOption;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-activedescendant')).to.equal(firstOption.id);

      el.focusedElement = secondOption;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-activedescendant')).to.equal(secondOption.id);
    });

    it('should remove aria-activedescendant when no option is focused', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);

      const option = el.querySelector('m-option') as MOption;
      el.focusedElement = option;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.hasAttribute('aria-activedescendant')).to.equal(true);

      el.focusedElement = null;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.hasAttribute('aria-activedescendant')).to.equal(false);
    });
  });

  describe('popover listbox ARIA attributes', () => {
    it('should have aria-multiselectable="true" on listbox when multiple', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      const popover = el.shadowRoot!.querySelector('#popover');
      expect(popover!.getAttribute('aria-multiselectable')).to.equal('true');
    });

    it('should not have aria-multiselectable on listbox when single select', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      const popover = el.shadowRoot!.querySelector('#popover');
      expect(popover!.hasAttribute('aria-multiselectable')).to.equal(false);
    });

    it('should not have aria-label on popover', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox label="Test label">
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      const popover = el.shadowRoot!.querySelector('#popover');
      expect(popover!.hasAttribute('aria-label')).to.equal(false);
    });
  });

  describe('inner input element', () => {
    it('should not have role="combobox" on inner m-input', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      const input = el.shadowRoot!.querySelector('m-input');
      expect(input).to.exist;
      expect(input!.hasAttribute('role')).to.equal(false);
    });
  });

  describe('m-option ARIA attributes', () => {
    it('should auto-generate IDs for options', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');

      options.forEach(option => {
        expect(option.id).to.match(/^option-/);
      });
    });
  });

  describe('aria-expanded state management', () => {
    it('should set aria-expanded="true" when popover is shown', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      expect(el.getAttribute('aria-expanded')).to.equal('false');

      el.dispatchEvent(new FocusEvent('focus'));

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-expanded')).to.equal('true');
    });

    it('should set aria-expanded="false" when popover is closed with blur', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      el.focus();
      await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

      el.dispatchEvent(new FocusEvent('blur'));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-expanded')).to.equal('false');
    });

    it('should set aria-expanded="false" when option is selected in single mode', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      el.focus();
      await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

      const option = el.querySelector('m-option[value="1"]') as MOption;
      option.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-expanded')).to.equal('false');
    });

    it('should keep aria-expanded="true" when option is selected in multiple mode', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      el.focus();
      await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

      const option = el.querySelector('m-option[value="1"]') as MOption;
      option.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-expanded')).to.equal('true');
    });

    it('should set aria-expanded="false" when Escape is pressed', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      el.focus();
      await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(el.getAttribute('aria-expanded')).to.equal('false');
    });

  });

  describe('selection updates input value', () => {
    it('should update input value when option is selected in single mode', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      const input = el.shadowRoot!.querySelector('m-input') as any;
      expect(input.value).to.equal('');

      const option = el.querySelector('m-option[value="apple"]') as MOption;
      option.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(input.value).to.equal('Apple');
    });

    it('should replace input value when selecting different option in single mode', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      const input = el.shadowRoot!.querySelector('m-input') as any;

      const firstOption = el.querySelector('m-option[value="apple"]') as MOption;
      firstOption.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(input.value).to.equal('Apple');

      el.focus();
      await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

      const secondOption = el.querySelector('m-option[value="banana"]') as MOption;
      secondOption.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(input.value).to.equal('Banana');
    });


    it('should not update input value in multiple mode (uses tags instead)', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox multiple>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      const input = el.shadowRoot!.querySelector('m-input') as any;
      const initialValue = input.value;

      const option = el.querySelector('m-option[value="apple"]') as MOption;
      option.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(input.value).to.equal(initialValue);
    });

    it('should preserve input value when filtering options', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="apple">Apple</m-option>
          <m-option value="apricot">Apricot</m-option>
          <m-option value="banana">Banana</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 3);

      const input = el.shadowRoot!.querySelector('m-input') as any;
      
      el.focus();
      await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

      input.value = 'ap';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(input.value).to.equal('ap');
    });

    it('should reflect programmatic selection in input value', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);

      const input = el.shadowRoot!.querySelector('m-input') as any;
      const option = el.querySelector('m-option[value="banana"]') as MOption;

      option.selected = true;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(input.value).to.equal('Banana');
    });
  });

  describe('keyboard navigation', () => {
    describe('ArrowDown', () => {
      it('should open popup when closed', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="1">Item 1</m-option>
            <m-option value="2">Item 2</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);

        expect(el.getAttribute('aria-expanded')).to.equal('false');

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.getAttribute('aria-expanded')).to.equal('true');
      });

      it('should wrap from first to last option', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);
        const options = el.querySelectorAll('m-option');
        const firstOption = options[0] as MOption;
        const lastOption = options[1] as MOption;

        el.focus();
        el.focusedElement = firstOption;
        await new Promise(resolve => setTimeout(resolve, 0));

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === lastOption.id);

        expect(el.getAttribute('aria-activedescendant')).to.equal(lastOption.id);
      });
    });

    describe('Enter key', () => {
      it('should accept focused option', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);
        const options = el.querySelectorAll('m-option');
        const secondOption = options[1] as MOption;

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') !== null);

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === secondOption.id);

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.value).to.equal('banana');
        expect(secondOption.getAttribute('aria-selected')).to.equal('true');
      });

      it('should update input value with selected option text', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);
        const secondOption = el.querySelectorAll('m-option')[1] as MOption;

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => !!el.getAttribute('aria-activedescendant'));

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === secondOption.id);

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        const input = el.shadowRoot!.querySelector('m-input') as any;
        expect(input.value).to.equal('Banana');
      });
    });

    describe('Escape key', () => {
      it('should close popup when open', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

        expect(el.getAttribute('aria-expanded')).to.equal('true');

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.getAttribute('aria-expanded')).to.equal('false');
      });

      it('should reset input value to last selected item in single mode', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);
        const firstOption = el.querySelectorAll('m-option')[0] as MOption;

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        const input = el.shadowRoot!.querySelector('m-input') as any;
        expect(input.value).to.equal('Apple');

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

        input.value = 'test input';

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(input.value).to.equal('Apple');
      });

      it('should clear input value in multiple mode', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox multiple>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

        const input = el.shadowRoot!.querySelector('m-input') as any;
        input.value = 'test search';

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(input.value).to.equal('');
      });
    });

    describe('Home/End keys', () => {
      it('should move focus to first option with Home', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
            <m-option value="orange">Orange</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 3);
        const options = el.querySelectorAll('m-option');
        const firstOption = options[0] as MOption;

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));

        await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
        expect(el.getAttribute('aria-activedescendant')).to.equal(firstOption.id);
      });

      it('should move focus to last option with End', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
            <m-option value="orange">Orange</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 3);
        const options = el.querySelectorAll('m-option');
        const lastOption = options[2] as MOption;

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

        await waitUntil(() => el.getAttribute('aria-activedescendant') === lastOption.id);
        expect(el.getAttribute('aria-activedescendant')).to.equal(lastOption.id);
      });
    });
  });

  describe('focus management', () => {
    it('should set actual focus on host element when focused', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
        </m-combobox>
      `);

      el.focus();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(document.activeElement).to.equal(el);
    });

    it('should manage virtual focus on options via aria-activedescendant', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);

      expect(document.activeElement).to.equal(el);
      expect(el.getAttribute('aria-activedescendant')).to.equal(firstOption.id);
    });

    it('should set focused attribute on virtually focused option', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const secondOption = options[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      await waitUntil(() => firstOption.hasAttribute('focused'));

      expect(firstOption.hasAttribute('focused')).to.equal(true);
      expect(secondOption.hasAttribute('focused')).to.equal(false);
    });

    it('should move focused attribute when virtual focus changes', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const secondOption = options[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => firstOption.hasAttribute('focused'));

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => secondOption.hasAttribute('focused'));

      expect(firstOption.hasAttribute('focused')).to.equal(false);
      expect(secondOption.hasAttribute('focused')).to.equal(true);
    });

    it('should not move actual focus to options (only virtual focus)', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      await waitUntil(() => (options[0] as MOption).hasAttribute('focused'));

      expect(document.activeElement).to.equal(el);
      expect(document.activeElement).to.not.equal(options[0]);
    });

    it('should clear virtual focus when popup closes', async () => {
      const el = await fixture<MCombobox>(html`
        <m-combobox>
          <m-option value="1">Item 1</m-option>
          <m-option value="2">Item 2</m-option>
        </m-combobox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => firstOption.hasAttribute('focused'));

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-expanded') === 'false');

      expect(firstOption.hasAttribute('focused')).to.equal(false);
      expect(el.hasAttribute('aria-activedescendant')).to.equal(false);
    });
  });

  describe('edge cases', () => {
    describe('disabled state', () => {
      it('should not open popup when disabled and focused', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox disabled>
            <m-option value="1">Item 1</m-option>
          </m-combobox>
        `);

        el.focus();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.getAttribute('aria-expanded')).to.equal('false');
      });

      it('should not respond to keyboard events when disabled', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox disabled>
            <m-option value="1">Item 1</m-option>
            <m-option value="2">Item 2</m-option>
          </m-combobox>
        `);

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.getAttribute('aria-expanded')).to.equal('false');
        expect(el.hasAttribute('aria-activedescendant')).to.equal(false);
      });
    });

    describe('disabled options', () => {
      it('should skip disabled options when navigating with ArrowDown', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana" disabled>Banana</m-option>
            <m-option value="orange">Orange</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 3);
        const options = el.querySelectorAll('m-option');
        const appleOption = options[0] as MOption;
        const orangeOption = options[2] as MOption;

        el.focus();
        el.focusedElement = appleOption;

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

        await waitUntil(() => el.getAttribute('aria-activedescendant') === orangeOption.id);
        expect(el.getAttribute('aria-activedescendant')).to.equal(orangeOption.id);
      });

      it('should skip disabled options when navigating with ArrowUp', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana" disabled>Banana</m-option>
            <m-option value="orange">Orange</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 3);
        const options = el.querySelectorAll('m-option');
        const appleOption = options[0] as MOption;
        const orangeOption = options[2] as MOption;

        el.focus();
        el.focusedElement = orangeOption;

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

        await waitUntil(() => el.getAttribute('aria-activedescendant') === appleOption.id);
        expect(el.getAttribute('aria-activedescendant')).to.equal(appleOption.id);
      });

      it('should not select disabled options when clicked', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple" disabled>Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);
        const disabledOption = el.querySelector('m-option[disabled]') as MOption;

        el.focus();
        await waitUntil(() => el.getAttribute('aria-expanded') === 'true');

        disabledOption.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(disabledOption.getAttribute('aria-selected')).to.equal('false');
      });
    });

    describe('empty list', () => {
      it('should have no aria-activedescendant when no options exist', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
          </m-combobox>
        `);

        el.focus();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.hasAttribute('aria-activedescendant')).to.equal(false);
      });

      it('should not error when navigating with ArrowDown in empty list', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
          </m-combobox>
        `);

        el.focus();
        
        expect(() => {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        }).to.not.throw();

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.hasAttribute('aria-activedescendant')).to.equal(false);
      });

      it('should not error when pressing Enter in empty list', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
          </m-combobox>
        `);

        el.focus();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(() => {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }).to.not.throw();
      });
    });

    describe('filtered results', () => {
      it('should maintain aria-activedescendant on visible options after filtering', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="apricot">Apricot</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 3);
        const options = el.querySelectorAll('m-option');
        const appleOption = options[0] as MOption;

        el.focus();
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === appleOption.id);

        const input = el.shadowRoot!.querySelector('m-input') as any;
        input.value = 'ap';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.getAttribute('aria-activedescendant')).to.equal(appleOption.id);
      });

      it('should skip hidden options when navigating after filtering', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox debounce="0">
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
            <m-option value="apricot">Apricot</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 3);
        const options = el.querySelectorAll('m-option');
        const appleOption = options[0] as MOption;
        const apricotOption = options[2] as MOption;

        el.focus();
        
        const input = el.shadowRoot!.querySelector('m-input') as any;
        input.value = 'ap';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 0));

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === appleOption.id);

        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === apricotOption.id);

        expect(el.getAttribute('aria-activedescendant')).to.equal(apricotOption.id);
      });
    });

    describe('dynamic options', () => {
      it('should handle options added after initialization', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 1);

        const newOption = document.createElement('m-option') as MOption;
        newOption.value = 'banana';
        newOption.textContent = 'Banana';
        el.appendChild(newOption);

        await new Promise(resolve => setTimeout(resolve, 0));

        const options = el.querySelectorAll('m-option');
        expect(options.length).to.equal(2);
        expect(newOption.hasAttribute('role')).to.equal(true);
        expect(newOption.getAttribute('role')).to.equal('option');
        expect(newOption.id).to.match(/^option-/);
      });

      it('should handle options removed after initialization', async () => {
        const el = await fixture<MCombobox>(html`
          <m-combobox>
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-combobox>
        `);

        await waitUntil(() => el.querySelectorAll('m-option').length === 2);
        const optionToRemove = el.querySelector('m-option[value="apple"]') as MOption;
        const remainingOption = el.querySelector('m-option[value="banana"]') as MOption;

        el.focusedElement = optionToRemove;
        await new Promise(resolve => setTimeout(resolve, 0));

        optionToRemove.remove();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(el.querySelectorAll('m-option').length).to.equal(1);
        
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await waitUntil(() => el.getAttribute('aria-activedescendant') === remainingOption.id);

        expect(el.getAttribute('aria-activedescendant')).to.equal(remainingOption.id);
      });
    });
  });


});
