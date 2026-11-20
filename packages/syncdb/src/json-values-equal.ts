/** Compare JSON values without serialization, coercion, or reference shortcuts. */
export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  return compareValues(left, right, new Set(), new Set());
}

function compareValues(
  left: unknown,
  right: unknown,
  leftAncestors: Set<object>,
  rightAncestors: Set<object>,
): boolean {
  if (typeof left === "number") {
    return Number.isFinite(left) && typeof right === "number" && left === right;
  }
  if (left === null || typeof left === "string" || typeof left === "boolean") {
    return left === right;
  }
  if (!isJsonContainer(left) || !isJsonContainer(right)) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right) ||
      leftAncestors.has(left) || rightAncestors.has(right)) {
    return false;
  }
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  leftAncestors.add(left);
  rightAncestors.add(right);
  try {
    return keys.every((key) => {
      const leftProperty = Object.getOwnPropertyDescriptor(left, key)!;
      const rightProperty = Object.getOwnPropertyDescriptor(right, key);
      return rightProperty !== undefined && rightProperty.enumerable === true &&
        "value" in leftProperty && "value" in rightProperty &&
        compareValues(leftProperty.value, rightProperty.value, leftAncestors, rightAncestors);
    });
  } finally {
    leftAncestors.delete(left);
    rightAncestors.delete(right);
  }
}

function isJsonContainer(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) {
      return false;
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        return false;
      }
    }
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
