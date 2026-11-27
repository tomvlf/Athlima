import globals from 'globals';

export default [
    {
        ignores: [
            'dist/**',
            'coverage/**',
            'node_modules/**',
            '.parcel-cache/**',
            'brand-kit-production/**',
            'brand-kit-reference/**',
            'test-results/**',
            'playwright-report/**',
            'doc/**',
        ],
    },
    {
        files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs', '*.mjs', 'jest.config.js', 'eslint.config.js', 'playwright.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            'no-unused-vars': 'off',
            'no-empty': 'off',
            'no-prototype-builtins': 'off',
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-dupe-keys': 'error',
            'no-redeclare': 'error',
            'valid-typeof': 'error',
            'no-constant-binary-expression': 'error',
            'no-self-assign': 'error',
        },
    },
];
