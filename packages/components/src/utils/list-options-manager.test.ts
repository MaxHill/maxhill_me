import { describe, it, expect } from 'vitest';
import {
  getItems,
  getSelectedItems,
  getSelectedValues,
  focusFirst,
  focusLast,
  focusNext,
  focusPrev,
  computeSelection,
  type OptionLike,
} from './list-options-manager';

class MockElement {
  selected?: boolean;
  value?: string;
  disabled?: boolean;

  constructor(value: string, selected = false, disabled = false) {
    this.value = value;
    this.selected = selected;
    this.disabled = disabled;
  }
}

describe('list-options-manager', () => {
  describe('getItems', () => {
    it('should return all m-option elements', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <m-option value="1">One</m-option>
        <m-option value="2">Two</m-option>
        <m-option value="3">Three</m-option>
      `;
      const items = getItems(container);
      expect(items).toHaveLength(3);
    });

    it('should filter items using skip selector', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <m-option value="1">One</m-option>
        <m-option value="2" class="skip">Two</m-option>
        <m-option value="3">Three</m-option>
      `;
      const items = getItems(container, '.skip');
      expect(items).toHaveLength(2);
    });

    it('should return empty array for no items', () => {
      const container = document.createElement('div');
      const items = getItems(container);
      expect(items).toHaveLength(0);
    });
  });

  describe('getSelectedItems', () => {
    it('should return items with selected=true', () => {
      const items = [
        new MockElement('1', false),
        new MockElement('2', true),
        new MockElement('3', true),
      ];
      const selected = getSelectedItems(items);
      expect(selected).toHaveLength(2);
      expect(selected[0].value).toBe('2');
      expect(selected[1].value).toBe('3');
    });

    it('should return empty array when nothing selected', () => {
      const items = [
        new MockElement('1', false),
        new MockElement('2', false),
      ];
      const selected = getSelectedItems(items);
      expect(selected).toHaveLength(0);
    });
  });

  describe('getSelectedValues', () => {
    it('should return values of selected items', () => {
      const items = [
        new MockElement('1', false),
        new MockElement('2', true),
        new MockElement('3', true),
      ];
      const values = getSelectedValues(items);
      expect(values).toEqual(['2', '3']);
    });

    it('should skip items without values', () => {
      const items: OptionLike[] = [
        { selected: true },
        { selected: true, value: '2' },
      ];
      const values = getSelectedValues(items);
      expect(values).toEqual(['2']);
    });

    it('should return empty array when nothing selected', () => {
      const items = [
        new MockElement('1', false),
        new MockElement('2', false),
      ];
      const values = getSelectedValues(items);
      expect(values).toEqual([]);
    });
  });

  describe('focusFirst', () => {
    it('should return first item', () => {
      const items = [
        new MockElement('1'),
        new MockElement('2'),
        new MockElement('3'),
      ];
      const first = focusFirst(items);
      expect(first?.value).toBe('1');
    });

    it('should return null for empty list', () => {
      const first = focusFirst([]);
      expect(first).toBeNull();
    });
  });

  describe('focusLast', () => {
    it('should return last item', () => {
      const items = [
        new MockElement('1'),
        new MockElement('2'),
        new MockElement('3'),
      ];
      const last = focusLast(items);
      expect(last?.value).toBe('3');
    });

    it('should return null for empty list', () => {
      const last = focusLast([]);
      expect(last).toBeNull();
    });
  });

  describe('focusNext', () => {
    const items = [
      new MockElement('1'),
      new MockElement('2'),
      new MockElement('3'),
    ];

    it('should return next item', () => {
      const next = focusNext(items, items[0]);
      expect(next?.value).toBe('2');
    });

    it('should wrap to first item at end', () => {
      const next = focusNext(items, items[2]);
      expect(next?.value).toBe('1');
    });

    it('should return first item when currentFocus is null', () => {
      const next = focusNext(items, null);
      expect(next?.value).toBe('1');
    });

    it('should return null for empty list', () => {
      const next = focusNext([], null);
      expect(next).toBeNull();
    });
  });

  describe('focusPrev', () => {
    const items = [
      new MockElement('1'),
      new MockElement('2'),
      new MockElement('3'),
    ];

    it('should return previous item', () => {
      const prev = focusPrev(items, items[1]);
      expect(prev?.value).toBe('1');
    });

    it('should wrap to last item at beginning', () => {
      const prev = focusPrev(items, items[0]);
      expect(prev?.value).toBe('3');
    });

    it('should return last item when currentFocus is null', () => {
      const prev = focusPrev(items, null);
      expect(prev?.value).toBe('3');
    });

    it('should return null for empty list', () => {
      const prev = focusPrev([], null);
      expect(prev).toBeNull();
    });
  });

  describe('computeSelection - single mode', () => {
    const items = [
      new MockElement('1', true),
      new MockElement('2', false),
      new MockElement('3', false),
    ];

    it('should deselect other items in single mode', () => {
      const result = computeSelection(
        items[1],
        items,
        [items[0]],
        items[0],
        { multiple: false }
      );

      expect(result.itemToSelect).toBe(items[1]);
      expect(result.itemsToDeselect).toEqual([items[0]]);
      expect(result.shouldToggle).toBe(false);
      expect(result.newFocusTarget).toBe(items[1]);
    });

    it('should have empty deselect list when nothing was selected', () => {
      const result = computeSelection(
        items[1],
        items,
        [],
        null,
        { multiple: false }
      );

      expect(result.itemToSelect).toBe(items[1]);
      expect(result.itemsToDeselect).toEqual([]);
      expect(result.shouldToggle).toBe(false);
    });
  });

  describe('computeSelection - multiple mode', () => {
    const items = [
      new MockElement('1', true),
      new MockElement('2', true),
      new MockElement('3', false),
    ];

    it('should toggle selection in multiple mode', () => {
      const result = computeSelection(
        items[2],
        items,
        [items[0], items[1]],
        items[1],
        { multiple: true }
      );

      expect(result.itemToSelect).toBe(items[2]);
      expect(result.itemsToDeselect).toEqual([]);
      expect(result.shouldToggle).toBe(true);
      expect(result.newFocusTarget).toBe(items[1]);
    });

    it('should preserve current focus', () => {
      const result = computeSelection(
        items[0],
        items,
        [items[0], items[1]],
        items[2],
        { multiple: true }
      );

      expect(result.newFocusTarget).toBe(items[2]);
    });
  });
});
