import express from 'express';
import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { AnyType } from '@lightdash/common';
import { LightdashConfig } from '../config/parseConfig';
import { McpService } from '../services/McpService/McpService';
import mcpRouter from './mcpRouter';

// The warehouses package pulls in native warehouse drivers, which are not
// needed to test the MCP HTTP endpoints.
jest.mock('@lightdash/warehouses', () => ({
    warehouseSqlBuilderFromType: jest.fn(),
}));

/**
 * The MCP router only supports token based authentication, so the
 * authentication middlewares are replaced by a stub that maps the
 * `Authorization` header to a session user and an account:
 *
 * - `Bearer oauth-with-scope`    -> OAuth account with the `mcp:read` scope
 * - `Bearer oauth-without-scope` -> OAuth account without any MCP scope
 * - `ApiKey pat-token`           -> personal access token account
 */
jest.mock('../controllers/authentication', () => ({
    allowOauthAuthentication: (req: AnyType, res: AnyType, next: AnyType) => {
        const authorization = req.headers.authorization ?? '';

        if (authorization.startsWith('Bearer ')) {
            const token = authorization.slice('Bearer '.length);
            const scopes = token === 'oauth-with-scope' ? ['mcp:read'] : [];

            req.user = {
                userUuid: 'mcp-user-uuid',
                organizationUuid: 'mcp-org-uuid',
            };
            req.account = {
                authentication: {
                    type: 'oauth',
                    source: token,
                    token,
                    clientId: 'test-client',
                    scopes,
                },
                isAuthenticated: () => true,
                isOauthUser: () => true,
                isPatUser: () => false,
            };
        }

        next();
    },
    allowApiKeyAuthentication: (req: AnyType, res: AnyType, next: AnyType) => {
        const authorization = req.headers.authorization ?? '';

        if (authorization.startsWith('ApiKey ')) {
            const source = authorization.slice('ApiKey '.length);
            req.user = {
                userUuid: 'mcp-user-uuid',
                organizationUuid: 'mcp-org-uuid',
            };
            req.account = {
                authentication: {
                    type: 'pat',
                    source,
                },
                isAuthenticated: () => true,
                isOauthUser: () => false,
                isPatUser: () => true,
            };
        }

        next();
    },
    isAuthenticated: (req: AnyType, res: AnyType, next: AnyType) => next(),
}));

const buildMcpService = (): McpService => {
    const lightdashConfig = {
        mcp: {
            enabled: true,
            oauthRequiredScopes: ['mcp:read'],
        },
    } as AnyType as LightdashConfig;

    return new McpService({
        lightdashConfig,
        analytics: {} as AnyType,
        catalogService: {} as AnyType,
        projectModel: {} as AnyType,
        projectService: {} as AnyType,
        userAttributesModel: {} as AnyType,
        searchModel: {} as AnyType,
        spaceModel: {} as AnyType,
        spaceService: {} as AnyType,
        mcpContextModel: {} as AnyType,
        organizationModel: {} as AnyType,
        featureFlagService: {} as AnyType,
        contentService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        searchService: {} as AnyType,
    });
};

const INITIALIZE_REQUEST = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-router-test', version: '1.0.0' },
    },
};

describe('mcpRouter authentication', () => {
    let server: Server;
    let baseUrl: string;
    let mcpService: McpService;

    beforeAll(async () => {
        mcpService = buildMcpService();

        const app = express();
        app.use(express.json());
        app.use((req: AnyType, res: AnyType, next: AnyType) => {
            req.services = {
                getMcpService: () => mcpService,
                getOauthService: () => ({
                    getSiteUrl: () => 'https://lightdash.example.com',
                }),
            };
            next();
        });
        app.use('/api/v1/mcp', mcpRouter);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        app.use((err: AnyType, req: AnyType, res: AnyType, next: AnyType) => {
            res.status(err.statusCode ?? 500).json({ error: err.message });
        });

        server = await new Promise<Server>((resolve) => {
            const httpServer = app.listen(0, () => resolve(httpServer));
        });
        const { port } = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${port}/api/v1/mcp`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    });

    /**
     * Sends a MCP `initialize` request.
     *
     * The request is sent with the node http client on purpose: the global
     * fetch client honours the HTTP_PROXY environment variable, which would
     * send the request to the proxy instead of the local test server.
     */
    const post = (authorization?: string) =>
        new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>(
            (resolve, reject) => {
                const request = http.request(
                    `${baseUrl}`,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            accept: 'application/json, text/event-stream',
                            ...(authorization ? { authorization } : {}),
                        },
                    },
                    (response) => {
                        let body = '';
                        response.setEncoding('utf8');
                        response.on('data', (chunk) => {
                            body += chunk;
                        });
                        response.on('end', () => {
                            resolve({
                                status: response.statusCode ?? 0,
                                headers: response.headers,
                                body,
                            });
                        });
                    },
                );

                request.on('error', reject);
                request.end(JSON.stringify(INITIALIZE_REQUEST));
            },
        );

    it('returns 401 with the RFC9728 header when no token is provided', async () => {
        const response = await post();

        expect(response.status).toEqual(401);
        expect(response.headers['www-authenticate']).toEqual(
            'Bearer resource_metadata="https://lightdash.example.com/api/v1/oauth/.well-known/oauth-protected-resource"',
        );
    });

    it('returns 403 when the OAuth token is missing the required scope', async () => {
        const response = await post('Bearer oauth-without-scope');

        expect(response.status).toEqual(403);
        expect(JSON.parse(response.body)).toEqual({
            error: 'Missing required OAuth scope(s): mcp:read',
        });
    });

    it('accepts an OAuth token with the mcp:read scope', async () => {
        const response = await post('Bearer oauth-with-scope');

        expect(response.status).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(
            expect.objectContaining({
                jsonrpc: '2.0',
                id: 1,
            }),
        );
    });

    it('accepts a personal access token', async () => {
        const response = await post('ApiKey pat-token');

        expect(response.status).toEqual(200);
        expect(JSON.parse(response.body)).toEqual(
            expect.objectContaining({
                jsonrpc: '2.0',
                id: 1,
            }),
        );
    });
});
