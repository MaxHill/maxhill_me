import { jsDocTagsPlugin } from '@wc-toolkit/jsdoc-tags';

export default {
    globs: ['src/m-*/**/*.ts', 'src/vendored/**/*.ts'],
    exclude: ['src/vendored/**/index.ts', '**/*.test.ts', '**/*.spec.ts'],
    outdir: 'dist',
    plugins: [
        jsDocTagsPlugin({
            tags: {
                example: {
                    mappedName: 'examples',
                    isArray: true
                }
            }
        })
    ]
};
