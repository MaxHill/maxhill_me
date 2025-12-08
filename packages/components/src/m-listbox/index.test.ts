import { expect, html, fixture, waitUntil } from '@open-wc/testing';
import { MListbox } from './index';
import { MOption } from '../m-option';

MListbox.define();
MOption.define();

describe('m-listbox', () => {
  describe('accessibility', () => {
    it('passes automated a11y tests', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox label="Fruits">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
          <m-option value="orange">Orange</m-option>
        </m-listbox>
      `);

      await expect(el).to.be.accessible();
    });
  });

  describe('ARIA roles and attributes', () => {
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

  describe('list box options ARIA', () => {
    it('should set aria-selected="true" on selected option', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox value="apple">
          <m-option value="apple">Apple</m-option>
          <m-option value="pear">Pear</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const appleOption = options[0] as MOption;
      const pearOption = options[1] as MOption;

      expect(appleOption.getAttribute('aria-selected')).to.equal('true');
      expect(pearOption.getAttribute('aria-selected')).to.equal('false');
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
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const secondOption = options[1] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondOption.id);
      expect(el.getAttribute('aria-activedescendant')).to.equal(secondOption.id);
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
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const secondOption = options[1] as MOption;
      const thirdOption = options[2] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === thirdOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
      
      expect(el.getAttribute('aria-activedescendant')).to.equal(firstOption.id);
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
      const options = el.querySelectorAll('m-option');
      const lastOption = options[2] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastOption.id);
      expect(el.getAttribute('aria-activedescendant')).to.equal(lastOption.id);
    });

    it('should select focused option with Space', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(el.value).to.equal('apple');
      expect(firstOption.getAttribute('aria-selected')).to.equal('true');
    });

    it('should select focused option with Enter', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const secondOption = options[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(el.value).to.equal('banana');
      expect(secondOption.getAttribute('aria-selected')).to.equal('true');
    });

    it('should wrap to first option when ArrowDown is pressed on last option', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const lastOption = options[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);

      expect(el.getAttribute('aria-activedescendant')).to.equal(firstOption.id);
    });

    it('should wrap to last option when ArrowUp is pressed on first option', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const lastOption = options[1] as MOption;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastOption.id);

      expect(el.getAttribute('aria-activedescendant')).to.equal(lastOption.id);
    });

    it('should set :state(focus) on virtually focused item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const firstOption = options[0] as MOption;
      const secondOption = options[1] as MOption;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstOption.id);
      
      expect((firstOption as any)._internals.states.has('focus')).to.equal(true);
      expect((secondOption as any)._internals.states.has('focus')).to.equal(false);

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondOption.id);

      expect((firstOption as any)._internals.states.has('focus')).to.equal(false);
      expect((secondOption as any)._internals.states.has('focus')).to.equal(true);
    });
  });

  describe('single selection behavior', () => {
    it('should select option on click', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const appleOption = options[0] as MOption;

      appleOption.click();

      expect(el.value).to.equal('apple');
      expect(appleOption.selected).to.equal(true);
      expect(appleOption.getAttribute('aria-selected')).to.equal('true');
    });

    it('should set virtual focus on click', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const appleOption = options[0] as MOption;
      const bananaOption = options[1] as MOption;

      bananaOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      bananaOption.click();

      expect(el.getAttribute('aria-activedescendant')).to.equal(bananaOption.id);
      expect((bananaOption as any)._internals.states.has('focus')).to.equal(true);
      expect((appleOption as any)._internals.states.has('focus')).to.equal(false);
    });

    it('should only allow one selection at a time', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const appleOption = options[0] as MOption;
      const bananaOption = options[1] as MOption;

      appleOption.click();
      expect(el.value).to.equal('apple');

      bananaOption.click();
      expect(el.value).to.equal('banana');
      expect(appleOption.getAttribute('aria-selected')).to.equal('false');
      expect(bananaOption.getAttribute('aria-selected')).to.equal('true');
    });

    it('should dispatch change event when value changes', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const option = el.querySelector('m-option') as MOption;

      let changeEventFired = false;
      el.addEventListener('change', () => {
        changeEventFired = true;
      });

      option.click();

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
      const options = el.querySelectorAll('m-option');
      const appleOption = options[0] as MOption;
      const bananaOption = options[1] as MOption;

      appleOption.click();
      expect(el.value).to.deep.equal(['apple']);

      bananaOption.click();
      expect(el.value).to.deep.equal(['apple', 'banana']);
      expect(appleOption.getAttribute('aria-selected')).to.equal('true');
      expect(bananaOption.getAttribute('aria-selected')).to.equal('true');
    });

    it('should toggle selection on click in multiple mode', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-option value="apple">Apple</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 1);
      const option = el.querySelector('m-option') as MOption;

      option.click();
      expect(el.value).to.deep.equal(['apple']);
      expect(option.getAttribute('aria-selected')).to.equal('true');

      option.click();
      expect(el.value).to.deep.equal([]);
      expect(option.getAttribute('aria-selected')).to.equal('false');
    });

    it('should toggle selection with Space in multiple mode', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-option value="apple">Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const appleOption = options[0] as MOption;

      el.setFocus(appleOption);
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
      const options = form.querySelectorAll('m-option');
      const bananaOption = options[1] as MOption;

      bananaOption.click();

      const formData = new FormData(form);
      expect(formData.get('fruit')).to.equal('banana');
    });

    it('should initialize value from pre-selected option', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruit">
            <m-option value="apple">Apple</m-option>
            <m-option value="banana" selected>Banana</m-option>
            <m-option value="cherry">Cherry</m-option>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-option').length === 3);
      const listBox = form.querySelector('m-listbox') as MListbox;
      
      expect(listBox.value).to.equal('banana');
      
      const formData = new FormData(form);
      expect(formData.get('fruit')).to.equal('banana');
    });

    it('should initialize value from multiple pre-selected options', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruits" multiple>
            <m-option value="apple" selected>Apple</m-option>
            <m-option value="banana">Banana</m-option>
            <m-option value="cherry" selected>Cherry</m-option>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-option').length === 3);
      const listBox = form.querySelector('m-listbox') as MListbox;
      
      expect(listBox.value).to.deep.equal(['apple', 'cherry']);
      expect(listBox.selectedValues).to.deep.equal(['apple', 'cherry']);
      
      const formData = new FormData(form);
      expect(formData.getAll('fruits')).to.deep.equal(['apple', 'cherry']);
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

  describe('disabled options', () => {
    it('should not select disabled options', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-option value="apple" disabled>Apple</m-option>
          <m-option value="banana">Banana</m-option>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-option').length === 2);
      const options = el.querySelectorAll('m-option');
      const appleOption = options[0] as MOption;

      appleOption.click();

      expect(el.value).to.equal(null);
      expect(appleOption.getAttribute('aria-selected')).to.equal('false');
    });
  });
});
