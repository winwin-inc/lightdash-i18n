// eslint-disable @typescript-eslint/dot-notation
import { AnyType } from '@lightdash/common';

import OAuth2Server from '@node-oauth/oauth2-server';
import { LightdashConfig } from '../../config/parseConfig';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { OAuthService } from './OAuthService';

// Test subclass to expose oauthServer for mocking
class TestOAuthService extends OAuthService {
    public setOAuthServer(server: AnyType) {
        this.oauthServer = server;
    }
}

describe('OAuthService edge cases', () => {
    let oauthService: TestOAuthService;
    let mockUserModel: jest.Mocked<UserModel>;
    let mockOAuthModel: jest.Mocked<OAuth2Model>;
    let mockLightdashConfig: jest.Mocked<LightdashConfig>;

    beforeEach(() => {
        mockUserModel = {
            getSessionUserFromCacheOrDB: jest.fn(),
        } as AnyType;
        mockOAuthModel = {
            getAccessToken: jest.fn(),
            revokeToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
        } as AnyType;
        mockLightdashConfig = {
            siteUrl: 'https://lightdash.com',
            auth: {},
        } as AnyType;
        oauthService = new TestOAuthService({
            userModel: mockUserModel,
            oauthModel: mockOAuthModel,
            lightdashConfig: mockLightdashConfig,
        });
    });

    it('should throw if authorize is called with missing user fields', async () => {
        const request = {} as OAuth2Server.Request;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            authorize: jest.fn().mockImplementation(() => {
                throw new Error('Missing user fields');
            }),
        } as AnyType);
        await expect(
            oauthService.authorize(request, response, {} as AnyType),
        ).rejects.toThrow('Missing user fields');
    });

    it('should throw if token is called with missing parameters', async () => {
        const request = {} as OAuth2Server.Request;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            token: jest.fn().mockImplementation(() => {
                throw new Error('Missing parameters');
            }),
        } as AnyType);
        await expect(oauthService.token(request, response)).rejects.toThrow(
            'Missing parameters',
        );
    });

    it('should throw if PKCE code_verifier is missing', async () => {
        // Simulate a PKCE-required flow
        const request = {
            body: { code_challenge: 'abc', code_challenge_method: 'S256' },
        } as AnyType;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            token: jest.fn().mockImplementation(() => {
                throw new Error('code_verifier is required for PKCE');
            }),
        } as AnyType);
        await expect(oauthService.token(request, response)).rejects.toThrow(
            'code_verifier is required for PKCE',
        );
    });

    it('should throw if PKCE code_verifier does not match code_challenge', async () => {
        // Simulate a PKCE mismatch
        const request = {
            body: {
                code_challenge: 'abc',
                code_challenge_method: 'S256',
                code_verifier: 'wrong',
            },
        } as AnyType;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            token: jest.fn().mockImplementation(() => {
                throw new Error('Invalid code verifier');
            }),
        } as AnyType);
        await expect(oauthService.token(request, response)).rejects.toThrow(
            'Invalid code verifier',
        );
    });

    it('should throw if redirect_uri is invalid', async () => {
        const request = {
            body: { redirect_uri: 'http://malicious.com/callback' },
        } as AnyType;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            authorize: jest.fn().mockImplementation(() => {
                throw new Error('Invalid redirect_uri');
            }),
        } as AnyType);
        await expect(
            oauthService.authorize(request, response, {
                user_id: 'u',
                organization_uuid: 'o',
            } as AnyType),
        ).rejects.toThrow('Invalid redirect_uri');
    });

    describe('default scope', () => {
        it('should default to the MCP read scope when no scope is requested', async () => {
            const request = {
                body: { client_id: 'client-id' },
            } as AnyType;
            const response = {} as OAuth2Server.Response;
            const authorize = jest.fn().mockResolvedValue({});
            mockOAuthModel.getClientScopes = jest.fn().mockResolvedValue([]);
            oauthService.setOAuthServer({ authorize } as AnyType);

            await oauthService.authorize(request, response, {
                user_id: 'u',
                organization_uuid: 'o',
            } as AnyType);

            expect(request.body.scope).toEqual('mcp:read');
            expect(authorize).toHaveBeenCalled();
        });

        it('should use the MCP scopes registered by the client', async () => {
            const request = {
                body: { client_id: 'client-id' },
            } as AnyType;
            const response = {} as OAuth2Server.Response;
            mockOAuthModel.getClientScopes = jest
                .fn()
                .mockResolvedValue(['mcp:read', 'mcp:write']);
            oauthService.setOAuthServer({
                authorize: jest.fn().mockResolvedValue({}),
            } as AnyType);

            await oauthService.authorize(request, response, {
                user_id: 'u',
                organization_uuid: 'o',
            } as AnyType);

            expect(request.body.scope).toEqual('mcp:read mcp:write');
        });

        it('should keep the requested scope', async () => {
            const request = {
                body: { client_id: 'client-id', scope: 'mcp:write' },
            } as AnyType;
            const response = {} as OAuth2Server.Response;
            mockOAuthModel.getClientScopes = jest
                .fn()
                .mockResolvedValue(['mcp:read', 'mcp:write']);
            oauthService.setOAuthServer({
                authorize: jest.fn().mockResolvedValue({}),
            } as AnyType);

            await oauthService.authorize(request, response, {
                user_id: 'u',
                organization_uuid: 'o',
            } as AnyType);

            expect(request.body.scope).toEqual('mcp:write');
            expect(mockOAuthModel.getClientScopes).not.toHaveBeenCalled();
        });
    });
});
