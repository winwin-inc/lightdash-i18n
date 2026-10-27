import { AnyType, ForbiddenError } from '@lightdash/common';
import { LightdashConfig } from '../../../config/parseConfig';
import { McpAuthContext, McpAuthType } from '../McpAuthContext';
import { McpToolName } from '../McpToolName';
import { McpToolCallInfo, McpToolRegistry } from './registry';
import { McpToolContext } from './types';

const buildAuthContext = ({
    authType,
    scopes,
}: {
    authType: McpAuthType;
    scopes: string[];
}): McpAuthContext => ({
    user: {
        userUuid: 'user-uuid',
        organizationUuid: 'organization-uuid',
        ability: {},
    } as AnyType,
    account: {} as AnyType,
    authType,
    scopes,
});

const buildSdkContext = (authContext: McpAuthContext): AnyType => ({
    authInfo: {
        token: 'token',
        clientId: 'client-id',
        scopes: authContext.scopes,
        extra: authContext,
    },
});

describe('McpToolRegistry', () => {
    const lightdashConfig = {
        mcp: {
            enabled: true,
            oauthRequiredScopes: ['mcp:read'],
        },
    } as AnyType as LightdashConfig;

    const registry = new McpToolRegistry({} as AnyType, lightdashConfig);

    describe('canAccessMcp', () => {
        it('rejects a request without auth info', () => {
            expect(() => registry.canAccessMcp(undefined)).toThrow(
                ForbiddenError,
            );
        });

        it('rejects an OAuth token without the required scope', () => {
            expect(() =>
                registry.canAccessMcp(
                    buildAuthContext({
                        authType: McpAuthType.OAuth,
                        scopes: ['openid'],
                    }),
                ),
            ).toThrow(ForbiddenError);
        });

        it('accepts an OAuth token with the required scope', () => {
            expect(
                registry.canAccessMcp(
                    buildAuthContext({
                        authType: McpAuthType.OAuth,
                        scopes: ['mcp:read'],
                    }),
                ),
            ).toBe(true);
        });

        it('accepts a personal access token without scopes', () => {
            expect(
                registry.canAccessMcp(
                    buildAuthContext({
                        authType: McpAuthType.Pat,
                        scopes: [],
                    }),
                ),
            ).toBe(true);
        });
    });

    describe('assertToolAccess', () => {
        const buildToolContext = (
            authType: McpAuthType,
            scopes: string[],
        ): McpToolContext =>
            ({
                user: { userUuid: 'user-uuid' },
                organizationUuid: 'organization-uuid',
                authType,
                scopes,
            } as AnyType);

        it('rejects an OAuth token without the tool scope', () => {
            expect(() =>
                McpToolRegistry.assertToolAccess(
                    buildToolContext(McpAuthType.OAuth, []),
                    McpToolName.FIND_EXPLORES,
                ),
            ).toThrow(ForbiddenError);
        });

        it('accepts an OAuth token with the tool scope', () => {
            expect(() =>
                McpToolRegistry.assertToolAccess(
                    buildToolContext(McpAuthType.OAuth, ['mcp:read']),
                    McpToolName.FIND_EXPLORES,
                ),
            ).not.toThrow();
        });

        it('does not limit personal access tokens', () => {
            expect(() =>
                McpToolRegistry.assertToolAccess(
                    buildToolContext(McpAuthType.Pat, []),
                    McpToolName.FIND_EXPLORES,
                ),
            ).not.toThrow();
        });
    });

    describe('buildToolContext', () => {
        it('normalises the SDK context', () => {
            const context = McpToolRegistry.buildToolContext(
                buildSdkContext(
                    buildAuthContext({
                        authType: McpAuthType.OAuth,
                        scopes: ['mcp:read'],
                    }),
                ),
            );

            expect(context.user.userUuid).toEqual('user-uuid');
            expect(context.organizationUuid).toEqual('organization-uuid');
            expect(context.authType).toEqual(McpAuthType.OAuth);
            expect(context.scopes).toEqual(['mcp:read']);
        });

        it('rejects a context without auth info', () => {
            expect(() => McpToolRegistry.buildToolContext({})).toThrow(
                ForbiddenError,
            );
        });
    });

    describe('register', () => {
        const buildServer = () => {
            const handlers: Record<
                string,
                (args: AnyType, context: AnyType) => Promise<AnyType>
            > = {};

            const server = {
                registerTool: (
                    name: string,
                    _config: AnyType,
                    cb: (args: AnyType, context: AnyType) => Promise<AnyType>,
                ) => {
                    handlers[name] = cb;
                },
            } as AnyType;

            return { server, handlers };
        };

        const oauthContext = buildAuthContext({
            authType: McpAuthType.OAuth,
            scopes: ['mcp:read'],
        });

        it('reports successful tool calls', async () => {
            const { server, handlers } = buildServer();
            const calls: McpToolCallInfo[] = [];
            const toolRegistry = new McpToolRegistry(
                server,
                lightdashConfig,
                (info) => {
                    calls.push(info);
                },
            );

            toolRegistry.register(
                McpToolName.GET_LIGHTDASH_VERSION,
                {},
                async () => ({ content: [] }),
            );

            await handlers[McpToolName.GET_LIGHTDASH_VERSION](
                {},
                buildSdkContext(oauthContext),
            );

            expect(calls).toHaveLength(1);
            expect(calls[0].toolName).toEqual(McpToolName.GET_LIGHTDASH_VERSION);
            expect(calls[0].success).toBe(true);
            expect(calls[0].durationMs).toBeGreaterThanOrEqual(0);
        });

        it('reports failed tool calls and rethrows the error', async () => {
            const { server, handlers } = buildServer();
            const calls: McpToolCallInfo[] = [];
            const toolRegistry = new McpToolRegistry(
                server,
                lightdashConfig,
                (info) => {
                    calls.push(info);
                },
            );

            toolRegistry.register(
                McpToolName.GET_LIGHTDASH_VERSION,
                {},
                async () => {
                    throw new ForbiddenError('nope');
                },
            );

            await expect(
                handlers[McpToolName.GET_LIGHTDASH_VERSION](
                    {},
                    buildSdkContext(oauthContext),
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(calls).toHaveLength(1);
            expect(calls[0].success).toBe(false);
            expect(calls[0].error).toBeInstanceOf(ForbiddenError);
        });

        it('does not report tool calls that are rejected by the scope check', async () => {
            const { server, handlers } = buildServer();
            const calls: McpToolCallInfo[] = [];
            const toolRegistry = new McpToolRegistry(
                server,
                lightdashConfig,
                (info) => {
                    calls.push(info);
                },
            );

            toolRegistry.register(
                McpToolName.GET_LIGHTDASH_VERSION,
                {},
                async () => ({ content: [] }),
            );

            await expect(
                handlers[McpToolName.GET_LIGHTDASH_VERSION](
                    {},
                    buildSdkContext(
                        buildAuthContext({
                            authType: McpAuthType.OAuth,
                            scopes: ['openid'],
                        }),
                    ),
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(calls).toHaveLength(0);
        });
    });
});
