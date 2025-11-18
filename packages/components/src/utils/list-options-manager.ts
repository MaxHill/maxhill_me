export interface OptionLike {
  selected?: boolean;
  value?: string;
  disabled?: boolean;
}

export interface SelectionResult<T> {
  itemToSelect: T;
  itemsToDeselect: T[];
  shouldToggle: boolean;
  newFocusTarget: T | null;
}

export function getItems<T extends Element>(
  host: Element,
  skipSelector?: string
): T[] {
  const selector = skipSelector ? `m-option:not(${skipSelector})` : 'm-option';
  return Array.from(host.querySelectorAll(selector)) as T[];
}

export function getSelectedItems<T extends OptionLike>(
  items: T[]
): T[] {
  return items.filter(item => !!item.selected);
}

export function getSelectedValues(
  items: OptionLike[]
): string[] {
  return items.reduce<string[]>((acc, item) => {
    if (item.selected && item.value) {
      acc.push(item.value);
    }
    return acc;
  }, []);
}

export function focusFirst<T>(items: T[]): T | null {
  return items[0] ?? null;
}

export function focusLast<T>(items: T[]): T | null {
  return items[items.length - 1] ?? null;
}

export function focusNext<T>(items: T[], currentFocus: T | null): T | null {
  if (!currentFocus) return focusFirst(items);
  const idx = items.indexOf(currentFocus);
  return items[idx + 1] ?? items[0] ?? null;
}

export function focusPrev<T>(items: T[], currentFocus: T | null): T | null {
  if (!currentFocus) return focusLast(items);
  const idx = items.indexOf(currentFocus);
  return items[idx - 1] ?? items[items.length - 1] ?? null;
}

export function computeSelection<T extends OptionLike>(
  item: T,
  allItems: T[],
  currentSelection: T[],
  currentFocus: T | null,
  options: { multiple: boolean }
): SelectionResult<T> {
  if (!options.multiple) {
    const itemsToDeselect = currentSelection.filter(i => i !== item);
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
      newFocusTarget: currentFocus,
    };
  }
}
