import assert from 'node:assert/strict';
import { findAbbreviationViolation } from './no-abbreviations-plugin.js';

assert.deepEqual(findAbbreviationViolation('arg'), {
  abbreviation: 'arg',
  replacement: 'argument',
});

assert.deepEqual(findAbbreviationViolation('Arg'), {
  abbreviation: 'Arg',
  replacement: 'argument',
});

assert.deepEqual(findAbbreviationViolation('TMP'), {
  abbreviation: 'TMP',
  replacement: 'temporary',
});

assert.equal(findAbbreviationViolation('user'), null);
assert.equal(findAbbreviationViolation('requestId'), null);

assert.deepEqual(
  findAbbreviationViolation('cfg', { cfg: 'config', msg: 'message' }),
  { abbreviation: 'cfg', replacement: 'config' },
);

console.log('no-abbreviations plugin ok');
