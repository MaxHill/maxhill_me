import { MElement } from "./m-element";
import { BindAttribute } from "./reflect-attribute";
import type { MOption } from "../m-option";
import {
  getItems,
  getSelectedItems,
  getSelectedValues,
  focusFirst,
  focusLast,
  focusNext,
  focusPrev,
  computeSelection,
  type SelectionResult
} from "./list-options-manager";


// TODO: Add required and minimum validation
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

  get items(): MOption[] {
    return getItems<MOption>(this, this.getItemsSkipSelector());
  }

  get selectedItems(): MOption[] {
    return getSelectedItems(this.items);
  }

  get selectedValues(): string[] {
    return getSelectedValues(this.items);
  }

  get value(): string | string[] | null {
    if (this.multiple) return this.selectedValues;
    return this.selectedItems[0]?.value ?? null;
  }

  /*** ----------------------------
   *  Focus Management
   * ----------------------------- */
  setFocus(item: MOption | null): void {
    if (!item) return;
    if (this.focusedElement) this.focusedElement.removeAttribute('focused');

    item.focused = true;
    this.focusedElement = item;
  }

  focusFirst(): void {
    this.setFocus(focusFirst(this.items));
  }

  focusLast(): void {
    this.setFocus(focusLast(this.items));
  }

  focusNext(): void {
    const next = focusNext(this.items, this.focusedElement);
    this.setFocus(next);
  }

  focusPrev(): void {
    this.setFocus(focusPrev(this.items, this.focusedElement));
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
    const first = focusFirst(this.items);
    if (first) this.select(first);
  }

  selectLast(): void {
    const last = focusLast(this.items);
    if (last) this.select(last);
  }

  selectNext(): void {
    const next = focusNext(this.items, this.focusedElement);
    if (next) this.select(next);
  }

  selectPrev(): void {
    const prev = focusPrev(this.items, this.focusedElement);
    if (prev) this.select(prev);
  }

  protected computeSelection(item: MOption): SelectionResult<MOption> {
    return computeSelection(
      item,
      this.items,
      this.selectedItems,
      this.focusedElement,
      { multiple: this.multiple }
    );
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
