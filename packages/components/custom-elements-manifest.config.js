import { cemValidatorPlugin } from "@wc-toolkit/cem-validator";

export default {
    globs: ['src/m-*/**/*.ts', 'src/vendored/**/*.ts'],
    exclude: ['src/vendored/**/index.ts', '**/*.test.ts', '**/*.spec.ts'],
    plugins: [
        cemValidatorPlugin({
            debug: true
        })
    ]
};
