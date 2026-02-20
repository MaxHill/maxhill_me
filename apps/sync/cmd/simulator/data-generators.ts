/**
 * Data generators using fast-check for property-based test data generation.
 * This bridges seedrandom (used by the simulator) with fast-check's arbitraries.
 */

// @deno-types="npm:@types/seedrandom@^3.0.8"
import type seedrandom from "seedrandom";
import fc from "fast-check";

//  ------------------------------------------------------------------------
//  Bridge seedrandom and fast-check
//  ------------------------------------------------------------------------

/**
 * Generate a value from a fast-check arbitrary using seedrandom.
 * We use fc.sample() with a seed derived from the PRNG to ensure determinism.
 */
export function generate<T>(
  prng: seedrandom.PRNG,
  arbitrary: fc.Arbitrary<T>,
): T {
  // Convert seedrandom's output to an integer seed for fast-check
  const seed = Math.floor(prng() * 0x7FFFFFFF);
  
  // Generate a single sample with the seed
  const samples = fc.sample(arbitrary, { numRuns: 1, seed });
  return samples[0];
}

//  ------------------------------------------------------------------------
//  String generators
//  ------------------------------------------------------------------------

/**
 * Generate a random string (ASCII, 0-100 chars).
 */
export function randomString(prng: seedrandom.PRNG): string {
  return generate(prng, fc.string({ maxLength: 100 }));
}

/**
 * Generate a random Unicode string with emoji and international characters.
 */
export function randomUnicodeString(prng: seedrandom.PRNG): string {
  return generate(prng, fc.fullUnicodeString({ maxLength: 100 }));
}

/**
 * Generate a random email address.
 */
export function randomEmail(prng: seedrandom.PRNG): string {
  return generate(prng, fc.emailAddress());
}

/**
 * Generate a random person name (3-30 chars, letters and spaces).
 */
export function randomName(prng: seedrandom.PRNG): string {
  const arbitrary = fc.oneof(
    fc.stringMatching(/^[A-Z][a-z]{2,15}$/), // First name
    fc.stringMatching(/^[A-Z][a-z]{2,15} [A-Z][a-z]{2,15}$/), // Full name
  );
  return generate(prng, arbitrary);
}

/**
 * Generate random content text (lorem ipsum style, 10-500 chars).
 */
export function randomContent(prng: seedrandom.PRNG): string {
  return generate(prng, fc.lorem({ maxCount: 10 }));
}

/**
 * Generate a random short text (5-50 chars, good for titles).
 */
export function randomTitle(prng: seedrandom.PRNG): string {
  return generate(prng, fc.string({ minLength: 5, maxLength: 50 }));
}

//  ------------------------------------------------------------------------
//  Number generators
//  ------------------------------------------------------------------------

/**
 * Generate a random integer (can be negative).
 */
export function randomInt(prng: seedrandom.PRNG): number {
  return generate(prng, fc.integer());
}

/**
 * Generate a random natural number (0 or positive).
 */
export function randomNat(
  prng: seedrandom.PRNG,
  max: number = 1000000,
): number {
  return generate(prng, fc.nat({ max }));
}

/**
 * Generate a random float.
 */
export function randomFloat(prng: seedrandom.PRNG): number {
  return generate(prng, fc.float());
}

/**
 * Generate a random timestamp (milliseconds since epoch).
 */
export function randomTimestamp(prng: seedrandom.PRNG): number {
  // Generate timestamps within the last 5 years
  const fiveYearsAgo = Date.now() - 5 * 365 * 24 * 60 * 60 * 1000;
  return generate(prng, fc.integer({ min: fiveYearsAgo, max: Date.now() }));
}

//  ------------------------------------------------------------------------
//  Boolean generators
//  ------------------------------------------------------------------------

/**
 * Generate a random boolean.
 */
export function randomBoolean(prng: seedrandom.PRNG): boolean {
  return generate(prng, fc.boolean());
}

//  ------------------------------------------------------------------------
//  Complex type generators
//  ------------------------------------------------------------------------

/**
 * Generate random JSON-serializable value (string, number, boolean, array, object).
 */
export function randomJson(prng: seedrandom.PRNG, maxDepth: number = 2): any {
  return generate(prng, fc.jsonValue({ maxDepth }));
}

/**
 * Generate a random object with string keys and JSON values.
 */
export function randomObject(
  prng: seedrandom.PRNG,
  maxDepth: number = 2,
): Record<string, any> {
  const arbitrary = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.jsonValue({ maxDepth }),
    { maxKeys: 10 },
  );
  return generate(prng, arbitrary);
}

/**
 * Generate a random array of strings.
 */
export function randomStringArray(prng: seedrandom.PRNG): string[] {
  return generate(prng, fc.array(fc.string({ maxLength: 30 }), { maxLength: 5 }));
}

/**
 * Generate a random array of numbers.
 */
export function randomNumberArray(prng: seedrandom.PRNG): number[] {
  return generate(prng, fc.array(fc.integer(), { maxLength: 10 }));
}

//  ------------------------------------------------------------------------
//  Edge case generators
//  ------------------------------------------------------------------------

/**
 * Generate edge case strings that might expose bugs:
 * - Empty strings
 * - Whitespace-only
 * - Special characters
 * - Unicode/emoji
 * - Very long strings
 * - JSON-like strings
 */
export function randomEdgeString(prng: seedrandom.PRNG): string {
  const edgeCases = fc.oneof(
    fc.constant(""), // empty
    fc.constant(" "), // single space
    fc.constant("   "), // multiple spaces
    fc.constant("\n"), // newline
    fc.constant("\t"), // tab
    fc.constant("\n\r\t"), // multiple whitespace
    fc.constant("'"), // single quote
    fc.constant('"'), // double quote
    fc.constant("'\""), // both quotes
    fc.constant("{}"), // JSON-like
    fc.constant("[]"), // array-like
    fc.constant('{"key":"value"}'), // JSON string
    fc.constant("null"), // null string (not actual null)
    fc.constant("undefined"), // undefined string
    fc.constant("🎉🌟✨"), // emoji
    fc.constant("Hello 世界"), // mixed unicode
    fc.constant("Ñoño"), // accents
    fc.fullUnicodeString({ maxLength: 50 }), // full unicode
    fc.lorem({ maxCount: 100 }), // very long
    fc.string({ minLength: 1000, maxLength: 5000 }), // extremely long
  );
  return generate(prng, edgeCases);
}

/**
 * Generate edge case numbers that might expose bugs:
 * - Zero (positive and negative)
 * - One/-One
 * - Very large numbers
 * - Very small numbers
 * - Floats with precision issues
 */
export function randomEdgeNumber(prng: seedrandom.PRNG): number {
  const edgeCases = fc.oneof(
    fc.constant(0),
    fc.constant(-0),
    fc.constant(1),
    fc.constant(-1),
    fc.constant(Number.MAX_SAFE_INTEGER),
    fc.constant(Number.MIN_SAFE_INTEGER),
    fc.constant(Number.MAX_VALUE),
    fc.constant(Number.MIN_VALUE),
    fc.constant(0.0001),
    fc.constant(-0.0001),
    fc.constant(1e10),
    fc.constant(1e-10),
    fc.constant(3.14159265359),
    fc.constant(Math.PI),
    fc.constant(Math.E),
  );
  return generate(prng, edgeCases);
}

/**
 * Generate edge case booleans (always returns a boolean, but included for completeness).
 */
export function randomEdgeBoolean(prng: seedrandom.PRNG): boolean {
  return generate(prng, fc.boolean());
}

/**
 * Generate edge case objects with unusual structure:
 * - Empty objects
 * - Very deep nesting
 * - Many keys
 * - Mixed types
 */
export function randomEdgeObject(prng: seedrandom.PRNG): Record<string, any> {
  const edgeCases = fc.oneof(
    fc.constant({}), // empty object
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 5 }),
      fc.jsonValue({ maxDepth: 5 }),
      { maxKeys: 50 },
    ), // many keys
    fc.jsonValue({ maxDepth: 10 }), // very deep
  );
  return generate(prng, edgeCases) as Record<string, any>;
}
