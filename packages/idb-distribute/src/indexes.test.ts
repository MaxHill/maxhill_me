import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  above,
  below,
  between,
  calculateBounds,
  exact,
  type QueryCondition,
  queryToIDBRange,
} from "./indexes.ts";

//  ------------------------------------------------------------------------
//  Fast-Check Generators
//  ------------------------------------------------------------------------

const generateTableName = (): fc.Arbitrary<string> =>
  fc.constantFrom("users", "posts", "comments", "orders");

// Generate valid IDBValidKey values (number, string, or Date)
const generateIDBValidKey = (): fc.Arbitrary<IDBValidKey> =>
  fc.oneof(
    fc.integer({ min: -1000000, max: 1000000 }),
    fc.string({ minLength: 0, maxLength: 100 }),
    fc.date({ min: new Date(0), max: new Date(2100, 0, 1) }),
  );

// Generate number keys specifically
const generateNumberKey = (): fc.Arbitrary<number> => fc.integer({ min: -1000000, max: 1000000 });

// Generate string keys specifically
const generateStringKey = (): fc.Arbitrary<string> => fc.string({ minLength: 0, maxLength: 100 });

// Generate date keys specifically
const generateDateKey = (): fc.Arbitrary<Date> =>
  fc.date({ min: new Date(0), max: new Date(2100, 0, 1) }).filter((d) => !isNaN(d.getTime()));

// Generate QueryExact
const generateQueryExact = (): fc.Arbitrary<QueryCondition> =>
  generateIDBValidKey().map((value) => exact(value));

// Generate QueryAbove
const generateQueryAbove = (): fc.Arbitrary<QueryCondition> =>
  generateIDBValidKey().map((value) => above(value, { inclusive: true }));

// Generate QueryBelow
const generateQueryBelow = (): fc.Arbitrary<QueryCondition> =>
  fc
    .tuple(generateIDBValidKey(), fc.boolean())
    .map(([value, inclusive]) => below(value, { inclusive }));

// Generate QueryBetween with properly ordered values
const generateQueryBetween = (): fc.Arbitrary<QueryCondition> =>
  fc
    .oneof(
      // Number range
      fc
        .tuple(generateNumberKey(), generateNumberKey(), fc.boolean(), fc.boolean())
        .map(([v1, v2, inclLower, inclUpper]) => {
          const [lower, upper] = v1 <= v2 ? [v1, v2] : [v2, v1];
          return between(lower, upper, {
            inclusiveLower: inclLower,
            inclusiveUpper: inclUpper,
          });
        }),
      // String range
      fc
        .tuple(generateStringKey(), generateStringKey(), fc.boolean(), fc.boolean())
        .map(([v1, v2, inclLower, inclUpper]) => {
          const [lower, upper] = v1 <= v2 ? [v1, v2] : [v2, v1];
          return between(lower, upper, {
            inclusiveLower: inclLower,
            inclusiveUpper: inclUpper,
          });
        }),
      // Date range
      fc
        .tuple(generateDateKey(), generateDateKey(), fc.boolean(), fc.boolean())
        .map(([v1, v2, inclLower, inclUpper]) => {
          const [lower, upper] = v1 <= v2 ? [v1, v2] : [v2, v1];
          return between(lower, upper, {
            inclusiveLower: inclLower,
            inclusiveUpper: inclUpper,
          });
        }),
    );

// Generate any query payload
const generateQueryPayload = (): fc.Arbitrary<QueryCondition> =>
  fc.oneof(
    generateQueryExact(),
    generateQueryAbove(),
    generateQueryBelow(),
    generateQueryBetween(),
  );

//  ------------------------------------------------------------------------
//  Helper Functions
//  ------------------------------------------------------------------------

// Extract the value from a query for bounds calculation
function getQueryValue(query: QueryCondition): IDBValidKey {
  if (query.type === "exact" || query.type === "above" || query.type === "below") {
    return query.value;
  } else {
    // For "between", use lowerValue as the sample
    return query.lowerValue;
  }
}

// Check if a query would create a valid IDBKeyRange
// Returns true if valid, false if it would throw
function isValidQuery(query: QueryCondition): boolean {
  try {
    // Check for invalid dates
    const value = getQueryValue(query);
    if (value instanceof Date && isNaN(value.getTime())) {
      return false;
    }

    if (query.type === "between") {
      if (query.upperValue instanceof Date && isNaN((query.upperValue as Date).getTime())) {
        return false;
      }
      // IDBKeyRange throws if lower === upper and either bound is open (exclusive)
      // For Date objects, compare the time values
      const lowerValue = query.lowerValue instanceof Date
        ? query.lowerValue.getTime()
        : query.lowerValue;
      const upperValue = query.upperValue instanceof Date
        ? query.upperValue.getTime()
        : query.upperValue;

      if (
        lowerValue === upperValue &&
        (!query.options.inclusiveLower || !query.options.inclusiveUpper)
      ) {
        return false;
      }
    }

    if (query.type === "below") {
      const bounds = calculateBounds(query.value);
      // IDBKeyRange throws if bounds.min === value and upper is open (exclusive)
      if (bounds.min === query.value && !query.options.inclusive) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

//  ------------------------------------------------------------------------
//  Property Tests
//  ------------------------------------------------------------------------

describe("queryToIDBRange property tests", () => {
  it("should always return a valid IDBKeyRange", () => {
    fc.assert(
      fc.property(generateTableName(), generateQueryPayload(), (table, query) => {
        fc.pre(isValidQuery(query)); // Skip invalid queries
        const range = queryToIDBRange(table, query);
        expect(range).toBeInstanceOf(IDBKeyRange);
      }),
    );
  });

  it("exact query should create a range with only one value", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateIDBValidKey(),
        (table, value) => {
          fc.pre(!(value instanceof Date) || !isNaN(value.getTime())); // Skip invalid dates
          const query = exact(value);
          const range = queryToIDBRange(table, query);

          // For IDBKeyRange.only, lower and upper are the same
          expect(range.lower).toEqual([table, value]);
          expect(range.upper).toEqual([table, value]);
          expect(range.lowerOpen).toBe(false);
          expect(range.upperOpen).toBe(false);
        },
      ),
    );
  });

  it("above query should have lower bound set to query value", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateIDBValidKey(),
        (table, value) => {
          fc.pre(!(value instanceof Date) || !isNaN(value.getTime())); // Skip invalid dates
          const query = above(value, { inclusive: true });
          const range = queryToIDBRange(table, query);

          expect(range.lower).toEqual([table, value]);
          // Lower bound inclusivity should match query options
          expect(range.lowerOpen).toBe(!query.options.inclusive);
        },
      ),
    );
  });

  it("below query should have upper bound set to query value", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateIDBValidKey(),
        fc.boolean(),
        (table, value, inclusive) => {
          const query = below(value, { inclusive });
          fc.pre(isValidQuery(query)); // Skip invalid queries

          const range = queryToIDBRange(table, query);

          expect(range.upper).toEqual([table, value]);
          // Upper bound inclusivity should match query options
          expect(range.upperOpen).toBe(!query.options.inclusive);
        },
      ),
    );
  });

  it("between query should have both bounds set correctly", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateQueryBetween(),
        (table, query) => {
          if (query.type !== "between") return; // Type guard
          fc.pre(isValidQuery(query)); // Skip invalid queries

          const range = queryToIDBRange(table, query);

          expect(range.lower).toEqual([table, query.lowerValue]);
          expect(range.upper).toEqual([table, query.upperValue]);
          expect(range.lowerOpen).toBe(!query.options.inclusiveLower);
          expect(range.upperOpen).toBe(!query.options.inclusiveUpper);
        },
      ),
    );
  });

  it("should always include table name in range bounds", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateQueryPayload(),
        (table, query) => {
          fc.pre(isValidQuery(query)); // Skip invalid queries
          const range = queryToIDBRange(table, query);

          // Both lower and upper bounds should be arrays starting with table name
          expect(Array.isArray(range.lower)).toBe(true);
          expect(Array.isArray(range.upper)).toBe(true);
          expect(range.lower[0]).toBe(table);
          expect(range.upper[0]).toBe(table);
        },
      ),
    );
  });

  it("should preserve value type in the range", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateQueryPayload(),
        (table, query) => {
          fc.pre(isValidQuery(query)); // Skip invalid queries

          const range = queryToIDBRange(table, query);
          const queryValue = getQueryValue(query);

          // Check that the type is preserved in the range bounds
          if (query.type === "exact") {
            expect(typeof range.lower[1]).toBe(typeof queryValue);
          } else if (query.type === "above") {
            expect(typeof range.lower[1]).toBe(typeof queryValue);
          } else if (query.type === "below") {
            expect(typeof range.upper[1]).toBe(typeof queryValue);
          } else if (query.type === "between") {
            expect(typeof range.lower[1]).toBe(typeof query.lowerValue);
            expect(typeof range.upper[1]).toBe(typeof query.upperValue);
          }
        },
      ),
    );
  });

  it("should throw for between queries with same bounds and both exclusive", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateIDBValidKey(),
        (table, value) => {
          fc.pre(isValidQuery(exact(value))); // Skip invalid values like NaN dates

          const query = between(value, value, {
            inclusiveLower: false,
            inclusiveUpper: false,
          });

          expect(() => queryToIDBRange(table, query)).toThrow(
            /Cannot create a range where lower and upper bounds are equal.*with any bound exclusive/,
          );
        },
      ),
    );
  });

  it("should throw for between queries with same bounds and one exclusive", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        generateIDBValidKey(),
        fc.boolean(),
        (table, value, exclusiveIsLower) => {
          fc.pre(isValidQuery(exact(value))); // Skip invalid values like NaN dates

          const query = between(value, value, {
            inclusiveLower: !exclusiveIsLower,
            inclusiveUpper: exclusiveIsLower,
          });

          expect(() => queryToIDBRange(table, query)).toThrow(
            /Cannot create a range where lower and upper bounds are equal.*with any bound exclusive/,
          );
        },
      ),
    );
  });

  it("should throw for below queries when value equals min bound with exclusive", () => {
    fc.assert(
      fc.property(
        generateTableName(),
        fc.oneof(
          fc.constant(""), // min for strings
          fc.constant(Number.MIN_SAFE_INTEGER), // min for numbers
        ),
        (table, minValue) => {
          const query = below(minValue, { inclusive: false });

          expect(() => queryToIDBRange(table, query)).toThrow(
            /Cannot create a range where lower and upper bounds are equal.*with any bound exclusive/,
          );
        },
      ),
    );
  });
});

//  ------------------------------------------------------------------------
//  Unit Tests for Edge Cases
//  ------------------------------------------------------------------------

describe("queryToIDBRange edge cases", () => {
  it("should handle empty strings", () => {
    const query = exact("");
    const range = queryToIDBRange("users", query);
    expect(range.lower).toEqual(["users", ""]);
  });

  it("should handle negative numbers", () => {
    const query = exact(-999999);
    const range = queryToIDBRange("users", query);
    expect(range.lower).toEqual(["users", -999999]);
  });

  it("should handle zero", () => {
    const query = exact(0);
    const range = queryToIDBRange("users", query);
    expect(range.lower).toEqual(["users", 0]);
  });

  it("should handle dates at epoch", () => {
    const date = new Date(0);
    const query = exact(date);
    const range = queryToIDBRange("users", query);
    expect(range.lower).toEqual(["users", date]);
  });

  it("should handle between with same lower and upper values", () => {
    const query = between(100, 100, {
      inclusiveLower: true,
      inclusiveUpper: true,
    });
    const range = queryToIDBRange("users", query);
    expect(range.lower).toEqual(["users", 100]);
    expect(range.upper).toEqual(["users", 100]);
    expect(range.lowerOpen).toBe(false);
    expect(range.upperOpen).toBe(false);
  });

  it("should throw for invalid range: same bounds with both open (between)", () => {
    const query = between(100, 100, {
      inclusiveLower: false,
      inclusiveUpper: false,
    });
    expect(() => queryToIDBRange("users", query)).toThrow(
      /Cannot create a range where lower and upper bounds are equal.*with any bound exclusive/,
    );
  });

  it("should throw for invalid range: empty string below with exclusive", () => {
    const query = below("", { inclusive: false });
    // This creates a range from "" to "" which is invalid when exclusive
    expect(() => queryToIDBRange("users", query)).toThrow(
      /Cannot create a range where lower and upper bounds are equal.*with any bound exclusive/,
    );
  });

  it("should throw for invalid range: same date bounds with both exclusive (between)", () => {
    const date = new Date(2020, 0, 1);
    const query = between(date, date, {
      inclusiveLower: false,
      inclusiveUpper: false,
    });
    expect(() => queryToIDBRange("users", query)).toThrow(
      /Cannot create a range where lower and upper bounds are equal.*with any bound exclusive/,
    );
  });

  it("should throw for invalid range: same bounds with one exclusive (between)", () => {
    const query = between(50, 50, {
      inclusiveLower: true, // one inclusive
      inclusiveUpper: false, // one exclusive
    });
    expect(() => queryToIDBRange("users", query)).toThrow(
      /Cannot create a range where lower and upper bounds are equal.*with any bound exclusive/,
    );
  });
});

//  ------------------------------------------------------------------------
//  calculateBounds Tests
//  ------------------------------------------------------------------------

describe("calculateBounds", () => {
  it("should return number bounds for number values", () => {
    fc.assert(
      fc.property(generateNumberKey(), (num) => {
        const bounds = calculateBounds(num);
        expect(typeof bounds.min).toBe("number");
        expect(typeof bounds.max).toBe("number");
        expect(bounds.min).toBe(Number.MIN_SAFE_INTEGER);
        expect(bounds.max).toBe(Number.MAX_SAFE_INTEGER);
      }),
    );
  });

  it("should return string bounds for string values", () => {
    fc.assert(
      fc.property(generateStringKey(), (str) => {
        const bounds = calculateBounds(str);
        expect(typeof bounds.min).toBe("string");
        expect(typeof bounds.max).toBe("string");
        expect(bounds.min).toBe("");
        expect((bounds.max as string).length).toBeGreaterThan(0);
      }),
    );
  });

  it("should return date bounds for date values", () => {
    fc.assert(
      fc.property(generateDateKey(), (date) => {
        const bounds = calculateBounds(date);
        expect(bounds.min).toBeInstanceOf(Date);
        expect(bounds.max).toBeInstanceOf(Date);
        expect((bounds.min as Date).getTime()).toBe(-8640000000000000);
        expect((bounds.max as Date).getTime()).toBe(8640000000000000);
      }),
    );
  });

  it("should throw error for array values", () => {
    expect(() => calculateBounds([])).toThrow("Cannot calculate bounds for Array values");
    expect(() => calculateBounds([1, 2, 3])).toThrow("Cannot calculate bounds for Array values");
  });
});
