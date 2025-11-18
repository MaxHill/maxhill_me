import { expect } from "@esm-bundle/chai";

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
      expect(items).to.have.lengthOf(3);
    });

    it('should filter items using skip selector', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <m-option value="1">One</m-option>
        <m-option value="2" class="skip">Two</m-option>
        <m-option value="3">Three</m-option>
      `;
      const items = getItems(container, '.skip');
      expect(items).to.have.lengthOf(2);
    });

    it('should return empty array for no items', () => {
      const container = document.createElement('div');
      const items = getItems(container);
      expect(items).to.have.lengthOf(0);
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
      expect(selected).to.have.lengthOf(2);
      expect(selected[0].value).to.equal('2');
      expect(selected[1].value).to.equal('3');
    });

    it('should return empty array when nothing selected', () => {
      const items = [
        new MockElement('1', false),
        new MockElement('2', false),
      ];
      const selected = getSelectedItems(items);
      expect(selected).to.have.lengthOf(0);
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
      expect(values).to.deep.equal(['2', '3']);
    });

    it('should skip items without values', () => {
      const items: OptionLike[] = [
        { selected: true },
        { selected: true, value: '2' },
      ];
      const values = getSelectedValues(items);
      expect(values).to.deep.equal(['2']);
    });

    it('should return empty array when nothing selected', () => {
      const items = [
        new MockElement('1', false),
        new MockElement('2', false),
      ];
      const values = getSelectedValues(items);
      expect(values).to.deep.equal([]);
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
      expect(first?.value).to.equal('1');
    });

    it('should return null for empty list', () => {
      const first = focusFirst([]);
      expect(first).to.be.null;
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
      expect(last?.value).to.equal('3');
    });

    it('should return null for empty list', () => {
      const last = focusLast([]);
      expect(last).to.be.null;
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
      expect(next?.value).to.equal('2');
    });

    it('should wrap to first item at end', () => {
      const next = focusNext(items, items[2]);
      expect(next?.value).to.equal('1');
    });

    it('should return first item when currentFocus is null', () => {
      const next = focusNext(items, null);
      expect(next?.value).to.equal('1');
    });

    it('should return null for empty list', () => {
      const next = focusNext([], null);
      expect(next).to.be.null;
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
      expect(prev?.value).to.equal('1');
    });

    it('should wrap to last item at beginning', () => {
      const prev = focusPrev(items, items[0]);
      expect(prev?.value).to.equal('3');
    });

    it('should return last item when currentFocus is null', () => {
      const prev = focusPrev(items, null);
      expect(prev?.value).to.equal('3');
    });

    it('should return null for empty list', () => {
      const prev = focusPrev([], null);
      expect(prev).to.be.null;
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

      expect(result.itemToSelect).to.equal(items[1]);
      expect(result.itemsToDeselect).to.deep.equal([items[0]]);
      expect(result.shouldToggle).to.equal(false);
      expect(result.newFocusTarget).to.equal(items[1]);
    });

    it('should have empty deselect list when nothing was selected', () => {
      const result = computeSelection(
        items[1],
        items,
        [],
        null,
        { multiple: false }
      );

      expect(result.itemToSelect).to.equal(items[1]);
      expect(result.itemsToDeselect).to.deep.equal([]);
      expect(result.shouldToggle).to.equal(false);
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

      expect(result.itemToSelect).to.equal(items[2]);
      expect(result.itemsToDeselect).to.deep.equal([]);
      expect(result.shouldToggle).to.equal(true);
      expect(result.newFocusTarget).to.equal(items[1]);
    });

    it('should preserve current focus', () => {
      const result = computeSelection(
        items[0],
        items,
        [items[0], items[1]],
        items[2],
        { multiple: true }
      );

      expect(result.newFocusTarget).to.equal(items[2]);
    });
  });
});
