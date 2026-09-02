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

    plop.setHelper('eq', (a, b) => {
        return a === b;
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
                type: 'list',
                name: 'target',
                message: 'Where should this component be created?',
                choices: [
                    { 
                        name: 'Component Library (@maxhill/components)', 
                        value: 'library' 
                    },
                    { 
                        name: 'golf App', 
                        value: 'app' 
                    },
                ],
                default: 'library',
            },
            {
                type: 'list',
                name: 'appLocation',
                message: 'Where in the app?',
                choices: [
                    { name: 'src/ (root level)', value: 'root' },
                    { name: 'src/features/ (feature folder)', value: 'features' },
                ],
                default: 'root',
                when: (answers) => answers.target === 'app',
            },
            {
                type: 'input',
                name: 'featureName',
                message: 'Feature folder name:',
                when: (answers) => answers.appLocation === 'features',
                validate: (value) => {
                    if (!value) return 'Feature name is required';
                    return true;
                },
            },
            {
                type: 'confirm',
                name: 'useUhtml',
                message: 'Use uhtml for rendering?',
                default: false,
            },
            {
                type: 'confirm',
                name: 'includeGlobalStylesheet',
                message: 'Include global stylesheet?',
                default: false,
                when: (answers) => answers.target === 'app',
            },
            {
                type: 'confirm',
                name: 'includeDocs',
                message: 'Include DOCS.mdx file?',
                default: (answers) => answers.target === 'library',
            },
            {
                type: 'confirm',
                name: 'updateRegisterAll',
                message: 'Update register-all.ts?',
                default: true,
                when: (answers) => answers.target === 'library',
            },
        ],
        actions: (data) => {
            const actions = [];

            // Calculate derived names
            data.componentNamePascal = plop.getHelper('pascalCase')(data.componentName);

            // Determine base path based on target
            let basePath;
            if (data.target === 'library') {
                basePath = 'packages/components/src/{{componentName}}';
            } else if (data.appLocation === 'features') {
                basePath = `apps/golf/src/features/${data.featureName}/{{componentName}}`;
            } else {
                basePath = 'apps/golf/src/{{componentName}}';
            }

            // Create component directory and files
            actions.push({
                type: 'add',
                path: `${basePath}/index.ts`,
                templateFile: 'plop/templates/component/index.ts.hbs',
            });

            actions.push({
                type: 'add',
                path: `${basePath}/index.css`,
                templateFile: 'plop/templates/component/index.css.hbs',
            });

            // Conditionally add DOCS.mdx
            if (data.includeDocs) {
                actions.push({
                    type: 'add',
                    path: `${basePath}/DOCS.mdx`,
                    templateFile: 'plop/templates/component/DOCS.mdx.hbs',
                });
            }

            // Always add test file
            actions.push({
                type: 'add',
                path: `${basePath}/index.test.ts`,
                templateFile: 'plop/templates/component/index.test.ts.hbs',
            });

            // Conditionally update register-all.ts (library only)
            if (data.target === 'library' && data.updateRegisterAll) {
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

    plop.setGenerator('event', {
        description: 'Create a custom event class',
        prompts: [
            {
                type: 'input',
                name: 'eventName',
                message: 'Event name (e.g., button-click, item-selected):',
                validate: (value) => {
                    if (!value) return 'Event name is required';
                    if (!/^[a-z]+(-[a-z]+)*$/.test(value)) {
                        return 'Event name must be kebab-case (lowercase with dashes)';
                    }
                    return true;
                },
            },
            {
                type: 'confirm',
                name: 'cancelable',
                message: 'Should this event be cancelable?',
                default: false,
            },
            {
                type: 'list',
                name: 'pathPrefix',
                message: 'Path prefix:',
                choices: [
                    { 
                        name: 'packages/components/src/ (library component)', 
                        value: 'packages/components/src/' 
                    },
                    { 
                        name: 'apps/golf/src/ (app root)', 
                        value: 'apps/golf/src/' 
                    },
                    { 
                        name: 'apps/golf/src/features/ (app feature)', 
                        value: 'apps/golf/src/features/' 
                    },
                    { 
                        name: '(none - full custom path)', 
                        value: '' 
                    },
                ],
                default: 'packages/components/src/',
            },
            {
                type: 'input',
                name: 'pathCompletion',
                message: (answers) => {
                    const prefix = answers.pathPrefix || '';
                    return prefix 
                        ? `Complete the path (${prefix}...):` 
                        : 'Full path:';
                },
                default: 'events.ts',
                validate: (value) => {
                    if (!value) return 'Path is required';
                    if (!value.endsWith('.ts')) return 'File must end with .ts';
                    return true;
                },
            },
        ],
        actions: (data) => {
            // Calculate class name from event name
            data.eventNamePascal = plop.getHelper('pascalCase')(data.eventName);
            
            // Combine prefix and completion
            data.outputPath = data.pathPrefix + data.pathCompletion;
            
            return [
                {
                    type: 'add',
                    path: '{{outputPath}}',
                    templateFile: 'plop/templates/event/event.ts.hbs',
                }
            ];
        },
    });

    plop.setGenerator('ocaml-project', {
        description: 'Create an OCaml project with Hegel and inline expect tests',
        prompts: [
            {
                type: 'input',
                name: 'projectName',
                message: 'Project name:',
                validate: (value) => {
                    if (!value) return 'Project name is required';
                    if (!/^[a-z][a-z0-9_]*$/.test(value)) {
                        return 'Project name must use lowercase letters, numbers, and underscores';
                    }
                    return true;
                },
            },
            {
                type: 'input',
                name: 'projectPath',
                message: 'Project path relative to <repo_root>:',
                default: (answers) => answers.projectName,
                validate: (value) => {
                    if (!value) return 'Project path is required';
                    if (value.startsWith('/') || value.split('/').includes('..')) {
                        return 'Project path must be relative to the repository root';
                    }
                    return true;
                },
            },
        ],
        actions: (data) => {
            data.projectPath = data.projectPath.replace(/\/+$/, '');
            data.projectModule = plop.getHelper('pascalCase')(data.projectName);

            const basePath = data.projectPath;
            const templatePath = 'plop/templates/ocaml-project';

            return [
                { type: 'add', path: `${basePath}/mise.toml`, templateFile: `${templatePath}/mise.toml.hbs` },
                { type: 'add', path: `${basePath}/dune-project`, templateFile: `${templatePath}/dune-project.hbs` },
                { type: 'add', path: `${basePath}/{{projectName}}.opam`, templateFile: `${templatePath}/project.opam.hbs` },
                { type: 'add', path: `${basePath}/.gitignore`, templateFile: `${templatePath}/gitignore.hbs` },
                { type: 'add', path: `${basePath}/.ocamlformat`, templateFile: `${templatePath}/ocamlformat.hbs` },
                { type: 'add', path: `${basePath}/bin/dune`, templateFile: `${templatePath}/bin-dune.hbs` },
                { type: 'add', path: `${basePath}/bin/main.ml`, templateFile: `${templatePath}/main.ml.hbs` },
                { type: 'add', path: `${basePath}/lib/dune`, templateFile: `${templatePath}/lib-dune.hbs` },
                { type: 'add', path: `${basePath}/lib/{{projectName}}.ml`, templateFile: `${templatePath}/lib.ml.hbs` },
                { type: 'add', path: `${basePath}/test/dune`, templateFile: `${templatePath}/test-dune.hbs` },
                { type: 'add', path: `${basePath}/test/walker.ml`, templateFile: `${templatePath}/walker.ml.hbs` },
                { type: 'add', path: `${basePath}/test/test_lint.ml`, templateFile: `${templatePath}/test_lint.ml.hbs` },
                { type: 'add', path: `${basePath}/test/test_{{projectName}}.ml`, templateFile: `${templatePath}/test.ml.hbs` },
            ];
        },
    });
}
