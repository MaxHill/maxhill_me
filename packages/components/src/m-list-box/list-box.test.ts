import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MListBox } from './list-box';
import { MListBoxItem } from './list-box-item';

MListBox.define();
MListBoxItem.define();

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

describe('m-list-box', () => {
  describe('ARIA roles and attributes', () => {
    it('should have role="listbox"', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      expect(el.getAttribute('role')).toBe('listbox');
    });

    it('should have tabindex="0" by default', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      expect(el.getAttribute('tabindex')).toBe('0');
    });

    it('should set aria-multiselectable="true" when multiple', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box multiple>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      expect(el.getAttribute('aria-multiselectable')).toBe('true');
    });

    it('should not have aria-multiselectable when single select', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      expect(el.hasAttribute('aria-multiselectable')).toBe(false);
    });

    it('should set aria-disabled="true" when disabled', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box disabled>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      expect(el.getAttribute('aria-disabled')).toBe('true');
      expect(el.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('list box items ARIA', () => {
    it('should have role="option" on items', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 1);
      const item = el.querySelector('m-list-box-item') as MListBoxItem;

      expect(item.getAttribute('role')).toBe('option');
    });

    it('should set aria-selected="true" on selected item', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box value="apple">
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="pear">Pear</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const appleItem = items[0] as MListBoxItem;
      const pearItem = items[1] as MListBoxItem;

      expect(appleItem.getAttribute('aria-selected')).toBe('true');
      expect(pearItem.getAttribute('aria-selected')).toBe('false');
    });

    it('should set aria-selected="false" on unselected items', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 1);
      const item = el.querySelector('m-list-box-item') as MListBoxItem;

      expect(item.getAttribute('aria-selected')).toBe('false');
    });

    it('should not have tabindex on items', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 1);
      const item = el.querySelector('m-list-box-item') as MListBoxItem;

      expect(item.hasAttribute('tabindex')).toBe(false);
    });
  });

  describe('keyboard navigation - single select', () => {
    it('should move focus to next option with ArrowDown', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
          <m-list-box-item value="orange">Orange</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 3);
      const items = el.querySelectorAll('m-list-box-item');
      const firstItem = items[0] as MListBoxItem;
      const secondItem = items[1] as MListBoxItem;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      expect(el.getAttribute('aria-activedescendant')).toBe(secondItem.id);
    });

    it('should move focus to previous option with ArrowUp', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
          <m-list-box-item value="orange">Orange</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 3);
      const items = el.querySelectorAll('m-list-box-item');
      const firstItem = items[0] as MListBoxItem;
      const secondItem = items[1] as MListBoxItem;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      expect(el.getAttribute('aria-activedescendant')).toBe(firstItem.id);
    });

    it('should move focus to last option with End', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
          <m-list-box-item value="orange">Orange</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 3);
      const items = el.querySelectorAll('m-list-box-item');
      const lastItem = items[2] as MListBoxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);
      expect(el.getAttribute('aria-activedescendant')).toBe(lastItem.id);
    });

    it('should select focused option with Space', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruit">
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const firstItem = items[0] as MListBoxItem;

      el.focus();
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(el.value).toBe('apple');
      expect(firstItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should select focused option with Enter', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruit">
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const secondItem = items[1] as MListBoxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === secondItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(el.value).toBe('banana');
      expect(secondItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should not move past last item with ArrowDown', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const lastItem = items[1] as MListBoxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === lastItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect(el.getAttribute('aria-activedescendant')).toBe(lastItem.id);
    });

    it('should not move before first item with ArrowUp', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const firstItem = items[0] as MListBoxItem;

      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await waitUntil(() => el.getAttribute('aria-activedescendant') === firstItem.id);
      
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      expect(el.getAttribute('aria-activedescendant')).toBe(firstItem.id);
    });

    it('should set :state(focus) on virtually focused item', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const firstItem = items[0] as MListBoxItem;
      const secondItem = items[1] as MListBoxItem;

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
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruit">
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const appleItem = items[0] as MListBoxItem;

      appleItem.click();

      expect(el.value).toBe('apple');
      expect(appleItem.selected).toBe(true);
      expect(appleItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should set virtual focus on click', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruit">
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const appleItem = items[0] as MListBoxItem;
      const bananaItem = items[1] as MListBoxItem;

      bananaItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      bananaItem.click();

      expect(el.getAttribute('aria-activedescendant')).toBe(bananaItem.id);
      expect((bananaItem as any)._internals.states.has('focus')).toBe(true);
      expect((appleItem as any)._internals.states.has('focus')).toBe(false);
    });

    it('should only allow one selection at a time', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruit">
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const appleItem = items[0] as MListBoxItem;
      const bananaItem = items[1] as MListBoxItem;

      appleItem.click();
      expect(el.value).toBe('apple');

      bananaItem.click();
      expect(el.value).toBe('banana');
      expect(appleItem.getAttribute('aria-selected')).toBe('false');
      expect(bananaItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should dispatch change event when value changes', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruit">
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 1);
      const item = el.querySelector('m-list-box-item') as MListBoxItem;

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
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruits" multiple>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
          <m-list-box-item value="orange">Orange</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 3);
      const items = el.querySelectorAll('m-list-box-item');
      const appleItem = items[0] as MListBoxItem;
      const bananaItem = items[1] as MListBoxItem;

      appleItem.click();
      expect(el.value).toBe('apple');

      bananaItem.click();
      expect(el.value).toBe('apple,banana');
      expect(appleItem.getAttribute('aria-selected')).toBe('true');
      expect(bananaItem.getAttribute('aria-selected')).toBe('true');
    });

    it('should toggle selection on click in multiple mode', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruits" multiple>
          <m-list-box-item value="apple">Apple</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 1);
      const item = el.querySelector('m-list-box-item') as MListBoxItem;

      item.click();
      expect(el.value).toBe('apple');
      expect(item.getAttribute('aria-selected')).toBe('true');

      item.click();
      expect(el.value).toBe('');
      expect(item.getAttribute('aria-selected')).toBe('false');
    });

    it('should toggle selection with Space in multiple mode', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruits" multiple>
          <m-list-box-item value="apple">Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const appleItem = items[0] as MListBoxItem;

      appleItem.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(el.value).toBe('apple');

      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(el.value).toBe('');
    });
  });

  describe('form integration', () => {
    it('should participate in form submission', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-list-box name="fruit" value="apple">
            <m-list-box-item value="apple">Apple</m-list-box-item>
            <m-list-box-item value="banana">Banana</m-list-box-item>
          </m-list-box>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-list-box-item').length === 2);
      const formData = new FormData(form);

      expect(formData.get('fruit')).toBe('apple');
    });

    it('should update form value when selection changes', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-list-box name="fruit">
            <m-list-box-item value="apple">Apple</m-list-box-item>
            <m-list-box-item value="banana">Banana</m-list-box-item>
          </m-list-box>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-list-box-item').length === 2);
      const listBox = form.querySelector('m-list-box') as MListBox;
      const items = form.querySelectorAll('m-list-box-item');
      const bananaItem = items[1] as MListBoxItem;

      bananaItem.click();

      const formData = new FormData(form);
      expect(formData.get('fruit')).toBe('banana');
    });

    it('should handle disabled state from form', async () => {
      const form = await fixture<HTMLFormElement>(html`
        <form>
          <m-list-box name="fruit">
            <m-list-box-item value="apple">Apple</m-list-box-item>
          </m-list-box>
        </form>
      `);

      await waitUntil(() => form.querySelectorAll('m-list-box-item').length === 1);
      const listBox = form.querySelector('m-list-box') as MListBox;

      listBox.disabled = true;
      expect(listBox.getAttribute('aria-disabled')).toBe('true');
      expect(listBox.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('disabled items', () => {
    it('should not select disabled items', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box name="fruit">
          <m-list-box-item value="apple" disabled>Apple</m-list-box-item>
          <m-list-box-item value="banana">Banana</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 2);
      const items = el.querySelectorAll('m-list-box-item');
      const appleItem = items[0] as MListBoxItem;

      appleItem.click();

      expect(el.value).toBe('');
      expect(appleItem.getAttribute('aria-selected')).toBe('false');
    });

    it('should set aria-disabled="true" on disabled items', async () => {
      const el = await fixture<MListBox>(html`
        <m-list-box>
          <m-list-box-item value="apple" disabled>Apple</m-list-box-item>
        </m-list-box>
      `);

      await waitUntil(() => el.querySelectorAll('m-list-box-item').length === 1);
      const item = el.querySelector('m-list-box-item') as MListBoxItem;

      expect(item.getAttribute('aria-disabled')).toBe('true');
    });
  });
});
