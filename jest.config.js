/**
 * Configures Jest, the program that runs automated checks. jsdom imitates a browser page without
 * opening a real window; shared setup supplies missing browser features. Babel translates
 * JavaScript imports for the test runner. The retired top-level server directory is excluded, but
 * current browser-only tests in test/server still run.
 */

export default {
    testEnvironment: 'jsdom',
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/', '<rootDir>/test/e2e/'],
    setupFiles: ['<rootDir>/test/jest-setup.js'],
    coverageThreshold: {
        global: {
            statements: 68,
            branches: 68,
            functions: 65,
            lines: 69,
        },
    },
    transform: {
        '^.+\\.js$': 'babel-jest',
    },
};
