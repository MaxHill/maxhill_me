/**
 * Type utilities for database schema definitions.
 * 
 * These types enable type-safe table and index name validation
 * throughout the database API.
 */

/**
 * Represents a database schema structure.
 * Maps table names to their index definitions.
 * 
 * @example
 * ```typescript
 * type MySchema = {
 *   users: {
 *     byAge: string[];
 *     byName: string[];
 *   };
 *   posts: {
 *     byAuthor: string[];
 *   };
 * }
 * ```
 */
export type DatabaseSchema = Record<string, Record<string, string[]>>;

/**
 * Default empty schema for untyped databases.
 * Used as a fallback when no schema is specified.
 */
export type EmptySchema = {};

/**
 * Extracts the index definitions for a specific table from a schema.
 * 
 * @example
 * ```typescript
 * type MySchema = { users: { byAge: string[]; byName: string[] } };
 * type UserIndexes = ExtractTableIndexes<MySchema, 'users'>;
 * // Result: { byAge: string[]; byName: string[] }
 * ```
 */
export type ExtractTableIndexes<
    TSchema extends DatabaseSchema,
    TTable extends keyof TSchema,
> = TSchema[TTable];

/**
 * Helper type for merging schema definitions.
 * Used by the builder to accumulate table definitions.
 */
export type MergeSchema<
    TExisting extends DatabaseSchema,
    TTable extends string,
    TIndexes extends Record<string, string[]>,
> = TExisting & Record<TTable, TIndexes>;
