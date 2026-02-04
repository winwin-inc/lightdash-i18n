// organize-imports-ignore
// eslint-disable-next-line import/order
import './sentry'; // Sentry has to be initialized before anything else
import {
    Account,
    AnyType,
    ApiError,
    getErrorMessage,
    LightdashError,
    LightdashMode,
    LightdashVersionHeader,
    MissingConfigError,
    OauthAuthenticationError,
    Project,
    ServiceAccount,
    SessionUser,
    UnexpectedServerError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import flash from 'connect-flash';
import connectSessionKnex from 'connect-session-knex';
import express, { Express, NextFunction, Request, Response } from 'express';
import expressSession from 'express-session';
import expressStaticGzip from 'express-static-gzip';
import helmet from 'helmet';
import knex, { Knex } from 'knex';
import passport from 'passport';
import refresh from 'passport-oauth2-refresh';
import path from 'path';
import reDoc from 'redoc-express';
import { URL } from 'url';
import cors from 'cors';
import { produce } from 'immer';
import * as fs from 'fs';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import {
    ClientProviderMap,
    ClientRepository,
} from './clients/ClientRepository';
import { LightdashConfig } from './config/parseConfig';
import {
    apiKeyPassportStrategy,
    createAzureAdPassportStrategy,
    createGenericOidcPassportStrategy,
    googlePassportStrategy,
    invalidUserErrorHandler,
    isAzureAdPassportStrategyAvailableToUse,
    isGenericOidcPassportStrategyAvailableToUse,
    isOktaPassportStrategyAvailableToUse,
    localPassportStrategy,
    oneLoginPassportStrategy,
    OpenIDClientOktaStrategy,
} from './controllers/authentication';
import { errorHandler, scimErrorHandler } from './errors';
import { RegisterRoutes } from './generated/routes';
import apiSpec from './generated/swagger.json';
import Logger from './logging/logger';
import {
    expressWinstonMiddleware,
    expressWinstonPreResponseMiddleware,
} from './logging/winston';
import { ModelProviderMap, ModelRepository } from './models/ModelRepository';
import { postHogClient } from './postHog';
import { apiV1Router } from './routers/apiV1Router';
import {
    oauthAuthorizationServerHandler,
    oauthProtectedResourceHandler,
} from './routers/oauthRouter';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import {
    OperationContext,
    ServiceProviderMap,
    ServiceRepository,
} from './services/ServiceRepository';
import { UtilProviderMap, UtilRepository } from './utils/UtilRepository';
import { VERSION } from './version';
import PrometheusMetrics from './prometheus';
import { snowflakePassportStrategy } from './controllers/authentication/strategies/snowflakeStrategy';
import { jwtAuthMiddleware } from './middlewares/jwtAuthMiddleware';
import { InstanceConfigurationService } from './services/InstanceConfigurationService/InstanceConfigurationService';
import { slackPassportStrategy } from './controllers/authentication/strategies/slackStrategy';
import { SlackClient } from './clients/Slack/SlackClient';
import { sessionAccountMiddleware } from './middlewares/accountMiddleware';

// We need to override this interface to have our user typing
declare global {
    namespace Express {
        /**
         * There's potentially a good case for NOT including this under the top-level of the Request,
         * but instead under `locals` - I've yet to see a good reasoning on -why-, so for now I'm
         * opting for the keystrokes saved through omitting `.locals`.
         */
        interface Request {
            services: ServiceRepository;
            serviceAccount?: Pick<ServiceAccount, 'organizationUuid'>;
            // The project associated with this request
            project?: Pick<Project, 'projectUuid'>;
            /**
             * @deprecated Clients should be used inside services. This will be removed soon.
             */
            clients: ClientRepository;
            account?: Account;
        }

        interface User extends SessionUser {}
    }
}

const schedulerWorkerFactory = (context: {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    serviceRepository: ServiceRepository;
    models: ModelRepository;
    clients: ClientRepository;
    utils: UtilRepository;
}) =>
    new SchedulerWorker({
        lightdashConfig: context.lightdashConfig,
        analytics: context.analytics,
        // SlackClient should initialize before UnfurlService and AiAgentService
        slackClient: context.clients.getSlackClient(),
        unfurlService: context.serviceRepository.getUnfurlService(),
        csvService: context.serviceRepository.getCsvService(),
        dashboardService: context.serviceRepository.getDashboardService(),
        projectService: context.serviceRepository.getProjectService(),
        schedulerService: context.serviceRepository.getSchedulerService(),
        validationService: context.serviceRepository.getValidationService(),
        userService: context.serviceRepository.getUserService(),
        emailClient: context.clients.getEmailClient(),
        googleDriveClient: context.clients.getGoogleDriveClient(),
        s3Client: context.clients.getS3Client(),
        schedulerClient: context.clients.getSchedulerClient(),
        msTeamsClient: context.clients.getMsTeamsClient(),
        catalogService: context.serviceRepository.getCatalogService(),
        encryptionUtil: context.utils.getEncryptionUtil(),
        renameService: context.serviceRepository.getRenameService(),
        asyncQueryService: context.serviceRepository.getAsyncQueryService(),
    });

export type AppArguments = {
    lightdashConfig: LightdashConfig;
    port: string | number;
    environment?: 'production' | 'development';
    serviceProviders?: ServiceProviderMap;
    knexConfig: {
        production: Knex.Config<Knex.PgConnectionConfig>;
        development: Knex.Config<Knex.PgConnectionConfig>;
    };
    clientProviders?: ClientProviderMap;
    modelProviders?: ModelProviderMap;
    utilProviders?: UtilProviderMap;
    schedulerWorkerFactory?: typeof schedulerWorkerFactory;
    customExpressMiddlewares?: Array<(app: Express) => void>; // Array of custom middleware functions
};

export default class App {
    private readonly serviceRepository: ServiceRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private schedulerWorker: SchedulerWorker | undefined;

    private readonly clients: ClientRepository;

    private readonly utils: UtilRepository;

    private readonly models: ModelRepository;

    private readonly database: Knex;

    private readonly schedulerWorkerFactory: typeof schedulerWorkerFactory;

    private readonly prometheusMetrics: PrometheusMetrics;

    private readonly customExpressMiddlewares: Array<(app: Express) => void>;

    constructor(args: AppArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.port = args.port;
        this.environment = args.environment || 'production';
        this.analytics = new LightdashAnalytics({
            lightdashConfig: this.lightdashConfig,
            writeKey: this.lightdashConfig.rudder.writeKey || 'notrack',
            dataPlaneUrl: this.lightdashConfig.rudder.dataPlaneUrl
                ? this.lightdashConfig.rudder.dataPlaneUrl
                : 'notrack',
            options: {
                enable:
                    this.lightdashConfig.rudder.writeKey &&
                    this.lightdashConfig.rudder.dataPlaneUrl,
            },
        });
        this.database = knex(
            this.environment === 'production'
                ? args.knexConfig.production
                : args.knexConfig.development,
        );
        this.utils = new UtilRepository({
            utilProviders: args.utilProviders,
            lightdashConfig: this.lightdashConfig,
        });
        this.models = new ModelRepository({
            modelProviders: args.modelProviders,
            lightdashConfig: this.lightdashConfig,
            database: this.database,
            utils: this.utils,
        });
        this.clients = new ClientRepository({
            clientProviders: args.clientProviders,
            context: new OperationContext({
                operationId: 'App#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            models: this.models,
        });
        this.prometheusMetrics = new PrometheusMetrics(
            this.lightdashConfig.prometheus,
        );
        this.serviceRepository = new ServiceRepository({
            serviceProviders: args.serviceProviders,
            context: new OperationContext({
                operationId: 'App#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            clients: this.clients,
            models: this.models,
            utils: this.utils,
            prometheusMetrics: this.prometheusMetrics,
        });
        this.schedulerWorkerFactory =
            args.schedulerWorkerFactory || schedulerWorkerFactory;
        this.customExpressMiddlewares = args.customExpressMiddlewares || [];
    }

    async start() {
        this.prometheusMetrics.start();
        this.prometheusMetrics.monitorDatabase(this.database);
        // @ts-ignore
        // eslint-disable-next-line no-extend-native, func-names
        BigInt.prototype.toJSON = function () {
            return this.toString();
        };

        const expressApp = express();

        // Slack must be initialized before our own middleware / routes, which cause the slack app to fail
        this.initSlack(expressApp).catch((e) => {
            Logger.error('Error starting slack bot', e);
        });

        Sentry.setTags({
            k8s_pod_name: this.lightdashConfig.k8s.podName,
            k8s_pod_namespace: this.lightdashConfig.k8s.podNamespace,
            k8s_node_name: this.lightdashConfig.k8s.nodeName,
            lightdash_cloud_instance:
                this.lightdashConfig.lightdashCloudInstance,
        });

        // Load Lightdash middleware/routes last
        await this.initExpress(expressApp);

        if (this.lightdashConfig.scheduler?.enabled) {
            this.initSchedulerWorker();
            this.prometheusMetrics.monitorQueues(
                this.clients.getSchedulerClient(),
            );
        }

        try {
            const instanceConfigurationService =
                this.serviceRepository.getInstanceConfigurationService<InstanceConfigurationService>();
            await instanceConfigurationService.initializeInstance();
            await instanceConfigurationService.updateInstanceConfiguration();
        } catch (e) {
            if (e instanceof MissingConfigError) {
                Logger.debug(
                    `No instance configuration service found: ${getErrorMessage(
                        e,
                    )}`,
                );
            } else {
                throw e;
            }
        }
    }

    /**
     * Inject CDN base tag into HTML content
     * Builds the full CDN URL from CDN_BASE_URL, CDN_PATH_PREFIX, and STATIC_FILES_VERSION
     * @param html - Original HTML content
     * @returns HTML content with CDN base tag injected
     */
    private injectCdnBaseTag(html: string): string {
        const cdnConfig = this.lightdashConfig.cdn;
        if (!cdnConfig?.baseUrl) {
            return html;
        }

        // CDN_BASE_URL should be the CDN domain without path prefix
        // e.g., https://cdn.lightdash.com
        const cdnDomain = cdnConfig.baseUrl.endsWith('/')
            ? cdnConfig.baseUrl.slice(0, -1)
            : cdnConfig.baseUrl;
        // Build full path: {CDN_PATH_PREFIX}/static/{version}/
        const pathPrefix = cdnConfig.pathPrefix || 'msy-x';
        const staticPath = 'static';
        // Ensure version is included in base URL if available
        // Validate that staticFilesVersion is a non-empty string before using it
        const staticFilesVersion = cdnConfig.staticFilesVersion?.trim();
        const version =
            staticFilesVersion && staticFilesVersion.length > 0
                ? `${staticFilesVersion}/`
                : '';
        // Ensure base URL always ends with a slash for proper relative path resolution
        const fullBaseUrl =
            `${cdnDomain}/${pathPrefix}/${staticPath}/${version}`.replace(
                /\/+$/,
                '/',
            );

        // Log CDN configuration for debugging
        Logger.info(
            `Injecting CDN base tag: ${fullBaseUrl} (CDN_BASE_URL: ${
                cdnConfig.baseUrl
            }, CDN_PATH_PREFIX: ${pathPrefix}, STATIC_FILES_VERSION: ${
                staticFilesVersion || 'not set'
            }, VERSION from package.json: ${VERSION || 'not available'})`,
        );

        // Convert absolute paths to relative paths so base tag works correctly
        // HTML may contain absolute paths like /assets/... or /msy-x/static/0.2092.42/assets/...
        // Convert them to relative paths like assets/... so base tag can resolve them
        // Only convert paths that look like static assets (assets/, locales/, etc.)
        // Don't convert API paths (/api/...), external URLs (http://, https://), or data URLs
        let processedHtml = html;
        let conversionCount = 0;

        // Build the expected base path prefix to strip from absolute paths
        // e.g., /msy-x/static/0.2092.42/ -> we want to extract assets/... from /msy-x/static/0.2092.42/assets/...
        const basePathPrefix = `/${pathPrefix}/${staticPath}/${version}`;

        // Convert paths that already include the base path prefix
        // Match: /msy-x/static/0.2092.42/assets/... -> assets/...
        if (version) {
            const prefixPattern = basePathPrefix.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&',
            );
            processedHtml = processedHtml.replace(
                new RegExp(
                    `([a-z]+)=["']${prefixPattern}(assets/[^"']+)["']`,
                    'gi',
                ),
                (match, attr, path) => {
                    conversionCount++;
                    Logger.debug(
                        `[CDN] Converting prefixed absolute path to relative: ${basePathPrefix}${path} -> ${path} (attribute: ${attr})`,
                    );
                    return `${attr}="${path}"`;
                },
            );

            // Convert /msy-x/static/0.2092.42/locales/... -> locales/...
            processedHtml = processedHtml.replace(
                new RegExp(
                    `([a-z]+)=["']${prefixPattern}(locales/[^"']+)["']`,
                    'gi',
                ),
                (match, attr, path) => {
                    conversionCount++;
                    Logger.debug(
                        `[CDN] Converting prefixed absolute path to relative: ${basePathPrefix}${path} -> ${path} (attribute: ${attr})`,
                    );
                    return `${attr}="${path}"`;
                },
            );

            // Convert other prefixed public assets (favicon, manifest, fonts, etc.)
            processedHtml = processedHtml.replace(
                new RegExp(
                    `([a-z]+)=["']${prefixPattern}((?:favicon|manifest|apple-touch-icon|monacoeditorwork|fonts)[^"']*)["']`,
                    'gi',
                ),
                (match, attr, path) => {
                    conversionCount++;
                    Logger.debug(
                        `[CDN] Converting prefixed absolute path to relative: ${basePathPrefix}${path} -> ${path} (attribute: ${attr})`,
                    );
                    return `${attr}="${path}"`;
                },
            );

            // Convert Monaco Editor paths in inline scripts
            // Match: "json": "/msy-x/static/0.2092.42/monacoeditorwork/..." -> "json": "monacoeditorwork/..."
            processedHtml = processedHtml.replace(
                new RegExp(
                    `(["']json["']\\s*:\\s*["'])${prefixPattern}(monacoeditorwork/[^"']+)["']`,
                    'gi',
                ),
                (match, prefix, path) => {
                    conversionCount++;
                    Logger.debug(
                        `[CDN] Converting Monaco Editor path in script: ${basePathPrefix}${path} -> ${path}`,
                    );
                    return `${prefix}${path}"`;
                },
            );
        }

        // Convert simple absolute paths (without prefix) to relative paths
        // Match: /assets/... -> assets/... (for backward compatibility)
        processedHtml = processedHtml.replace(
            /([a-z]+)=["']\/(assets\/[^"']+)["']/gi,
            (match, attr, path) => {
                // Skip if already converted (contains base path prefix)
                if (match.includes(basePathPrefix)) {
                    return match;
                }
                conversionCount++;
                Logger.debug(
                    `[CDN] Converting absolute path to relative: /${path} -> ${path} (attribute: ${attr})`,
                );
                return `${attr}="${path}"`;
            },
        );

        // Convert /locales/... to locales/... (relative path)
        processedHtml = processedHtml.replace(
            /([a-z]+)=["']\/(locales\/[^"']+)["']/gi,
            (match, attr, path) => {
                // Skip if already converted (contains base path prefix)
                if (match.includes(basePathPrefix)) {
                    return match;
                }
                conversionCount++;
                Logger.debug(
                    `[CDN] Converting absolute path to relative: /${path} -> ${path} (attribute: ${attr})`,
                );
                return `${attr}="${path}"`;
            },
        );

        // Convert other public assets (favicon, manifest, fonts, etc.) to relative paths
        // But exclude API paths, external URLs, and data URLs
        processedHtml = processedHtml.replace(
            /([a-z]+)=["']\/((?:favicon|manifest|apple-touch-icon|monacoeditorwork|fonts)[^"']*)["']/gi,
            (match, attr, path) => {
                // Skip if already converted (contains base path prefix)
                if (match.includes(basePathPrefix)) {
                    return match;
                }
                conversionCount++;
                Logger.debug(
                    `[CDN] Converting absolute path to relative: /${path} -> ${path} (attribute: ${attr})`,
                );
                return `${attr}="${path}"`;
            },
        );

        // Log summary of conversions
        if (conversionCount > 0) {
            Logger.info(
                `[CDN] Converted ${conversionCount} absolute paths to relative paths for base tag compatibility`,
            );
        }

        // Inject base tag immediately after <head> tag
        // Base tag MUST be the first element in <head> for it to affect all resource references
        // Use data-cdn attribute to mark it as CDN base tag
        const baseTag = `    <base href="${fullBaseUrl.replace(
            /"/g,
            '&quot;',
        )}" data-cdn="true">`;

        // Try to insert after <head> tag (most common case)
        if (processedHtml.includes('<head>')) {
            // Match <head> with optional attributes and whitespace
            const headPattern = /(<head[^>]*>)/i;
            if (headPattern.test(processedHtml)) {
                return processedHtml.replace(headPattern, `$1\n${baseTag}`);
            }
        }

        // Fallback: if no <head> tag found, try to insert before </head>
        if (processedHtml.includes('</head>')) {
            Logger.warn(
                `[CDN] No <head> tag found, inserting base tag before </head> (may not work correctly)`,
            );
            return processedHtml.replace('</head>', `${baseTag}\n    </head>`);
        }

        Logger.warn(
            `HTML file does not contain <head> or </head> tag, skipping CDN base tag injection`,
        );
        return processedHtml;
    }

    private async initExpress(expressApp: Express) {
        // Cross-Origin Resource Sharing policy (CORS)
        // WARNING: this middleware should be mounted before the helmet middleware
        // (ideally at the top of the middleware stack)
        if (
            this.lightdashConfig.security.crossOriginResourceSharingPolicy
                .enabled &&
            this.lightdashConfig.security.crossOriginResourceSharingPolicy
                .allowedDomains.length > 0
        ) {
            const allowedOrigins: Array<string | RegExp> = [
                this.lightdashConfig.siteUrl,
            ];

            for (const allowedDomain of this.lightdashConfig.security
                .crossOriginResourceSharingPolicy.allowedDomains) {
                if (
                    allowedDomain.startsWith('/') &&
                    allowedDomain.endsWith('/')
                ) {
                    allowedOrigins.push(new RegExp(allowedDomain.slice(1, -1)));
                } else {
                    allowedOrigins.push(allowedDomain);
                }
            }

            expressApp.use(
                cors({
                    methods: 'OPTIONS, GET, HEAD, PUT, PATCH, POST, DELETE',
                    allowedHeaders: '*',
                    credentials: false,
                    origin: allowedOrigins,
                }),
            );
        }

        const KnexSessionStore = connectSessionKnex(expressSession);

        const store = new KnexSessionStore({
            knex: this.database as AnyType,
            createtable: false,
            tablename: 'sessions',
            sidfieldname: 'sid',
        });

        // Use custom middlewares if provided
        this.customExpressMiddlewares.forEach((middleware) =>
            middleware(expressApp),
        );

        expressApp.use(
            express.json({ limit: this.lightdashConfig.maxPayloadSize }),
        );

        const reportUris: URL[] = [];
        try {
            if (this.lightdashConfig.sentry.backend.securityReportUri) {
                const sentryReportUri = new URL(
                    this.lightdashConfig.sentry.backend.securityReportUri,
                );
                sentryReportUri.searchParams.set(
                    'sentry_environment',
                    this.environment === 'development'
                        ? 'development'
                        : this.lightdashConfig.mode,
                );
                sentryReportUri.searchParams.set('sentry_release', VERSION);
                reportUris.push(sentryReportUri);
            }
            if (this.lightdashConfig.security.contentSecurityPolicy.reportUri) {
                reportUris.push(
                    new URL(
                        this.lightdashConfig.security.contentSecurityPolicy.reportUri,
                    ),
                );
            }
        } catch (e) {
            Logger.warn('Invalid security report URI', e);
        }

        const contentSecurityPolicyAllowedDomains: string[] = [
            'https://*.sentry.io',
            'https://analytics.lightdash.com',
            'https://*.usepylon.com',
            'https://*.pusher.com', // used by pylon
            'wss://*.pusher.com', // used by pylon
            'https://*.headwayapp.co',
            'https://headway-widget.net',
            'https://*.posthog.com',
            'https://*.intercom.com',
            'https://*.intercom.io',
            'wss://*.intercom.io',
            'https://*.intercomcdn.com',
            'https://*.rudderlabs.com',
            'https://www.googleapis.com',
            'https://apis.google.com',
            'https://accounts.google.com',
            'https://vega.github.io',
            'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/',
            'https://*.lightdash.cloud',
            ...this.lightdashConfig.security.contentSecurityPolicy
                .allowedDomains,
        ];

        const helmetConfig = {
            contentSecurityPolicy: {
                directives: {
                    'default-src': [
                        "'self'",
                        ...contentSecurityPolicyAllowedDomains,
                    ],
                    'img-src': ["'self'", 'data:', 'https://*'],
                    'frame-src': ["'self'", 'https://*'],
                    'frame-ancestors': [
                        "'self'",
                        ...this.lightdashConfig.security.contentSecurityPolicy
                            .frameAncestors,
                    ],
                    'worker-src': [
                        "'self'",
                        'blob:',
                        ...contentSecurityPolicyAllowedDomains,
                    ],
                    'child-src': [
                        // Fallback of worker-src for safari older than 15.5
                        "'self'",
                        'blob:',
                        ...contentSecurityPolicyAllowedDomains,
                    ],
                    'script-src': [
                        "'self'",
                        "'unsafe-eval'",
                        ...contentSecurityPolicyAllowedDomains,
                    ],
                    'script-src-elem': [
                        "'self'",
                        "'unsafe-inline'",
                        ...contentSecurityPolicyAllowedDomains,
                    ],
                    'form-action': [
                        "'self'",
                        ...contentSecurityPolicyAllowedDomains,
                    ],
                    'report-uri': reportUris.map((uri) => uri.href),
                },
                reportOnly:
                    this.lightdashConfig.security.contentSecurityPolicy
                        .reportOnly,
            },
            strictTransportSecurity: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            },
            referrerPolicy: {
                policy: 'strict-origin-when-cross-origin',
            },
            noSniff: true,
            xFrameOptions: false,
            crossOriginOpenerPolicy: {
                policy: [LightdashMode.DEMO, LightdashMode.PR].includes(
                    this.lightdashConfig.mode,
                )
                    ? 'unsafe-none'
                    : 'same-origin',
            },
        } as const;

        expressApp.use(helmet(helmetConfig));

        const helmetConfigForEmbeds = produce(helmetConfig, (draft) => {
            // eslint-disable-next-line no-param-reassign
            draft.contentSecurityPolicy.directives['frame-ancestors'] = [
                "'self'",
                'https://*',
            ];
        });

        expressApp.use('/embed/*', helmet(helmetConfigForEmbeds));

        expressApp.use((req, res, next) => {
            // Permissions-Policy header that is not yet supported by helmet. More details here: https://github.com/helmetjs/helmet/issues/234
            res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
            res.setHeader(LightdashVersionHeader, VERSION);
            next();
        });

        expressApp.use(express.json());
        expressApp.use(express.urlencoded({ extended: false }));

        expressApp.use(
            expressSession({
                name:
                    process.env.NODE_ENV === 'development' &&
                    process.env.DEV_SCOPED_COOKIE_NAMES_ENABLED === 'true'
                        ? `connect.sid.${this.port}`
                        : 'connect.sid',
                secret: this.lightdashConfig.lightdashSecret,
                proxy: this.lightdashConfig.trustProxy,
                rolling: true,
                cookie: {
                    maxAge:
                        (this.lightdashConfig.cookiesMaxAgeHours || 24) *
                        60 *
                        60 *
                        1000, // in ms
                    secure: this.lightdashConfig.secureCookies,
                    httpOnly: true,
                    sameSite: this.lightdashConfig.cookieSameSite,
                },
                resave: false,
                saveUninitialized: false,
                store,
            }),
        );
        expressApp.use(flash());
        expressApp.use(passport.initialize());
        expressApp.use(passport.session());

        expressApp.use(expressWinstonPreResponseMiddleware); // log request before response is sent
        expressApp.use(expressWinstonMiddleware); // log request + response

        expressApp.get('/', (req, res) => {
            const htmlPath = path.join(
                __dirname,
                '../../frontend/build',
                'index.html',
            );
            try {
                // Check if HTML file exists (for development mode)
                if (!fs.existsSync(htmlPath)) {
                    // In development, frontend is served by Vite dev server
                    // Redirect to frontend dev server or return a helpful message
                    res.status(503).send(`
                        <html>
                            <head><title>Frontend not built</title></head>
                            <body>
                                <h1>Frontend not available</h1>
                                <p>In development mode, please use the Vite dev server at <a href="http://localhost:3000">http://localhost:3000</a></p>
                                <p>Or build the frontend first: <code>pnpm -F frontend build</code></p>
                            </body>
                        </html>
                    `);
                    return;
                }
                // Inject CDN config into HTML before sending
                let html = fs.readFileSync(htmlPath, 'utf8');
                html = this.injectCdnBaseTag(html);
                res.setHeader('Cache-Control', 'no-cache, private');
                res.send(html);
            } catch (error) {
                Logger.error(
                    `Error reading or processing HTML file: ${getErrorMessage(
                        error,
                    )}`,
                );
                Sentry.captureException(error);
                res.status(500).send(`
                    <html>
                        <head><title>Error</title></head>
                        <body>
                            <h1>Error loading frontend</h1>
                            <p>An error occurred while loading the frontend. Please try again later.</p>
                        </body>
                    </html>
                `);
            }
        });

        /**
         * Service Container
         *
         * In a future iteration, the service repository will be aware of the surrounding
         * request context - for now we simply proxy the existing service repository singleton.
         */
        expressApp.use((req, res, next) => {
            req.services = this.serviceRepository;
            next();
        });

        // Add JWT parsing here so we can get services off the request
        // We'll also be able to add the user to Sentry for embedded users.
        expressApp.use(jwtAuthMiddleware);
        expressApp.use(sessionAccountMiddleware);

        expressApp.use((req, res, next) => {
            if (req.user) {
                Sentry.setUser({
                    id: req.user.userUuid,
                    organization: req.user.organizationUuid,
                    email: req.user.email,
                    username: req.user.email,
                });
            }
            next();
        });

        // api router
        expressApp.use('/api/v1', apiV1Router);
        RegisterRoutes(expressApp);
        // Api docs
        if (
            this.lightdashConfig.mode === LightdashMode.PR ||
            this.environment !== 'production'
        ) {
            expressApp.get('/api/docs/openapi.json', (req, res) => {
                res.send(apiSpec);
            });
            expressApp.get(
                '/api/docs',
                reDoc({
                    title: 'Lightdash API Docs',
                    specUrl: '/api/docs/openapi.json',
                }),
            );
        }

        // frontend assets - immutable because vite appends hash to filenames
        expressApp.use(
            '/assets',
            expressStaticGzip(
                path.join(__dirname, '../../frontend/build/assets'),
                {
                    index: false,
                    customCompressions: [
                        {
                            encodingName: 'gzip',
                            fileExtension: 'gzip',
                        },
                    ],
                },
            ),
        );

        // Root-level .well-known endpoints for OAuth discovery (required by many MCP clients)
        // Use the same handlers as the API-level endpoints to ensure consistency
        expressApp.get(
            '/.well-known/oauth-authorization-server',
            oauthAuthorizationServerHandler,
        );
        expressApp.get(
            '/.well-known/oauth-authorization-server/api/v1/mcp',
            oauthAuthorizationServerHandler,
        );

        expressApp.get(
            '/.well-known/oauth-protected-resource',
            oauthProtectedResourceHandler,
        );
        expressApp.get(
            '/.well-known/oauth-protected-resource/api/v1/mcp',
            oauthProtectedResourceHandler,
        );

        // handling api 404s before frontend catch all
        expressApp.use('/api/*', (req, res) => {
            const apiErrorResponse = {
                status: 'error',
                error: {
                    statusCode: 404,
                    name: 'NotFoundError',
                    message: `API endpoint not found`,
                    data: {},
                },
            } satisfies ApiError;
            res.status(404).json(apiErrorResponse);
        });

        // frontend static files - conditional based on STATIC_FILES_ENABLED
        // Default to true for backward compatibility (fallback mechanism)
        const staticFilesEnabled = process.env.STATIC_FILES_ENABLED !== 'false';
        if (staticFilesEnabled) {
            expressApp.use(
                express.static(path.join(__dirname, '../../frontend/build'), {
                    setHeaders: () => ({
                        // private - browsers can cache but not CDNs
                        // no-cache - caches must revalidate with the origin server before using a cached copy
                        'Cache-Control': 'no-cache, private',
                    }),
                }),
            );

            expressApp.get('*', (req, res) => {
                const htmlPath = path.join(
                    __dirname,
                    '../../frontend/build',
                    'index.html',
                );
                try {
                    // Check if HTML file exists (for development mode)
                    if (!fs.existsSync(htmlPath)) {
                        // In development, frontend is served by Vite dev server
                        // Redirect to frontend dev server or return a helpful message
                        res.status(503).send(`
                            <html>
                                <head><title>Frontend not built</title></head>
                                <body>
                                    <h1>Frontend not available</h1>
                                    <p>In development mode, please use the Vite dev server at <a href="http://localhost:3000">http://localhost:3000</a></p>
                                    <p>Or build the frontend first: <code>pnpm -F frontend build</code></p>
                                </body>
                            </html>
                        `);
                        return;
                    }
                    // Inject CDN config into HTML before sending
                    let html = fs.readFileSync(htmlPath, 'utf8');
                    html = this.injectCdnBaseTag(html);
                    res.setHeader('Cache-Control', 'no-cache, private');
                    res.send(html);
                } catch (error) {
                    Logger.error(
                        `Error reading or processing HTML file: ${getErrorMessage(
                            error,
                        )}`,
                    );
                    Sentry.captureException(error);
                    res.status(500).send(`
                        <html>
                            <head><title>Error</title></head>
                            <body>
                                <h1>Error loading frontend</h1>
                                <p>An error occurred while loading the frontend. Please try again later.</p>
                            </body>
                        </html>
                    `);
                }
            });
        }

        // Start the server
        expressApp.listen(this.port, () => {
            if (this.environment === 'production') {
                Logger.info(
                    `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch lightdash at http://localhost:${this.port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`,
                );
            }
        });

        // Errors
        Sentry.setupExpressErrorHandler(expressApp);
        expressApp.use(scimErrorHandler); // SCIM error check before general error handler
        expressApp.use(invalidUserErrorHandler);
        expressApp.use(
            (error: Error, req: Request, res: Response, _: NextFunction) => {
                const errorResponse = errorHandler(error);
                if (
                    error instanceof UnexpectedServerError ||
                    !(error instanceof LightdashError)
                ) {
                    // This intentionally uses console vs. winston because of problems from some error/JSON payloads.
                    console.error(error);
                }
                Logger.error(
                    `Handled error of type ${errorResponse.name} on [${req.method}] ${req.path}`,
                    errorResponse,
                );

                if (process.env.NODE_ENV === 'development') {
                    Logger.error(error.stack);
                }

                this.analytics.track({
                    event: 'api.error',
                    userId: req.user?.userUuid,
                    anonymousId: !req.user?.userUuid
                        ? LightdashAnalytics.anonymousId
                        : undefined,
                    properties: {
                        name: errorResponse.name,
                        statusCode: errorResponse.statusCode,
                        route: req.path,
                        method: req.method,
                    },
                });

                // Check if this is an OAuth endpoint and return OAuth2-compliant error response
                if (error instanceof OauthAuthenticationError) {
                    const oauthErrorResponse = {
                        error: errorResponse.data?.error || 'server_error',
                        error_description: errorResponse.message,
                    };
                    res.status(errorResponse.statusCode).send(
                        oauthErrorResponse,
                    );
                    return;
                }

                const apiErrorResponse: ApiError = {
                    status: 'error',
                    error: {
                        statusCode: errorResponse.statusCode,
                        name: errorResponse.name,
                        message: errorResponse.message,
                        data: errorResponse.data,
                        sentryTraceId:
                            // Only return the Sentry trace ID for unexpected server errors
                            errorResponse.statusCode === 500
                                ? Sentry.getActiveSpan()?.spanContext().traceId
                                : undefined,
                        sentryEventId:
                            // Only return the Sentry event ID for unexpected server errors
                            errorResponse.statusCode === 500
                                ? Sentry.lastEventId()
                                : undefined,
                    },
                };

                res.status(errorResponse.statusCode).send(apiErrorResponse);
            },
        );

        // Authentication
        const userService = this.serviceRepository.getUserService();

        passport.use(apiKeyPassportStrategy({ userService }));
        passport.use(
            localPassportStrategy({
                userService,
            }),
        );

        // Refresh strategies also need to be registered on SchedulerApp
        if (googlePassportStrategy) {
            passport.use(googlePassportStrategy);
            refresh.use(googlePassportStrategy);
        }
        if (isOktaPassportStrategyAvailableToUse) {
            passport.use('okta', new OpenIDClientOktaStrategy());
        }
        if (oneLoginPassportStrategy) {
            passport.use('oneLogin', oneLoginPassportStrategy);
        }
        if (isAzureAdPassportStrategyAvailableToUse) {
            passport.use('azuread', await createAzureAdPassportStrategy());
        }
        if (isGenericOidcPassportStrategyAvailableToUse) {
            passport.use('oidc', await createGenericOidcPassportStrategy());
        }
        if (snowflakePassportStrategy) {
            passport.use('snowflake', snowflakePassportStrategy);
            refresh.use('snowflake', snowflakePassportStrategy);
        }
        if (slackPassportStrategy) {
            passport.use('slack', slackPassportStrategy);
        }

        passport.serializeUser((user, done) => {
            // On login (user changes), user.userUuid is written to the session store in the `sess.passport.data` field
            done(null, {
                id: user.userUuid,
                organization: user.organizationUuid,
            });
        });

        // Before each request handler we read `sess.passport.user` from the session store
        passport.deserializeUser(
            async (
                passportUser: { id: string; organization: string },
                done,
            ) => {
                // Convert to a full user profile
                try {
                    done(null, await userService.findSessionUser(passportUser));
                } catch (e) {
                    done(e);
                }
            },
        );

        return expressApp;
    }

    private async initSlack(expressApp: Express) {
        const slackClient = this.clients.getSlackClient();
        await slackClient.start(expressApp);

        const slackService = this.serviceRepository.getSlackService();
        slackService.setupEventListeners();
    }

    private initSchedulerWorker() {
        this.schedulerWorker = this.schedulerWorkerFactory({
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            serviceRepository: this.serviceRepository,
            models: this.models,
            clients: this.clients,
            utils: this.utils,
        });

        this.schedulerWorker.run().catch((e) => {
            Logger.error('Error starting scheduler worker', e);
        });
    }

    async stop() {
        this.prometheusMetrics.stop();
        if (this.schedulerWorker && this.schedulerWorker.runner) {
            try {
                await this.schedulerWorker.runner.stop();
                Logger.info('Stopped scheduler worker');
            } catch (e) {
                Logger.error('Error stopping scheduler worker', e);
            }
        }
        if (postHogClient) {
            try {
                await postHogClient.shutdown();
                Logger.info('Stopped PostHog Client');
            } catch (e) {
                Logger.error('Error stopping PostHog Client', e);
            }
        }
    }

    getServiceRepository() {
        return this.serviceRepository;
    }

    getModels() {
        return this.models;
    }

    getClients() {
        return this.clients;
    }

    getDatabase() {
        return this.database;
    }
}
