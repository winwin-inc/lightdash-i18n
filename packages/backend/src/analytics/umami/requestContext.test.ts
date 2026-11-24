import {
    getUmamiRequestContext,
    resolveUmamiClient,
    runWithUmamiContext,
} from './requestContext';

describe('requestContext', () => {
    it('returns undefined outside of a context', () => {
        expect(getUmamiRequestContext()).toBeUndefined();
    });

    it('propagates store through the async chain', async () => {
        await runWithUmamiContext(
            { client: 'web', path: '/api/v1/x' },
            async () => {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
                expect(getUmamiRequestContext()).toEqual({
                    client: 'web',
                    path: '/api/v1/x',
                });
            },
        );
    });
});

describe('resolveUmamiClient', () => {
    it.each([
        ['WEB_APP', '/api/v1/dashboards', 'web'],
        ['CLI', '/api/v1/projects/p/query', 'lightdash-cli'],
        ['CLI_CI', '/api/v1/x', 'lightdash-cli-ci'],
        ['HEADLESS_BROWSER', '/api/v1/x', 'headless'],
        [undefined, '/api/v1/x', 'api'],
        ['SOMETHING_ELSE', '/api/v1/x', 'api'],
        [undefined, '/api/v1/mcp', 'mcp'],
        ['WEB_APP', '/api/v1/mcp/tools', 'mcp'], // mcp 路径优先于头
    ])('header=%s path=%s → %s', (header, path, expected) => {
        expect(resolveUmamiClient(header, path)).toBe(expected);
    });
});
