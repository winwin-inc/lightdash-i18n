import { AnyType } from '@lightdash/common';
import express from 'express';
import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { DeviceCodeSession } from '../models/OAuth2Model';
import {
    DEVICE_CODE_TTL_MS,
    DEVICE_POLL_INTERVAL_SECONDS,
} from '../services/OAuthService/OAuthService';
import oauthRouter from './oauthRouter';

const SITE_URL = 'https://lightdash.example.com';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

/** Session user injected by the stubbed session middleware. */
const TEST_USER = {
    userId: 42,
    firstName: 'Ada',
    lastName: 'Lovelace',
    organizationName: 'Acme Analytics',
    organizationUuid: '11111111-1111-4111-8111-111111111111',
};

/**
 * In-memory replacement for the device-flow surface of OAuthService
 * (createDeviceCodeSession, getDeviceCodeSessionByUserCode,
 * getDeviceCodeSessionByDeviceCode, approveDeviceCode, denyDeviceCode,
 * consumeDeviceCode, releaseDeviceCode, deleteDeviceCode,
 * deleteExpiredDeviceCodes, isDeviceFlowAtCapacity, createDeviceToken,
 * getSiteUrl), mirroring the Postgres-backed contract. consumeDeviceCode
 * mirrors the atomic UPDATE ... SET status='consumed' ... RETURNING: the
 * row stays in the map (not deleted), and releaseDeviceCode compensates a
 * failed token minting by flipping it back to 'authorized'.
 *
 * Boundary under test: the router's state comes ONLY from the injected
 * service — the router holds no module-level state. Two app instances
 * (replicas) sharing one store must complete the QR login flow (the CLI
 * talks to replica A, the phone's browser hits replica B), while an app
 * built on a separate store sees none of those sessions.
 */
class InMemoryDeviceFlowService {
    /** deviceCode -> session; stands in for the oauth2_device_codes table. */
    readonly sessions = new Map<string, DeviceCodeSession>();

    /** Test hook for the abuse guard on POST /device. */
    atCapacity = false;

    /** Number of tokens minted (a second minting means double redemption). */
    mintedTokens = 0;

    /** Test hook: the next createDeviceToken call throws (minting failure). */
    failNextMint = false;

    private sequence = 0;

    // eslint-disable-next-line class-methods-use-this
    getSiteUrl(): string {
        return SITE_URL;
    }

    /** Directly inserts a session (test seeding for fixed/expired codes). */
    seed(
        session: Partial<DeviceCodeSession> & { deviceCode: string },
    ): DeviceCodeSession {
        this.sequence += 1;
        const full: DeviceCodeSession = {
            userCode: `USER-CODE-${String(this.sequence).padStart(4, '0')}`,
            clientId: 'msy-x-cli',
            status: 'pending',
            userId: null,
            organizationUuid: null,
            expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS),
            ...session,
        };
        this.sessions.set(full.deviceCode, full);
        return full;
    }

    async createDeviceCodeSession(
        clientId: string,
    ): Promise<DeviceCodeSession> {
        this.sequence += 1;
        const suffix = String(this.sequence).padStart(4, '0');
        return this.seed({
            deviceCode: `dev-code-${suffix}`,
            userCode: `WDVX-QR${suffix}`,
            clientId,
        });
    }

    async getDeviceCodeSessionByUserCode(
        userCode: string,
    ): Promise<DeviceCodeSession | null> {
        const normalized = userCode.toUpperCase();
        for (const session of this.sessions.values()) {
            if (session.userCode.toUpperCase() === normalized) return session;
        }
        return null;
    }

    async getDeviceCodeSessionByDeviceCode(
        deviceCode: string,
    ): Promise<DeviceCodeSession | null> {
        return this.sessions.get(deviceCode) ?? null;
    }

    async approveDeviceCode({
        deviceCode,
        userId,
        organizationUuid,
    }: {
        deviceCode: string;
        userId: number;
        organizationUuid: string;
    }): Promise<boolean> {
        const session = this.sessions.get(deviceCode);
        if (
            !session ||
            session.status !== 'pending' ||
            session.expiresAt.getTime() <= Date.now()
        ) {
            return false;
        }
        session.status = 'authorized';
        session.userId = userId;
        session.organizationUuid = organizationUuid;
        return true;
    }

    async denyDeviceCode(deviceCode: string): Promise<boolean> {
        const session = this.sessions.get(deviceCode);
        if (
            !session ||
            session.status !== 'pending' ||
            session.expiresAt.getTime() <= Date.now()
        ) {
            return false;
        }
        session.status = 'denied';
        return true;
    }

    async consumeDeviceCode(
        deviceCode: string,
    ): Promise<DeviceCodeSession | null> {
        const session = this.sessions.get(deviceCode);
        if (
            !session ||
            session.status !== 'authorized' ||
            session.expiresAt.getTime() <= Date.now()
        ) {
            return null;
        }
        // Atomic consume (UPDATE ... RETURNING semantics): the row is kept
        // so a failed token minting can be compensated by releaseDeviceCode.
        session.status = 'consumed';
        return session;
    }

    async releaseDeviceCode(deviceCode: string): Promise<boolean> {
        const session = this.sessions.get(deviceCode);
        if (!session || session.status !== 'consumed') return false;
        session.status = 'authorized';
        return true;
    }

    async deleteDeviceCode(deviceCode: string): Promise<boolean> {
        return this.sessions.delete(deviceCode);
    }

    async deleteExpiredDeviceCodes(): Promise<number> {
        let removed = 0;
        const now = Date.now();
        for (const [deviceCode, session] of this.sessions) {
            if (session.expiresAt.getTime() <= now) {
                this.sessions.delete(deviceCode);
                removed += 1;
            }
        }
        return removed;
    }

    async isDeviceFlowAtCapacity(): Promise<boolean> {
        return this.atCapacity;
    }

    async createDeviceToken({
        clientId,
        userId,
        organizationUuid,
    }: {
        clientId: string;
        userId: number;
        organizationUuid: string;
    }): Promise<{
        accessToken: string;
        accessTokenExpiresAt: Date;
        refreshToken: string;
        scope: string[];
    }> {
        if (this.failNextMint) {
            this.failNextMint = false;
            throw new Error('token minting failed');
        }
        expect(clientId).toEqual('msy-x-cli');
        expect(userId).toEqual(TEST_USER.userId);
        expect(organizationUuid).toEqual(TEST_USER.organizationUuid);
        this.mintedTokens += 1;
        return {
            accessToken: `access-token-${this.mintedTokens}`,
            accessTokenExpiresAt: new Date(Date.now() + 3600_000),
            refreshToken: `refresh-token-${this.mintedTokens}`,
            scope: ['mcp:read'],
        };
    }

    /** introspect 用：access token 有效期（秒） */
    accessTokenLifetimeSeconds = 3600;

    /** introspect 路径：authenticate() 返回的 token（tests 可覆盖该字段） */
    authenticateResult: AnyType = {
        accessToken: 'access-token',
        accessTokenExpiresAt: new Date('2026-11-26T10:00:00.000Z'),
        client: { id: 'msy-x-cli' },
        user: { userUuid: TEST_USER.organizationUuid },
        scope: ['mcp:read'],
    };

    async authenticate(): Promise<AnyType> {
        return this.authenticateResult;
    }
}

type AppHandle = { server: Server; baseUrl: string };

const openServers: Server[] = [];

/** Builds an app around the router with stubbed services/session middlewares. */
const startApp = async (
    service: InMemoryDeviceFlowService,
    {
        withUser = true,
        onError,
        accessTokenLifetime,
    }: {
        withUser?: boolean;
        /** Custom app-level error middleware (assert the next(error) chain). */
        onError?: express.ErrorRequestHandler;
        /** 模拟 AUTH_OAUTH_SERVER_ACCESS_TOKEN_LIFETIME（秒） */
        accessTokenLifetime?: number;
    } = {},
): Promise<AppHandle> => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(
        (req: AnyType, _res: express.Response, next: express.NextFunction) => {
            req.services = { getOauthService: () => service };
            if (withUser) req.user = TEST_USER;
            next();
        },
    );
    app.use('/api/v1/oauth', oauthRouter);
    if (onError) {
        app.use(onError);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        app.use(
            (
                err: AnyType,
                _req: express.Request,
                res: express.Response,
                _next: express.NextFunction,
            ) => {
                res.status(err.statusCode ?? 500).json({ error: err.message });
            },
        );
    }

    const server = await new Promise<Server>((resolve) => {
        const httpServer = app.listen(0, () => resolve(httpServer));
    });
    openServers.push(server);
    const { port } = server.address() as AddressInfo;
    return { server, baseUrl: `http://127.0.0.1:${port}/api/v1/oauth` };
};

type TestResponse = {
    status: number;
    headers: http.IncomingHttpHeaders;
    text: string;
};

/**
 * Uses the node http client on purpose: the global fetch client honours
 * HTTP_PROXY, which would route local test requests to the proxy.
 */
const request = (
    baseUrl: string,
    path: string,
    {
        method = 'GET',
        body,
        contentType,
    }: { method?: string; body?: string; contentType?: string } = {},
): Promise<TestResponse> =>
    new Promise<TestResponse>((resolve, reject) => {
        const req = http.request(
            `${baseUrl}${path}`,
            {
                method,
                headers: body
                    ? { 'content-type': contentType ?? 'application/json' }
                    : undefined,
            },
            (response) => {
                let text = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => {
                    text += chunk;
                });
                response.on('end', () => {
                    resolve({
                        status: response.statusCode ?? 0,
                        headers: response.headers,
                        text,
                    });
                });
            },
        );
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });

const get = (baseUrl: string, path: string) => request(baseUrl, path);

const postJson = (
    baseUrl: string,
    path: string,
    data: Record<string, unknown>,
) =>
    request(baseUrl, path, {
        method: 'POST',
        body: JSON.stringify(data),
        contentType: 'application/json',
    });

const postForm = (
    baseUrl: string,
    path: string,
    data: Record<string, string>,
) =>
    request(baseUrl, path, {
        method: 'POST',
        body: new URLSearchParams(data).toString(),
        contentType: 'application/x-www-form-urlencoded',
    });

/** Rejects when the promise has not settled within `ms` (hung-request guard). */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new Error(`request did not settle within ${ms}ms`)),
            ms,
        );
    });
    return Promise.race([promise, timeout]).finally(() => {
        clearTimeout(timer);
    });
};

/** POST /device on the given app; returns the parsed device authorization. */
const requestDeviceCode = async (app: AppHandle) => {
    const response = await postJson(app.baseUrl, '/device', {
        client_id: 'msy-x-cli',
    });
    expect(response.status).toEqual(200);
    return JSON.parse(response.text) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        verification_uri_complete: string;
        expires_in: number;
        interval: number;
    };
};

describe('oauthRouter device flow (shared store across replicas)', () => {
    // Two independent app/server instances sharing ONE service instance:
    // appA plays the replica the CLI polls, appB the one the phone hits.
    let service: InMemoryDeviceFlowService;
    let appA: AppHandle;
    let appB: AppHandle;

    beforeEach(async () => {
        service = new InMemoryDeviceFlowService();
        appA = await startApp(service);
        appB = await startApp(service);
    });

    afterEach(async () => {
        await Promise.all(
            openServers.splice(0).map(
                (server) =>
                    new Promise<void>((resolve, reject) => {
                        server.close((err) => (err ? reject(err) : resolve()));
                    }),
            ),
        );
    });

    it('completes the QR login flow across two app instances sharing one store', async () => {
        // 1. CLI asks replica A for a device code
        const device = await requestDeviceCode(appA);
        expect(device.device_code).toMatch(/^dev-code-\d{4}$/);
        expect(device.user_code).toMatch(/^WDVX-QR\d{4}$/);
        expect(device.verification_uri).toEqual(
            `${SITE_URL}/api/v1/oauth/device/activate`,
        );
        expect(device.verification_uri_complete).toEqual(
            `${SITE_URL}/api/v1/oauth/device/activate?user_code=${device.user_code}`,
        );
        expect(device.expires_in).toEqual(DEVICE_CODE_TTL_MS / 1000);
        expect(device.interval).toEqual(DEVICE_POLL_INTERVAL_SECONDS);

        // 2. phone scans the QR and opens the activation page on replica B
        const activatePage = await get(
            appB.baseUrl,
            `/device/activate?user_code=${device.user_code}`,
        );
        expect(activatePage.status).toEqual(200);
        expect(activatePage.headers['content-type']).toContain('text/html');
        expect(activatePage.text).toContain('终端登录确认');
        expect(activatePage.text).toContain(device.user_code);

        // 3. user approves on replica B (browser form post, no approve field)
        const approval = await postForm(appB.baseUrl, '/device/activate', {
            user_code: device.user_code,
        });
        expect(approval.status).toEqual(200);
        expect(approval.headers['content-type']).toContain('text/html');
        expect(approval.text).toContain('终端登录成功！');

        // the shared store now holds the authorization
        const stored = await service.getDeviceCodeSessionByUserCode(
            device.user_code,
        );
        expect(stored?.status).toEqual('authorized');
        expect(stored?.userId).toEqual(TEST_USER.userId);
        expect(stored?.organizationUuid).toEqual(TEST_USER.organizationUuid);

        // 4. CLI redeems the token on replica A
        const token = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(token.status).toEqual(200);
        expect(JSON.parse(token.text)).toEqual({
            access_token: 'access-token-1',
            token_type: 'Bearer',
            expires_in: expect.any(Number),
            refresh_token: 'refresh-token-1',
            scope: 'mcp:read',
        });
        expect(JSON.parse(token.text).expires_in).toBeGreaterThan(0);
        expect(service.mintedTokens).toEqual(1);
    });

    it('redeems a device session exactly once (second token request fails)', async () => {
        const device = await requestDeviceCode(appA);
        const approval = await postForm(appB.baseUrl, '/device/activate', {
            user_code: device.user_code,
        });
        expect(approval.status).toEqual(200);

        const first = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(first.status).toEqual(200);

        const second = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(second.status).toEqual(400);
        expect(JSON.parse(second.text)).toEqual({ error: 'invalid_grant' });
        expect(service.mintedTokens).toEqual(1);
    });

    it('returns authorization_pending while the code is not approved yet', async () => {
        const device = await requestDeviceCode(appA);

        const response = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(response.status).toEqual(400);
        expect(JSON.parse(response.text)).toEqual({
            error: 'authorization_pending',
        });
    });

    it('supports denying the terminal login, then rejects the token with access_denied', async () => {
        const device = await requestDeviceCode(appA);

        const denial = await postForm(appB.baseUrl, '/device/activate', {
            user_code: device.user_code,
            approve: 'false',
        });
        expect(denial.status).toEqual(200);
        expect(denial.text).toContain('已拒绝登录');
        expect(
            await service.getDeviceCodeSessionByUserCode(device.user_code),
        ).toMatchObject({ status: 'denied' });

        const token = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(token.status).toEqual(400);
        expect(JSON.parse(token.text)).toEqual({ error: 'access_denied' });
    });

    it('reports expired codes on both the activation page and the token endpoint', async () => {
        // GET /device/activate deletes the expired session after rendering,
        // so each half gets its own seeded session.
        service.seed({
            deviceCode: 'expired-device-1',
            userCode: 'EXPI-RED1',
            expiresAt: new Date(Date.now() - 1000),
        });
        const activatePage = await get(
            appB.baseUrl,
            '/device/activate?user_code=EXPI-RED1',
        );
        expect(activatePage.status).toEqual(400);
        expect(activatePage.text).toContain('验证码已过期');

        service.seed({
            deviceCode: 'expired-device-2',
            userCode: 'EXPI-RED2',
            expiresAt: new Date(Date.now() - 1000),
        });
        const token = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: 'expired-device-2',
        });
        expect(token.status).toEqual(400);
        expect(JSON.parse(token.text)).toEqual({ error: 'expired_token' });
    });

    it('rejects an unknown user code on the activation page', async () => {
        const response = await get(
            appB.baseUrl,
            '/device/activate?user_code=NOPE-CODE',
        );
        expect(response.status).toEqual(400);
        expect(response.text).toContain('验证码无效');
    });

    it('rejects approving the same code twice', async () => {
        const device = await requestDeviceCode(appA);

        const first = await postForm(appB.baseUrl, '/device/activate', {
            user_code: device.user_code,
        });
        expect(first.status).toEqual(200);
        expect(first.text).toContain('终端登录成功！');

        const second = await postForm(appA.baseUrl, '/device/activate', {
            user_code: device.user_code,
        });
        expect(second.status).toEqual(400);
        expect(second.text).toContain('验证码已被使用');
    });

    it('rejects the device flow for clients that are not pre-registered', async () => {
        const response = await postJson(appA.baseUrl, '/device', {
            client_id: 'some-random',
        });
        expect(response.status).toEqual(400);
        expect(JSON.parse(response.text)).toMatchObject({
            error: 'unauthorized_client',
        });
        expect(service.sessions.size).toEqual(0);
    });

    it('backs off with slow_down when the device flow is at capacity', async () => {
        service.atCapacity = true;

        const response = await postJson(appA.baseUrl, '/device', {
            client_id: 'msy-x-cli',
        });
        expect(response.status).toEqual(429);
        expect(JSON.parse(response.text)).toMatchObject({
            error: 'slow_down',
        });
        expect(service.sessions.size).toEqual(0);
    });

    it('redirects unauthenticated users to the login page', async () => {
        const anonymous = await startApp(service, { withUser: false });

        const response = await get(
            anonymous.baseUrl,
            '/device/activate?user_code=WDVX-QR0001',
        );
        expect(response.status).toEqual(302);
        expect(String(response.headers.location)).toMatch(
            /^\/login\?redirect=/,
        );
    });

    it('derives all state from the injected service, not from module-level router state', async () => {
        // Boundary: the router's state comes ONLY from the injected
        // service. If oauthRouter kept any module-level session state (as
        // the pre-Postgres in-memory store did), an app built on a fresh
        // store would still resolve codes created by appA and the
        // assertions below would fail.
        const isolatedStore = new InMemoryDeviceFlowService();
        const appC = await startApp(isolatedStore);

        const device = await requestDeviceCode(appA);
        expect(isolatedStore.sessions.size).toEqual(0);

        const activatePage = await get(
            appC.baseUrl,
            `/device/activate?user_code=${device.user_code}`,
        );
        expect(activatePage.status).toEqual(400);
        expect(activatePage.text).toContain('验证码无效');

        const token = await postJson(appC.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(token.status).toEqual(400);
        expect(JSON.parse(token.text)).toEqual({ error: 'invalid_grant' });
    });

    it('self-heals when token minting fails: 500 server_error, then a retry succeeds', async () => {
        const device = await requestDeviceCode(appA);
        const approval = await postForm(appB.baseUrl, '/device/activate', {
            user_code: device.user_code,
        });
        expect(approval.status).toEqual(200);

        // The consume succeeds, but minting throws: the router compensates
        // by releasing the session back to 'authorized'.
        service.failNextMint = true;
        const first = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(first.status).toEqual(500);
        expect(JSON.parse(first.text)).toEqual({ error: 'server_error' });
        expect(service.mintedTokens).toEqual(0);

        const stored = await service.getDeviceCodeSessionByDeviceCode(
            device.device_code,
        );
        expect(stored).not.toBeNull();
        expect(stored?.status).toEqual('authorized');

        // The CLI retries polling and gets its token without re-scanning.
        const second = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
        });
        expect(second.status).toEqual(200);
        expect(JSON.parse(second.text)).toMatchObject({
            access_token: 'access-token-1',
            refresh_token: 'refresh-token-1',
        });
        expect(service.mintedTokens).toEqual(1);
    });

    it('rejects a consumed session on both the token endpoint and the activation page', async () => {
        // Simulates the consume race loser: another poll already flipped
        // the session to 'consumed' (the row is kept, not deleted).
        service.seed({
            deviceCode: 'consumed-device-1',
            userCode: 'CONS-UMED1',
            status: 'consumed',
        });

        const token = await postJson(appA.baseUrl, '/device/token', {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: 'consumed-device-1',
        });
        expect(token.status).toEqual(400);
        expect(JSON.parse(token.text)).toEqual({ error: 'invalid_grant' });

        const activatePage = await get(
            appB.baseUrl,
            '/device/activate?user_code=CONS-UMED1',
        );
        expect(activatePage.status).toEqual(400);
        expect(activatePage.text).toContain('验证码已被使用');
    });

    it('answers 500 within 1s when the store throws (next(error) chain, no hang)', async () => {
        const propagated: { error: Error | null } = { error: null };
        const onError: express.ErrorRequestHandler = (
            err,
            _req,
            res,
            // Express detects error handlers by arity: keep 4 parameters.
            _next,
        ) => {
            propagated.error =
                err instanceof Error ? err : new Error(String(err));
            res.status(500).json({ error: 'internal' });
        };
        const appDbDown = await startApp(service, { onError });

        jest.spyOn(
            service,
            'getDeviceCodeSessionByDeviceCode',
        ).mockRejectedValue(new Error('db down'));

        const response = await withTimeout(
            postJson(appDbDown.baseUrl, '/device/token', {
                grant_type: DEVICE_GRANT_TYPE,
                device_code: 'any-device-code',
            }),
            1000,
        );

        expect(response.status).toEqual(500);
        expect(JSON.parse(response.text)).toEqual({ error: 'internal' });
        expect(propagated.error?.message).toEqual('db down');
    });
});

describe('oauthRouter introspect', () => {
    const EXPIRES_AT = new Date('2026-11-26T10:00:00.000Z');
    const EXP_SECONDS = Math.floor(EXPIRES_AT.getTime() / 1000);

    const startIntrospectApp = async (accessTokenLifetime?: number) => {
        const service = new InMemoryDeviceFlowService();
        if (accessTokenLifetime !== undefined) {
            service.accessTokenLifetimeSeconds = accessTokenLifetime;
        }
        const app = await startApp(service);
        return { app, service };
    };

    afterEach(async () => {
        await Promise.all(
            openServers.splice(0).map(
                (server) =>
                    new Promise<void>((resolve, reject) => {
                        server.close((err) => (err ? reject(err) : resolve()));
                    }),
            ),
        );
    });

    it('derives iat from the configured lifetime instead of a hardcoded 3600', async () => {
        const { app } = await startIntrospectApp(7200);
        const response = await postJson(app.baseUrl, '/introspect', {
            token: 'access-token',
        });

        expect(response.status).toEqual(200);
        const body = JSON.parse(response.text);
        expect(body.active).toBe(true);
        expect(body.exp).toEqual(EXP_SECONDS);
        // 7200 秒有效期 → iat = exp - 7200；写死 3600 会得到偏大 3600 的 iat
        expect(body.iat).toEqual(EXP_SECONDS - 7200);
        // RFC 7662：token_type 固定 Bearer（与 /token 端点一致）
        expect(body.token_type).toEqual('Bearer');
    });

    it('falls back to 3600 when no lifetime is configured', async () => {
        const { app } = await startIntrospectApp(undefined);
        const response = await postJson(app.baseUrl, '/introspect', {
            token: 'access-token',
        });

        const body = JSON.parse(response.text);
        expect(body.iat).toEqual(EXP_SECONDS - 3600);
    });
});
