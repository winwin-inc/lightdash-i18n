import { envEnabledDefaultTrue } from './envFlag';

describe('envEnabledDefaultTrue', () => {
    const ENV_NAME = 'TEST_ENV_ENABLED_DEFAULT_TRUE';

    afterEach(() => {
        delete process.env[ENV_NAME];
    });

    it('returns true when unset', () => {
        delete process.env[ENV_NAME];
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(true);
    });

    it('returns true when empty or whitespace', () => {
        process.env[ENV_NAME] = '';
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(true);
        process.env[ENV_NAME] = '   ';
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(true);
    });

    it('returns false only for explicit false (case-insensitive)', () => {
        process.env[ENV_NAME] = 'false';
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(false);
        process.env[ENV_NAME] = 'FALSE';
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(false);
        process.env[ENV_NAME] = ' False ';
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(false);
    });

    it('returns true for true and other non-false values', () => {
        process.env[ENV_NAME] = 'true';
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(true);
        process.env[ENV_NAME] = '1';
        expect(envEnabledDefaultTrue(ENV_NAME)).toBe(true);
    });
});
