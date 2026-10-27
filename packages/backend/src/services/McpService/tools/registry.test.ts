import { AnyType, ForbiddenError } from '@lightdash/common';
import { LightdashConfig } from '../../../config/parseConfig';
import { McpAuthContext, McpAuthType } from '../McpAuthContext';
import { McpToolName } from '../McpToolName';
import { McpToolRegistry } from './registry';
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
});
