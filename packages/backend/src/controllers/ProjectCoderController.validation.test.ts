/**
 * Verifies the TSOA runtime validation behaviour of the as-code upsert routes.
 *
 * TSOA validates request bodies even when `validation` is not enabled in
 * tsoa.yml (ExpressTemplateService.getValidatedArgs always runs type checks).
 * The dashboard upsert body must therefore tolerate everything our download
 * command emits (or emitted in the past):
 *
 * - `config: null` (legacy downloads; nullable dashboard_versions.config)
 * - `tabs[].filters.dimensions[]` rules without `id` (portable export strips ids)
 *
 * The controller container is mocked so that any request which passes
 * validation surfaces as a distinctive CONTAINER_REACHED error, proving the
 * body was accepted by the validation layer.
 */
import express, { type Express } from 'express';
import type { Server } from 'http';
import { request as httpRequest } from 'http';
import { RegisterRoutes } from '../generated/routes';

jest.mock('../services/tsoaServiceContainer', () => ({
    iocContainer: () => ({
        get: async () => {
            throw new Error('CONTAINER_REACHED');
        },
    }),
}));

// The generated routes pull in every controller (and therefore every model).
// Native deps without a local build (bcrypt) are mocked so the module graph
// loads in any environment; validation runs long before any of them execute.
jest.mock('bcrypt', () => ({
    __esModule: true,
    default: {
        compareSync: () => false,
        hashSync: () => 'hashed',
        genSaltSync: () => 'salt',
    },
    compareSync: () => false,
    hashSync: () => 'hashed',
    genSaltSync: () => 'salt',
}));

const startApp = async (): Promise<{
    app: Express;
    server: Server;
    url: string;
}> => {
    const app = express();
    app.use(express.json());
    // Auth middlewares from the controller decorators expect a passport-ish
    // request; validation runs after them, so stub a minimal active user.
    app.use((req, _res, next) => {
        req.user = { userUuid: 'test-user', isActive: true } as never;
        (req as { isAuthenticated?: () => boolean }).isAuthenticated = () =>
            true;
        next();
    });
    RegisterRoutes(app);
    app.use(
        (
            err: { status?: number; message?: string },
            _req: express.Request,
            res: express.Response,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _next: express.NextFunction,
        ) => {
            res.status(err.status ?? 500).json({
                message: String(err.message),
            });
        },
    );
    const server = app.listen(0);
    await new Promise<void>((resolve) => {
        server.once('listening', () => resolve());
    });
    const address = server.address();
    if (typeof address === 'string' || address === null) {
        throw new Error('expected a tcp listener');
    }
    return { app, server, url: `http://127.0.0.1:${address.port}` };
};

const postDashboard = async (
    url: string,
    body: unknown,
): Promise<{ status: number; body: { message?: string } }> => {
    const { hostname, port } = new URL(url);
    const payload = JSON.stringify(body);
    const response = await new Promise<{ status: number; text: string }>(
        (resolve, reject) => {
            const req = httpRequest(
                {
                    hostname,
                    port: Number(port),
                    path: '/api/v1/projects/test-project/code/dashboards/test-slug',
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'content-length': Buffer.byteLength(payload),
                    },
                },
                (res) => {
                    let text = '';
                    res.on('data', (chunk: Buffer) => {
                        text += chunk.toString();
                    });
                    res.on('end', () => {
                        resolve({ status: res.statusCode ?? 0, text });
                    });
                },
            );
            req.on('error', reject);
            req.write(payload);
            req.end();
        },
    );
    if (process.env.DEBUG_VALIDATION_TEST) {
        // eslint-disable-next-line no-console
        console.log('RESPONSE', response.status, response.text.slice(0, 300));
    }
    let parsed: { message?: string } = {};
    try {
        parsed = JSON.parse(response.text) as { message?: string };
    } catch {
        parsed = { message: response.text.slice(0, 200) };
    }
    return { status: response.status, body: parsed };
};

const validDashboardBody = {
    name: 'Dashboard',
    slug: 'test-slug',
    spaceSlug: 'space',
    version: 1,
    updatedAt: new Date().toISOString(),
    force: true,
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tiles: [],
    tabs: [{ slug: 'overview', name: 'Overview', order: 0 }],
};

describe('upsertCodeDashboard TSOA validation', () => {
    let server: Server;
    let url: string;

    beforeAll(async () => {
        ({ server, url } = await startApp());
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    });

    it('rejects an invalid body so the harness proves validation is active', async () => {
        const { status, body } = await postDashboard(url, {
            slug: 'test-slug',
            spaceSlug: 'space',
            version: 1,
            tabs: [],
            tiles: [],
            filters: {},
        });

        // TSOA ValidateError → 400 with no CONTAINER_REACHED marker
        expect(status).toBe(400);
        expect(String(body.message)).not.toContain('CONTAINER_REACHED');
    });

    it('accepts legacy `config: null` bodies', async () => {
        const { body } = await postDashboard(url, {
            ...validDashboardBody,
            config: null,
            description: null,
        });

        expect(String(body.message)).toContain('CONTAINER_REACHED');
    });

    it('accepts tab-level filters whose dimension rules have no id', async () => {
        const { body } = await postDashboard(url, {
            ...validDashboardBody,
            tabs: [
                {
                    slug: 'overview',
                    name: 'Overview',
                    order: 0,
                    filters: {
                        dimensions: [
                            {
                                operator: 'equals',
                                target: {
                                    fieldId: 'orders_status',
                                    tableName: 'orders',
                                },
                                values: ['completed'],
                            },
                        ],
                        metrics: [],
                        tableCalculations: [],
                    },
                },
            ],
        });

        expect(String(body.message)).toContain('CONTAINER_REACHED');
    });
});
