import assert from 'node:assert/strict';
import plugin, { findAbbreviationViolation } from './no-abbreviations-plugin.js';

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

// Object prototype names are not entries in the abbreviation dictionary.
assert.equal(findAbbreviationViolation('constructor'), null);
assert.equal(findAbbreviationViolation('toString'), null);
assert.equal(findAbbreviationViolation('__proto__'), null);
assert.equal(findAbbreviationViolation('user'), null);
assert.equal(findAbbreviationViolation('requestId'), null);

assert.deepEqual(
  findAbbreviationViolation('cfg', { cfg: 'config', msg: 'message' }),
  { abbreviation: 'cfg', replacement: 'config' },
);

// External API keys are not bindings, but shorthand and computed keys still are.
const reports = [];
const visitor = plugin.rules['no-abbreviations'].create({
  options: [],
  report: (report) => reports.push(report),
});
function identifier(name, parent) {
  const node = { type: 'Identifier', name, parent };
  if (parent.type === 'MemberExpression') parent.property = node;
  else parent.key = node;
  visitor.Identifier(node);
}
identifier('err', { type: 'MemberExpression', computed: false });
identifier('params', { type: 'Property', computed: false, shorthand: false });
identifier('constructor', { type: 'MethodDefinition', computed: false });
assert.equal(reports.length, 0);
identifier('err', { type: 'Property', computed: false, shorthand: true });
identifier('params', { type: 'MemberExpression', computed: true });
visitor.Identifier({ type: 'Identifier', name: 'arg' });
assert.deepEqual(reports.map((report) => report.data.abbreviation), ['err', 'params', 'arg']);

console.log('no-abbreviations plugin ok');
