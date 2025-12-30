import {
    GetObjectCommand,
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    PutObjectCommandInput,
    S3,
    S3ServiceException,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
    getErrorMessage,
    MissingConfigError,
    S3Error,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { wrapSentryTransaction } from '../../utils';

export type S3CacheClientArguments = {
    lightdashConfig: LightdashConfig;
};

export class S3CacheClient {
    configuration: LightdashConfig['results']['s3'];

    protected readonly s3: S3 | undefined;

    constructor({ lightdashConfig }: S3CacheClientArguments) {
        this.configuration = lightdashConfig.results.s3;

        if (!this.configuration) {
            return;
        }

        const { endpoint, region, accessKey, secretKey, forcePathStyle } =
            this.configuration;

        // 增加请求超时时间，避免大文件下载超时
        // 默认 30 分钟（1800000 毫秒），可通过环境变量配置
        const requestTimeout =
            parseInt(
                process.env.S3_REQUEST_TIMEOUT ||
                    process.env.RESULTS_S3_REQUEST_TIMEOUT ||
                    '1800000',
                10,
            ) || 1800000; // 30 分钟

        const s3Config: S3ClientConfig = {
            endpoint,
            region,
            apiVersion: '2006-03-01',
            forcePathStyle,
            requestHandler: new NodeHttpHandler({
                requestTimeout,
            }),
        };

        if (accessKey && secretKey) {
            Object.assign(s3Config, {
                credentials: {
                    accessKeyId: accessKey,
                    secretAccessKey: secretKey,
                },
            });
            Logger.debug(
                'Using results S3 storage with access key credentials',
            );
        } else {
            Logger.debug('Using results S3 storage with IAM role credentials');
        }

        this.s3 = new S3(s3Config);
    }

    protected getPrefixedFileId(fileId: string): string {
        const prefix = this.configuration?.pathPrefix;
        if (!prefix) {
            return fileId;
        }

        const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
        const normalizedFileId = fileId.replace(/^\/+/, '');

        if (!normalizedPrefix) return normalizedFileId;

        return `${normalizedPrefix}/${normalizedFileId}`;
    }

    async uploadResults(
        key: string,
        results: PutObjectCommandInput['Body'],
        metadata: PutObjectCommandInput['Metadata'],
    ) {
        return wrapSentryTransaction('s3.uploadResults', { key }, async () => {
            if (!this.configuration || !this.s3) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            try {
                const sanitizedMetadata = metadata
                    ? Object.fromEntries(
                          Object.entries(metadata).map(([_key, value]) => {
                              switch (typeof value) {
                                  case 'object':
                                      return [key, JSON.stringify(value)];
                                  default:
                                      return [key, String(value)];
                              }
                          }),
                      )
                    : {};

                const prefixedKey = this.getPrefixedFileId(`${key}.json`);
                const command = new PutObjectCommand({
                    Bucket: this.configuration.bucket,
                    Key: prefixedKey,
                    Body: results,
                    ContentType: 'application/json',
                    Metadata: sanitizedMetadata,
                });
                await this.s3.send(command);
            } catch (error) {
                if (error instanceof S3ServiceException) {
                    Logger.error(
                        `Failed to upload results to s3. ${error.name} - ${error.message}`,
                    );
                } else {
                    Logger.error(
                        `Failed to upload results to s3. ${getErrorMessage(
                            error,
                        )}`,
                    );
                }

                Sentry.captureException(
                    new S3Error(
                        `Failed to upload results to s3. ${getErrorMessage(
                            error,
                        )}`,
                        {
                            key,
                        },
                    ),
                );

                throw error;
            }
        });
    }

    async getResultsMetadata(key: string) {
        return wrapSentryTransaction(
            's3.getResultsMetadata',
            { key },
            async () => {
                if (!this.configuration || !this.s3) {
                    throw new MissingConfigError('S3 configuration is not set');
                }

                try {
                    const prefixedKey = this.getPrefixedFileId(`${key}.json`);
                    const command = new HeadObjectCommand({
                        Bucket: this.configuration.bucket,
                        Key: prefixedKey,
                    });
                    return await this.s3.send(command);
                } catch (error) {
                    if (error instanceof NotFound) {
                        return undefined;
                    }

                    if (error instanceof S3ServiceException) {
                        Logger.error(
                            `Failed to get results metadata from s3. ${error.name} - ${error.message}`,
                        );
                    } else {
                        Logger.error(
                            `Failed to get results metadata from s3. ${getErrorMessage(
                                error,
                            )}`,
                        );
                    }

                    Sentry.captureException(
                        new S3Error(
                            `Failed to get results metadata from s3. ${getErrorMessage(
                                error,
                            )}`,
                            {
                                key,
                            },
                        ),
                    );

                    throw error;
                }
            },
        );
    }

    async getResults(key: string, extension: string = 'json') {
        return wrapSentryTransaction('s3.getResults', { key }, async (span) => {
            if (!this.configuration || !this.s3) {
                throw new MissingConfigError('S3 configuration is not set');
            }

            try {
                const prefixedKey = this.getPrefixedFileId(
                    `${key}.${extension}`,
                );
                const command = new GetObjectCommand({
                    Bucket: this.configuration.bucket,
                    Key: prefixedKey,
                });
                return await this.s3.send(command);
            } catch (error) {
                if (error instanceof S3ServiceException) {
                    Logger.error(
                        `Failed to get results from s3. ${error.name} - ${error.message}`,
                    );
                } else {
                    Logger.error(
                        `Failed to get results from s3. ${getErrorMessage(
                            error,
                        )}`,
                    );
                }

                Sentry.captureException(
                    new S3Error(
                        `Failed to get results from s3. ${getErrorMessage(
                            error,
                        )}`,
                        {
                            key,
                        },
                    ),
                );

                throw error;
            }
        });
    }
}
