import { MElement } from "./m-element";
import { BindAttribute } from "./reflect-attribute";
import type { MOption } from "../m-option";

interface OptionLike {
  selected?: boolean;
  value?: string;
  disabled?: boolean;
}

interface SelectionResult<T> {
  itemToSelect: T;
  itemsToDeselect: T[];
  shouldToggle: boolean;
  newFocusTarget: T | null;
}

export abstract class MInputListElement extends MElement {
  @BindAttribute()
  disabled: boolean = false;

  @BindAttribute()
  multiple: boolean = false;

  private _focusedElement: MOption | null = null;

  set focusedElement(el: MOption | null) {
    if (this._focusedElement) {
      this._focusedElement.focused = false;
    }

    this._focusedElement = el;

    if (el) {
      el.focused = true;
      this.setAttribute("aria-activedescendant", el.id);
    } else {
      this.removeAttribute("aria-activedescendant");
    }
  }

  get focusedElement() { return this._focusedElement; }

  protected abstract getItemsSkipSelector(): string | undefined;

  private getItems(): MOption[] {
    const baseSelector = "m-option:not([hidden]):not([disabled])";
    const skipSelector = this.getItemsSkipSelector();
    const selector = skipSelector ? `${baseSelector}:not(${skipSelector})` : baseSelector;
    return Array.from(this.querySelectorAll(selector)) as MOption[];
  }

  private getSelectedItems(items: MOption[]): MOption[] {
    return items.filter(item => !!item.selected);
  }

  private getSelectedValues(items: OptionLike[]): string[] {
    return items.reduce<string[]>((acc, item) => {
      if (item.selected && item.value) {
        acc.push(item.value);
      }
      return acc;
    }, []);
  }

  get items(): MOption[] {
    return this.getItems();
  }

  get selectedItems(): MOption[] {
    return this.getSelectedItems(this.items);
  }

  get selectedValues(): string[] {
    return this.getSelectedValues(this.items);
  }

  get value(): string | string[] | null {
    if (this.multiple) return this.selectedValues;
    return this.selectedItems[0]?.value ?? null;
  }

  /*** ----------------------------
   *  Focus Management
   * ----------------------------- */
  private focusFirstItem(items: MOption[]): MOption | null {
    return items[0] ?? null;
  }

  private focusLastItem(items: MOption[]): MOption | null {
    return items[items.length - 1] ?? null;
  }

  private focusNextItem(items: MOption[], currentFocus: MOption | null): MOption | null {
    if (!currentFocus) return this.focusFirstItem(items);
    const idx = items.indexOf(currentFocus);
    return items[idx + 1] ?? items[0] ?? null;
  }

  private focusPrevItem(items: MOption[], currentFocus: MOption | null): MOption | null {
    if (!currentFocus) return this.focusLastItem(items);
    const idx = items.indexOf(currentFocus);
    return items[idx - 1] ?? items[items.length - 1] ?? null;
  }

  setFocus(item: MOption | null): void {
    if (!item) return;
    if (this.focusedElement) this.focusedElement.removeAttribute('focused');

    item.focused = true;
    this.focusedElement = item;
  }

  focusFirst(): void {
    this.setFocus(this.focusFirstItem(this.items));
  }

  focusLast(): void {
    this.setFocus(this.focusLastItem(this.items));
  }

  focusNext(): void {
    const next = this.focusNextItem(this.items, this.focusedElement);
    this.setFocus(next);
  }

  focusPrev(): void {
    this.setFocus(this.focusPrevItem(this.items, this.focusedElement));
  }

  focusBlur(): void {
    if (this.focusedElement) {
      this.focusedElement.removeAttribute('focused');
      this.focusedElement = null;
    }
  }

  /*** ----------------------------
   *  Selection Management
   * ----------------------------- */
  protected computeSelection(item: MOption): SelectionResult<MOption> {
    if (!this.multiple) {
      const itemsToDeselect = this.selectedItems.filter(i => i !== item);
      return {
        itemToSelect: item,
        itemsToDeselect,
        shouldToggle: false,
        newFocusTarget: item,
      };
    } else {
      return {
        itemToSelect: item,
        itemsToDeselect: [],
        shouldToggle: true,
        newFocusTarget: this.focusedElement,
      };
    }
  }

  select(item: MOption): void {
    if (!item) return;

    const result = this.computeSelection(item);

    result.itemsToDeselect.forEach(i => {
      i.selected = false;
    });

    if (result.shouldToggle) {
      item.selected = !item.selected;
    } else {
      item.selected = true;
      if (result.newFocusTarget) {
        this.setFocus(result.newFocusTarget);
      }
    }
  }

  selectFocused(): void {
    if (this.focusedElement) this.select(this.focusedElement);
  }

  selectFirst(): void {
    const first = this.focusFirstItem(this.items);
    if (first) this.select(first);
  }

  selectLast(): void {
    const last = this.focusLastItem(this.items);
    if (last) this.select(last);
  }

  selectNext(): void {
    const next = this.focusNextItem(this.items, this.focusedElement);
    if (next) this.select(next);
  }

  selectPrev(): void {
    const prev = this.focusPrevItem(this.items, this.focusedElement);
    if (prev) this.select(prev);
  }

  /*** ----------------------------
   *  Event Handlers
   * ----------------------------- */
  handleMouseOver = (event: MouseEvent) => {
    const item = event
      .composedPath()
      .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
      | MOption
      | undefined;

    if (item && !item.disabled && this.focusedElement !== item) {
      this.setFocus(item);
    }
  };

  handleMouseOut = (event: MouseEvent) => {
    const item = event
      .composedPath()
      .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
      | MOption
      | undefined;

    if (item && !item.disabled && this.focusedElement === item) {
      this.focusBlur();
    }
  };
}
