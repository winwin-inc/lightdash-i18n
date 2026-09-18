import {
    AuthorizationError,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import { analyticsMock } from '../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import { UserModel } from '../models/UserModel';
import { McpTokenExchangeService } from './McpTokenExchangeService';

describe('McpTokenExchangeService', () => {
    function buildService(overrides?: {
        secret?: string;
        patTtlSeconds?: number;
        patTtlMaxSeconds?: number;
        user?: { userId: number; userUuid: string } | null;
        createToken?: string;
    }) {
        const config = {
            ...lightdashConfigMock,
            mcp: {
                ...lightdashConfigMock.mcp,
                tokenExchangeSecret: overrides?.secret ?? 'mcp-secret',
                patTtlSeconds: overrides?.patTtlSeconds ?? 3600,
                patTtlMaxSeconds: overrides?.patTtlMaxSeconds ?? 86400,
            },
        };
        const userModel = {
            findSessionUserByPrimaryEmail: jest.fn(async () =>
                overrides?.user === null
                    ? undefined
                    : (overrides?.user ?? {
                          userId: 1,
                          userUuid: 'user-uuid-1',
                      }),
            ),
        } as unknown as UserModel;
        const personalAccessTokenModel = {
            create: jest.fn(async () => ({
                token: overrides?.createToken ?? 'ldpat_test_token',
                uuid: 'pat-uuid',
                createdAt: new Date(),
                lastUsedAt: null,
                rotatedAt: null,
                expiresAt: new Date(),
                description: 'mcp-keycloak-exchange',
            })),
        } as unknown as PersonalAccessTokenModel;

        return new McpTokenExchangeService({
            lightdashConfig: config,
            analytics: analyticsMock,
            userModel,
            personalAccessTokenModel,
        });
    }

    it('rejects missing or invalid exchange secret', async () => {
        const service = buildService();
        await expect(
            service.exchangeEmailForPat({
                authorizationHeader: undefined,
                email: 'a@example.com',
            }),
        ).rejects.toThrow(AuthorizationError);
        await expect(
            service.exchangeEmailForPat({
                authorizationHeader: 'Bearer wrong',
                email: 'a@example.com',
            }),
        ).rejects.toThrow(AuthorizationError);
    });

    it('rejects invalid email', async () => {
        const service = buildService();
        await expect(
            service.exchangeEmailForPat({
                authorizationHeader: 'Bearer mcp-secret',
                email: 'not-an-email',
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('returns NotFoundError when user missing', async () => {
        const service = buildService({ user: null });
        await expect(
            service.exchangeEmailForPat({
                authorizationHeader: 'Bearer mcp-secret',
                email: 'missing@example.com',
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it('mints PAT and clamps TTL to max', async () => {
        const service = buildService({
            patTtlSeconds: 999_999,
            patTtlMaxSeconds: 100,
        });
        expect(service.resolveTtlSeconds()).toBe(100);

        const before = Date.now();
        const result = await service.exchangeEmailForPat({
            authorizationHeader: 'Bearer mcp-secret',
            email: 'demo@example.com',
        });
        const after = Date.now();

        expect(result.accessToken).toBe('ldpat_test_token');
        expect(result.tokenType).toBe('ApiKey');
        expect(result.userUuid).toBe('user-uuid-1');
        expect(result.email).toBe('demo@example.com');

        const expiresAtMs = Date.parse(result.expiresAt);
        expect(Number.isFinite(expiresAtMs)).toBe(true);
        expect(expiresAtMs).toBeGreaterThanOrEqual(before + 100 * 1000 - 50);
        expect(expiresAtMs).toBeLessThanOrEqual(after + 100 * 1000 + 50);
    });
});
