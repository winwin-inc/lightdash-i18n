module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    // Force CJS build — Jest otherwise picks uuid's ESM browser entry on Windows
    moduleNameMapper: {
        '^uuid$': require.resolve('uuid'),
    },
};
