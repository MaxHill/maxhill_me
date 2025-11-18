import { expect } from "@esm-bundle/chai";

import { html, fixture, waitUntil } from '@open-wc/testing';
import { MListbox } from './index';
import { MOption } from '../m-option';

MListbox.define();
MOption.define();

describe('m-listbox', () => {
  describe('ARIA roles and attributes', () => {
    it('should have role="listbox"', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      expect(el.getAttribute('role')).to.equal('listbox');
    });

    it('should have tabindex="0" by default', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      expect(el.getAttribute('tabindex')).to.equal('0');
    });

    it('should set aria-multiselectable="true" when multiple', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox multiple>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      expect(el.getAttribute('aria-multiselectable')).to.equal('true');
    });

    it('should not have aria-multiselectable when single select', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      expect(el.hasAttribute('aria-multiselectable')).to.equal(false);
    });

    it('should set aria-disabled="true" when disabled', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox disabled>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      expect(el.getAttribute('aria-disabled')).to.equal('true');
      expect(el.getAttribute('tabindex')).to.equal('-1');
    });
  });

  describe('list box items ARIA', () => {
    it('should have role="option" on items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const item = el.querySelector('m-option') as MOption;

      expect(item.getAttribute('role')).to.equal('option');
    });

    it('should set aria-selected="true" on selected item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox value="apple">
          <m-option value="apple">Apple</m-option>
          <m-option value="pear">Pear</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const appleItem = items[0] as MOption;
      const pearItem = items[1] as MOption;

      expect(appleItem.getAttribute('aria-selected')).to.equal('true');
      expect(pearItem.getAttribute('aria-selected')).to.equal('false');
    });

    it('should set aria-selected="false" on unselected items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const item = el.querySelector('m-option') as MOption;

      expect(item.getAttribute('aria-selected')).to.equal('false');
    });

    it('should not have tabindex on items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const item = el.querySelector('m-option') as MOption;

      expect(item.hasAttribute('tabindex')).to.equal(false);
    });
  });

  describe('keyboard navigation - single select', () => {
    it('should move focus to next option with ArrowDown', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
          <m-option value="orange">Orange</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 3);
      const items = el.querySelectorAll('m-option');
      const firstItem = items[0] as MOption;
      const secondItem = items[1] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      expect(el.getAttribute('aria-activedescendant')).to.equal(secondItem.id);
    });

    it('should move focus to previous option with ArrowUp', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
          <m-option value="orange">Orange</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 3);
      const items = el.querySelectorAll('m-option');
      const firstItem = items[0] as MOption;
      const secondItem = items[1] as MOption;
      const thirdItem = items[2] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === thirdItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      expect(el.getAttribute('aria-activedescendant')).to.equal(firstItem.id);
    });

    it('should move focus to last option with End', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
          <m-option value="orange">Orange</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 3);
      const items = el.querySelectorAll('m-option');
      const lastItem = items[2] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);
      expect(el.getAttribute('aria-activedescendant')).to.equal(lastItem.id);
    });

    it('should select focused option with Space', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const firstItem = items[0] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(el.value).to.equal('apple');
      expect(firstItem.getAttribute('aria-selected')).to.equal('true');
    });

    it('should select focused option with Enter', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const firstItem = items[0] as MOption;
      const secondItem = items[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(el.value).to.equal('banana');
      expect(secondItem.getAttribute('aria-selected')).to.equal('true');
    });

    it('should wrap to first item when ArrowDown is pressed on last item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const firstItem = items[0] as MOption;
      const lastItem = items[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);

      expect(el.getAttribute('aria-activedescendant')).to.equal(firstItem.id);
    });

    it('should wrap to last item when ArrowUp is pressed on first item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const firstItem = items[0] as MOption;
      const lastItem = items[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);

      expect(el.getAttribute('aria-activedescendant')).to.equal(lastItem.id);
    });

    it('should set :state(focus) on virtually focused item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const firstItem = items[0] as MOption;
      const secondItem = items[1] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      expect((firstItem as any)._internals.states.has('focus')).to.equal(true);
      expect((secondItem as any)._internals.states.has('focus')).to.equal(false);

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);

      expect((firstItem as any)._internals.states.has('focus')).to.equal(false);
      expect((secondItem as any)._internals.states.has('focus')).to.equal(true);
    });
  });

  describe('single selection behavior', () => {
    it('should select item on click', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const appleItem = items[0] as MOption;

      appleItem.click();

      expect(el.value).to.equal('apple');
      expect(appleItem.selected).to.equal(true);
      expect(appleItem.getAttribute('aria-selected')).to.equal('true');
    });

    it('should set virtual focus on click', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const appleItem = items[0] as MOption;
      const bananaItem = items[1] as MOption;

      bananaItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      bananaItem.click();

      expect(el.getAttribute('aria-activedescendant')).to.equal(bananaItem.id);
      expect((bananaItem as any)._internals.states.has('focus')).to.equal(true);
      expect((appleItem as any)._internals.states.has('focus')).to.equal(false);
    });

    it('should only allow one selection at a time', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const appleItem = items[0] as MOption;
      const bananaItem = items[1] as MOption;

      appleItem.click();
      expect(el.value).to.equal('apple');

      bananaItem.click();
      expect(el.value).to.equal('banana');
      expect(appleItem.getAttribute('aria-selected')).to.equal('false');
      expect(bananaItem.getAttribute('aria-selected')).to.equal('true');
    });

    it('should dispatch change event when value changes', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const item = el.querySelector('m-option') as MOption;

      let changeEventFired = false;
      el.addEventListener('change', () => {
        changeEventFired = true;
      });

      item.click();

      expect(changeEventFired).to.equal(true);
    });
  });

  describe('multiple selection behavior', () => {
    it('should allow multiple selections', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
          <m-option value="orange">Orange</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 3);
      const items = el.querySelectorAll('m-option');
      const appleItem = items[0] as MOption;
      const bananaItem = items[1] as MOption;

      appleItem.click();
      expect(el.value).to.deep.equal(['apple']);

      bananaItem.click();
      expect(el.value).to.deep.equal(['apple', 'banana']);
      expect(appleItem.getAttribute('aria-selected')).to.equal('true');
      expect(bananaItem.getAttribute('aria-selected')).to.equal('true');
    });

    it('should toggle selection on click in multiple mode', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const item = el.querySelector('m-option') as MOption;

      item.click();
      expect(el.value).to.deep.equal(['apple']);
      expect(item.getAttribute('aria-selected')).to.equal('true');

      item.click();
      expect(el.value).to.deep.equal([]);
      expect(item.getAttribute('aria-selected')).to.equal('false');
    });

    it('should toggle selection with Space in multiple mode', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const appleItem = items[0] as MOption;

      el.setFocus(appleItem);
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(el.value).to.deep.equal(['apple']);

      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(el.value).to.deep.equal([]);
    });
  });

  describe('form integration', () => {
    it('should participate in form submission', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruit" value="apple">
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-option').length === 2);
      const formData = new FormData(form);

      expect(formData.get('fruit')).to.equal('apple');
    });

    it('should update form value when selection changes', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruit">
            <m-option value="apple">Apple</m-option>
            <m-option value="banana">Banana</m-option>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-option').length === 2);
      const listBox = form.querySelector('m-listbox') as MListbox;
      const items = form.querySelectorAll('m-option');
      const bananaItem = items[1] as MOption;

      bananaItem.click();

      const formData = new FormData(form);
      expect(formData.get('fruit')).to.equal('banana');
    });

    it.skip('should handle disabled state from form', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruit">
            <m-option value="apple">Apple</m-option>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-option').length === 1);
      const listBox = form.querySelector('m-listbox') as MListbox;

      listBox.disabled = true;
      expect(listBox.getAttribute('aria-disabled')).to.equal('true');
      expect(listBox.getAttribute('tabindex')).to.equal('-1');
    });
  });

  describe('disabled items', () => {
    it('should not select disabled items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple" disabled>Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const items = el.querySelectorAll('m-option');
      const appleItem = items[0] as MOption;

      appleItem.click();

      expect(el.value).to.equal(null);
      expect(appleItem.getAttribute('aria-selected')).to.equal('false');
    });

    it('should set aria-disabled="true" on disabled items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple" disabled>Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const item = el.querySelector('m-option') as MOption;

      expect(item.getAttribute('aria-disabled')).to.equal('true');
    });
  });
});
