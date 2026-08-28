const DEFAULT_OPTIONS = {
  code: 100,
  tabWidth: 2,
  ignoreUrls: true,
};

const URL_PATTERN = /\b[a-z][\w+.-]*:\/\//iu;

function measureLineLength(line, tabWidth) {
  let length = 0;

  for (const character of line) {
    length += character === '\t' ? tabWidth : 1;
  }

  return length;
}

function findOverflowColumn(line, maxLength, tabWidth) {
  let length = 0;

  for (let index = 0; index < line.length; index += 1) {
    length += line[index] === '\t' ? tabWidth : 1;
    if (length > maxLength) {
      return index;
    }
  }

  return line.length;
}

export function findTooLongLines(text, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const rawLines = text.split('\n');
  const violations = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index];
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (settings.ignoreUrls && URL_PATTERN.test(line)) {
      continue;
    }

    const length = measureLineLength(line, settings.tabWidth);
    if (length <= settings.code) {
      continue;
    }

    violations.push({
      line: index + 1,
      column: findOverflowColumn(line, settings.code, settings.tabWidth),
      endColumn: line.length,
      length,
    });
  }

  return violations;
}

const maxLenRule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'enforce a maximum visual line length',
    },
    schema: [
      {
        type: 'object',
        properties: {
          code: { type: 'number' },
          tabWidth: { type: 'number' },
          ignoreUrls: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      maxLen: 'Line exceeds the maximum length of {{max}} (actual: {{actual}}).',
    },
  },
  create(context) {
    const options = { ...DEFAULT_OPTIONS, ...(context.options[0] ?? {}) };

    return {
      Program() {
        const violations = findTooLongLines(context.sourceCode.text, options);

        for (const violation of violations) {
          context.report({
            loc: {
              start: { line: violation.line, column: violation.column },
              end: { line: violation.line, column: violation.endColumn },
            },
            messageId: 'maxLen',
            data: {
              max: options.code,
              actual: violation.length,
            },
          });
        }
      },
    };
  },
};

export default {
  meta: {
    name: 'maxhill',
  },
  rules: {
    'max-len': maxLenRule,
  },
};
