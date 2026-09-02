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

  for (const value of Object.values(node)) {
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

function isDirectAssertionCall(node, assertionFunctions) {
  return (
    node?.type === 'CallExpression'
    && node.callee?.type === 'Identifier'
    && assertionFunctions.includes(node.callee.name)
  );
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

function getFunctionName(node) {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    return node.id?.name ?? '<anonymous>';
  }

  return '<anonymous>';
}

function resolveOptions(context) {
  const ruleOptions = context.options[0] ?? {};
  const settingsOptions = context.settings?.assertionsPerFunction ?? {};

  return {
    minAssertions: ruleOptions.minAssertions ?? settingsOptions.minAssertions ?? DEFAULT_OPTIONS.minAssertions,
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
      description: 'require a minimum number of assertions inside each function',
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
        "Function '{{name}}' contains {{actual}} assertion{{suffix}}; expected at least {{expected}}.",
    },
  },
  create(context) {
    const options = resolveOptions(context);

    function checkFunction(node) {
      const assertionCount = countAssertionsInFunction(node, options.assertionFunctions);
      if (assertionCount >= options.minAssertions) {
        return;
      }

      context.report({
        node,
        messageId: 'tooFewAssertions',
        data: {
          name: getFunctionName(node),
          actual: assertionCount,
          expected: options.minAssertions,
          suffix: assertionCount === 1 ? '' : 's',
        },
      });
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
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
