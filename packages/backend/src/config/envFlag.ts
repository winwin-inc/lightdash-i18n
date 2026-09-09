/**
 * Env boolean that defaults to enabled when unset/empty.
 * Only an explicit `false` (case-insensitive) turns the flag off.
 */
export const envEnabledDefaultTrue = (name: string): boolean => {
    const value = process.env[name];
    if (value === undefined || value.trim() === '') {
        return true;
    }
    return value.trim().toLowerCase() !== 'false';
};
