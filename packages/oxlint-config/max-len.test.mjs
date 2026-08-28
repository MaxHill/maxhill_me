import assert from 'node:assert/strict';
import { findTooLongLines } from './max-len-plugin.js';

assert.deepEqual(findTooLongLines('a'.repeat(100)), []);
assert.equal(findTooLongLines('a'.repeat(101)).length, 1);
assert.deepEqual(
  findTooLongLines(`const url = 'https://example.com/${'a'.repeat(200)}';`),
  [],
);
assert.equal(findTooLongLines('\t'.repeat(51)).length, 1);

console.log('max-len plugin ok');
