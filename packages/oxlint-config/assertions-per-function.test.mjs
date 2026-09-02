import assert from 'node:assert/strict';
import { countAssertionsInFunction } from './assertions-per-function-plugin.js';

const identifier = (name) => ({ type: 'Identifier', name });
const call = (name, args = []) => ({
  type: 'CallExpression',
  callee: identifier(name),
  arguments: args,
});
const expressionStatement = (expression) => ({
  type: 'ExpressionStatement',
  expression,
});
const block = (body) => ({ type: 'BlockStatement', body });
const functionDeclaration = (name, body, extra = {}) => ({
  type: 'FunctionDeclaration',
  id: identifier(name),
  params: [],
  body: block(body),
  ...extra,
});
const functionExpression = (name, body, extra = {}) => ({
  type: 'FunctionExpression',
  id: name ? identifier(name) : null,
  params: [],
  body: block(body),
  ...extra,
});
const arrowFunctionExpression = (body, extra = {}) => ({
  type: 'ArrowFunctionExpression',
  params: [],
  body: block(body),
  expression: false,
  ...extra,
});

assert.equal(
  countAssertionsInFunction(functionDeclaration('zero', []), ['assert']),
  0,
  'counts zero assertions in function declarations',
);

assert.equal(
  countAssertionsInFunction(
    functionDeclaration('one', [expressionStatement(call('assert'))]),
    ['assert'],
  ),
  1,
  'counts one assertion in function declarations',
);

assert.equal(
  countAssertionsInFunction(
    functionExpression('two', [
      expressionStatement(call('assert')),
      expressionStatement(call('assert')),
    ]),
    ['assert'],
  ),
  2,
  'counts assertions in function expressions',
);

assert.equal(
  countAssertionsInFunction(
    arrowFunctionExpression([
      expressionStatement(call('assert')),
      expressionStatement(call('assert')),
      expressionStatement(call('assert')),
    ]),
    ['assert'],
  ),
  3,
  'counts assertions in arrow functions',
);

assert.equal(
  countAssertionsInFunction(
    functionDeclaration('asyncFn', [
      expressionStatement(call('assert')),
      expressionStatement(call('assert')),
    ], { async: true }),
    ['assert'],
  ),
  2,
  'counts assertions in async functions',
);

assert.equal(
  countAssertionsInFunction(
    functionDeclaration('generatorFn', [
      expressionStatement(call('assert')),
      expressionStatement(call('assert')),
    ], { generator: true }),
    ['assert'],
  ),
  2,
  'counts assertions in generator functions',
);

assert.equal(
  countAssertionsInFunction(
    functionDeclaration('outer', [
      expressionStatement(call('assert')),
      functionDeclaration('inner', [
        expressionStatement(call('assert')),
        expressionStatement(call('assert')),
      ]),
    ]),
    ['assert'],
  ),
  1,
  'does not count assertions from nested functions',
);

assert.equal(
  countAssertionsInFunction(
    functionDeclaration('custom', [
      expressionStatement(call('invariant')),
      expressionStatement(call('assert')),
    ]),
    ['assert', 'invariant'],
  ),
  2,
  'counts all configured assertion functions',
);

console.log('assertions-per-function plugin ok');
