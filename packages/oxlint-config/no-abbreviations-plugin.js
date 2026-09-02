const DEFAULT_REPLACEMENTS = {
  arg: 'argument',
  args: 'arguments',
  buf: 'buffer',
  cfg: 'configuration',
  dest: 'destination',
  dst: 'destination',
  err: 'error',
  errs: 'errors',
  fn: 'function',
  fmt: 'format',
  idx: 'index',
  len: 'length',
  msg: 'message',
  num: 'number',
  obj: 'object',
  op: 'operation',
  param: 'parameter',
  params: 'parameters',
  pos: 'position',
  prev: 'previous',
  ptr: 'pointer',
  ref: 'reference',
  req: 'request',
  resp: 'response',
  src: 'source',
  tmp: 'temporary',
  val: 'value',
};

function normalizeReplacements(value) {
  const replacements = {};

  for (const [abbreviation, fullName] of Object.entries(value)) {
    replacements[String(abbreviation).toLowerCase()] = String(fullName);
  }

  return replacements;
}

function getNodeName(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }

  switch (node.type) {
    case 'Identifier':
      return node.name ?? null;
    case 'PrivateIdentifier':
      return node.name ?? null;
    default:
      return null;
  }
}

function findDisallowedIdentifier(name, replacements) {
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }

  const lowered = name.toLowerCase();
  const replacement = replacements[lowered];
  if (!replacement) {
    return null;
  }

  return {
    abbreviation: name,
    replacement,
  };
}

export function findAbbreviationViolation(name, replacements = DEFAULT_REPLACEMENTS) {
  return findDisallowedIdentifier(name, normalizeReplacements(replacements));
}

const noAbbreviationsRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow configured identifier abbreviations',
    },
    schema: [
      {
        type: 'object',
        properties: {
          replacements: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noAbbreviation:
        "'{{abbreviation}}' abbreviation is not allowed. Use full names like '{{replacement}}'.",
    },
  },
  create(context) {
    const ruleOptions = context.options[0] ?? {};
    const replacements = normalizeReplacements(ruleOptions.replacements ?? DEFAULT_REPLACEMENTS);

    function reportIfNeeded(node) {
      const name = getNodeName(node);
      const violation = findDisallowedIdentifier(name, replacements);
      if (!violation) {
        return;
      }

      context.report({
        node,
        messageId: 'noAbbreviation',
        data: violation,
      });
    }

    return {
      Identifier: reportIfNeeded,
      PrivateIdentifier: reportIfNeeded,
    };
  },
};

export default {
  meta: {
    name: 'maxhill',
  },
  rules: {
    'no-abbreviations': noAbbreviationsRule,
  },
};
