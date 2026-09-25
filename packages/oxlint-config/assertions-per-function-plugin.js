const DEFAULT_OPTIONS = {
  minAssertions: 2,
  assertionFunctions: ['assert'],
};

function isFunctionNode(node) {
  return (
    node?.type === 'FunctionDeclaration'
    || node?.type === 'FunctionExpression'
    || node?.type === 'ArrowFunctionExpression'
  );
}

function getChildren(node) {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const children = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') {
      continue;
    }
    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === 'string') {
          children.push(item);
        }
      }
      continue;
    }

    if (typeof value.type === 'string') {
      children.push(value);
    }
  }

  return children;
}

function isAssertionName(name, assertionFunctions) {
  return assertionFunctions.includes(name) || name.startsWith('assert_');
}

function isDirectAssertionCall(node, assertionFunctions) {
  if (node?.type !== 'CallExpression') {
    return false;
  }

  if (node.callee?.type === 'Identifier') {
    return isAssertionName(node.callee.name, assertionFunctions);
  }

  if (node.callee?.type === 'MemberExpression' && !node.callee.computed) {
    return (
      node.callee.property?.type === 'Identifier'
      && isAssertionName(node.callee.property.name, assertionFunctions)
    );
  }

  return false;
}

export function countAssertionsInFunction(node, assertionFunctions) {
  function visit(currentNode, isRootFunction) {
    if (!currentNode || typeof currentNode !== 'object') {
      return 0;
    }

    if (!isRootFunction && isFunctionNode(currentNode)) {
      return 0;
    }

    let count = isDirectAssertionCall(currentNode, assertionFunctions) ? 1 : 0;

    for (const child of getChildren(currentNode)) {
      count += visit(child, false);
    }

    return count;
  }

  return visit(node.body ?? node, true);
}

function resolveOptions(context) {
  const ruleOptions = context.options[0] ?? {};
  const settingsOptions = context.settings?.assertionsPerFunction ?? {};

  return {
    minAssertions:
      ruleOptions.minAssertions
      ?? settingsOptions.minAssertions
      ?? DEFAULT_OPTIONS.minAssertions,
    assertionFunctions:
      ruleOptions.assertionFunctions
      ?? settingsOptions.assertionFunctions
      ?? DEFAULT_OPTIONS.assertionFunctions,
  };
}

const assertionsPerFunctionRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'require an average minimum number of assertions across each source file',
    },
    schema: [
      {
        type: 'object',
        properties: {
          minAssertions: { type: 'number' },
          assertionFunctions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooFewAssertions:
        "Source contains {{actual}} assertion-like calls across {{functions}} "
        + "checked functions; expected at least {{minimum}} total "
        + "({{expected}} per function average).",
    },
  },
  create(context) {
    const options = resolveOptions(context);

    const functions = [];

    function collectFunction(node) {
      functions.push(node);
    }

    return {
      FunctionDeclaration: collectFunction,
      FunctionExpression: collectFunction,
      ArrowFunctionExpression: collectFunction,
      'Program:exit'(node) {
        const assertionCount = functions.reduce(
          (total, functionNode) => total + countAssertionsInFunction(
            functionNode,
            options.assertionFunctions,
          ),
          0,
        );
        const minimum = functions.length * options.minAssertions;
        if (assertionCount >= minimum) {
          return;
        }

        context.report({
          node,
          messageId: 'tooFewAssertions',
          data: {
            actual: assertionCount,
            functions: functions.length,
            minimum,
            expected: options.minAssertions,
          },
        });
      },
    };
  },
};

export default {
  meta: {
    name: 'maxhill',
  },
  rules: {
    'assertions-per-function': assertionsPerFunctionRule,
  },
};
