import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MListbox } from './index';
import { MListboxItem } from '../m-listbox-item';

MListbox.define();
MListboxItem.define();

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

describe('m-listbox', () => {
  describe('ARIA roles and attributes', () => {
    it('should have role="listbox"', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      expect(el.getAttribute('role')).toBe('listbox');
    });

    it('should have tabindex="0" by default', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      expect(el.getAttribute('tabindex')).toBe('0');
    });

    it('should set aria-multiselectable="true" when multiple', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox multiple>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      expect(el.getAttribute('aria-multiselectable')).toBe('true');
    });

    it('should not have aria-multiselectable when single select', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      expect(el.hasAttribute('aria-multiselectable')).toBe(false);
    });

    it('should set aria-disabled="true" when disabled', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox disabled>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      expect(el.getAttribute('aria-disabled')).toBe('true');
      expect(el.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('list box items ARIA', () => {
    it('should have role="option" on items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 1);
      const item = el.querySelector('m-listbox-item') as MListboxItem;

      expect(item.getAttribute('role')).toBe('option');
    });

    it('should set aria-selected="true" on selected item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox value="apple">
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="pear">Pear</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const appleItem = items[0] as MListboxItem;
      const pearItem = items[1] as MListboxItem;

      expect(appleItem.getAttribute('aria-selected')).toBe('true');
      expect(pearItem.getAttribute('aria-selected')).toBe('false');
    });

    it('should set aria-selected="false" on unselected items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 1);
      const item = el.querySelector('m-listbox-item') as MListboxItem;

      expect(item.getAttribute('aria-selected')).toBe('false');
    });

    it('should not have tabindex on items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 1);
      const item = el.querySelector('m-listbox-item') as MListboxItem;

      expect(item.hasAttribute('tabindex')).toBe(false);
    });
  });

  describe('keyboard navigation - single select', () => {
    it('should move focus to next option with ArrowDown', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
          <m-listbox-item value="orange">Orange</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 3);
      const items = el.querySelectorAll('m-listbox-item');
      const firstItem = items[0] as MListboxItem;
      const secondItem = items[1] as MListboxItem;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      expect(el.getAttribute('aria-activedescendant')).toBe(secondItem.id);
    });

    it('should move focus to previous option with ArrowUp', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
          <m-listbox-item value="orange">Orange</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 3);
      const items = el.querySelectorAll('m-listbox-item');
      const firstItem = items[0] as MListboxItem;
      const secondItem = items[1] as MListboxItem;
      const thirdItem = items[2] as MListboxItem;

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
      
      expect(el.getAttribute('aria-activedescendant')).toBe(firstItem.id);
    });

    it('should move focus to last option with End', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
          <m-listbox-item value="orange">Orange</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 3);
      const items = el.querySelectorAll('m-listbox-item');
      const lastItem = items[2] as MListboxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);
      expect(el.getAttribute('aria-activedescendant')).toBe(lastItem.id);
    });

    it('should select focused option with Space', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const firstItem = items[0] as MListboxItem;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(el.value).toBe('apple');
      expect(firstItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should select focused option with Enter', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const firstItem = items[0] as MListboxItem;
      const secondItem = items[1] as MListboxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(el.value).toBe('banana');
      expect(secondItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should wrap to first item when ArrowDown is pressed on last item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const firstItem = items[0] as MListboxItem;
      const lastItem = items[1] as MListboxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);

      expect(el.getAttribute('aria-activedescendant')).toBe(firstItem.id);
    });

    it('should wrap to last item when ArrowUp is pressed on first item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const firstItem = items[0] as MListboxItem;
      const lastItem = items[1] as MListboxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);

      expect(el.getAttribute('aria-activedescendant')).toBe(lastItem.id);
    });

    it('should set :state(focus) on virtually focused item', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const firstItem = items[0] as MListboxItem;
      const secondItem = items[1] as MListboxItem;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      expect((firstItem as any)._internals.states.has('focus')).toBe(true);
      expect((secondItem as any)._internals.states.has('focus')).toBe(false);

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);

      expect((firstItem as any)._internals.states.has('focus')).toBe(false);
      expect((secondItem as any)._internals.states.has('focus')).toBe(true);
    });
  });

  describe('single selection behavior', () => {
    it('should select item on click', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const appleItem = items[0] as MListboxItem;

      appleItem.click();

      expect(el.value).toBe('apple');
      expect(appleItem.selected).toBe(true);
      expect(appleItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should set virtual focus on click', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const appleItem = items[0] as MListboxItem;
      const bananaItem = items[1] as MListboxItem;

      bananaItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      bananaItem.click();

      expect(el.getAttribute('aria-activedescendant')).toBe(bananaItem.id);
      expect((bananaItem as any)._internals.states.has('focus')).toBe(true);
      expect((appleItem as any)._internals.states.has('focus')).toBe(false);
    });

    it('should only allow one selection at a time', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const appleItem = items[0] as MListboxItem;
      const bananaItem = items[1] as MListboxItem;

      appleItem.click();
      expect(el.value).toBe('apple');

      bananaItem.click();
      expect(el.value).toBe('banana');
      expect(appleItem.getAttribute('aria-selected')).toBe('false');
      expect(bananaItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should dispatch change event when value changes', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 1);
      const item = el.querySelector('m-listbox-item') as MListboxItem;

      let changeEventFired = false;
      el.addEventListener('change', () => {
        changeEventFired = true;
      });

      item.click();

      expect(changeEventFired).toBe(true);
    });
  });

  describe('multiple selection behavior', () => {
    it('should allow multiple selections', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
          <m-listbox-item value="orange">Orange</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 3);
      const items = el.querySelectorAll('m-listbox-item');
      const appleItem = items[0] as MListboxItem;
      const bananaItem = items[1] as MListboxItem;

      appleItem.click();
      expect(el.value).toEqual(['apple']);

      bananaItem.click();
      expect(el.value).toEqual(['apple', 'banana']);
      expect(appleItem.getAttribute('aria-selected')).toBe('true');
      expect(bananaItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should toggle selection on click in multiple mode', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-listbox-item value="apple">Apple</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 1);
      const item = el.querySelector('m-listbox-item') as MListboxItem;

      item.click();
      expect(el.value).toEqual(['apple']);
      expect(item.getAttribute('aria-selected')).toBe('true');

      item.click();
      expect(el.value).toEqual([]);
      expect(item.getAttribute('aria-selected')).toBe('false');
    });

    it('should toggle selection with Space in multiple mode', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruits" multiple>
          <m-listbox-item value="apple">Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const appleItem = items[0] as MListboxItem;

      appleItem.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(el.value).toEqual(['apple']);

      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(el.value).toEqual([]);
    });
  });

  describe('form integration', () => {
    it('should participate in form submission', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruit" value="apple">
            <m-listbox-item value="apple">Apple</m-listbox-item>
            <m-listbox-item value="banana">Banana</m-listbox-item>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-listbox-item').length === 2);
      const formData = new FormData(form);

      expect(formData.get('fruit')).toBe('apple');
    });

    it('should update form value when selection changes', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruit">
            <m-listbox-item value="apple">Apple</m-listbox-item>
            <m-listbox-item value="banana">Banana</m-listbox-item>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-listbox-item').length === 2);
      const listBox = form.querySelector('m-listbox') as MListbox;
      const items = form.querySelectorAll('m-listbox-item');
      const bananaItem = items[1] as MListboxItem;

      bananaItem.click();

      const formData = new FormData(form);
      expect(formData.get('fruit')).toBe('banana');
    });

    it.skip('should handle disabled state from form', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-listbox name="fruit">
            <m-listbox-item value="apple">Apple</m-listbox-item>
          </m-listbox>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-listbox-item').length === 1);
      const listBox = form.querySelector('m-listbox') as MListbox;

      listBox.disabled = true;
      expect(listBox.getAttribute('aria-disabled')).toBe('true');
      expect(listBox.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('disabled items', () => {
    it('should not select disabled items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox name="fruit">
          <m-listbox-item value="apple" disabled>Apple</m-listbox-item>
          <m-listbox-item value="banana">Banana</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 2);
      const items = el.querySelectorAll('m-listbox-item');
      const appleItem = items[0] as MListboxItem;

      appleItem.click();

      expect(el.value).toBe(null);
      expect(appleItem.getAttribute('aria-selected')).toBe('false');
    });

    it('should set aria-disabled="true" on disabled items', async () => {
      const el = await fixture<MListbox>(html`
        <m-listbox>
          <m-listbox-item value="apple" disabled>Apple</m-listbox-item>
        </m-listbox>
      `);

      await waitUntil(() => el.querySelectorAll('m-listbox-item').length === 1);
      const item = el.querySelector('m-listbox-item') as MListboxItem;

      expect(item.getAttribute('aria-disabled')).toBe('true');
    });
  });
});
