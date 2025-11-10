export default function (plop) {
    plop.setHelper('kebabCase', (text) => {
        return text
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[\s_]+/g, '-')
            .toLowerCase();
    });

    plop.setHelper('pascalCase', (text) => {
        return text
            .replace(/[-_\s](.)/g, (_, c) => c.toUpperCase())
            .replace(/^(.)/, (_, c) => c.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
    });

    plop.setGenerator('component', {
        description: 'Create a new MElement-based web component',
        prompts: [
            {
                type: 'input',
                name: 'componentName',
                message: 'Component name (e.g., button, tab-list):',
                validate: (value) => {
                    if (!value) return 'Component name is required';
                    if (!/^[a-z]+(-[a-z]+)*$/.test(value)) {
                        return 'Component name must be in kebab-case (e.g., button, tab-list)';
                    }
                    return true;
                },
                filter: (value) => {
                    // Automatically prefix with 'm-' if not already present
                    if (!value.startsWith('m-')) {
                        return `m-${value}`;
                    }
                    return value;
                },
            },
            {
                type: 'input',
                name: 'description',
                message: 'Component description:',
                default: 'A custom web component',
            },
            {
                type: 'confirm',
                name: 'hasEvents',
                message: 'Include events.ts file?',
                default: true,
            },
            {
                type: 'confirm',
                name: 'updateRegisterAll',
                message: 'Update register-all.ts?',
                default: true,
            },
        ],
        actions: (data) => {
            const actions = [];

            // Calculate derived names
            data.componentNamePascal = plop.getHelper('pascalCase')(data.componentName);

            // Create component directory and files
            actions.push({
                type: 'add',
                path: 'packages/components/src/{{componentName}}/index.ts',
                templateFile: 'plop/templates/component/index.ts.hbs',
            });

            actions.push({
                type: 'add',
                path: 'packages/components/src/{{componentName}}/index.css',
                templateFile: 'plop/templates/component/index.css.hbs',
            });

            actions.push({
                type: 'add',
                path: 'packages/components/src/{{componentName}}/DOCS.mdx',
                templateFile: 'plop/templates/component/DOCS.mdx.hbs',
            });

            // Conditionally add events.ts
            if (data.hasEvents) {
                actions.push({
                    type: 'add',
                    path: 'packages/components/src/{{componentName}}/events.ts',
                    templateFile: 'plop/templates/component/events.ts.hbs',
                });
            }

            // Always add test file
            actions.push({
                type: 'add',
                path: 'packages/components/src/{{componentName}}/index.test.ts',
                templateFile: 'plop/templates/component/index.test.ts.hbs',
            });

            // Conditionally update register-all.ts
            if (data.updateRegisterAll) {
                actions.push({
                    type: 'modify',
                    path: 'packages/components/src/register-all.ts',
                    pattern: /(import.*from.*\n)/,
                    template: "$1import {{componentNamePascal}} from './{{componentName}}';\n",
                });

                actions.push({
                    type: 'modify',
                    path: 'packages/components/src/register-all.ts',
                    pattern: /(registerAll\(\);)/,
                    template: "  {{componentNamePascal}}.define();\n}\n\n$1",
                });
            }

            return actions;
        },
    });
}
