// eslint-disable-next-line max-classes-per-file
import { type AnyType } from './any';
import { type DbtLog } from './job';

type LightdashErrorData = {
    /**
     * Optional URL linking to relevant documentation.
     * Can be used to provide users with additional context/guidance about the error.
     */
    documentationUrl?: string;
    [key: string]: AnyType;
};

type LightdashErrorParams = {
    message: string;
    name: string;
    statusCode: number;
    data: LightdashErrorData;
};

export class LightdashError extends Error {
    statusCode: number;

    data: LightdashErrorData;

    constructor({ message, name, statusCode, data }: LightdashErrorParams) {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
        this.data = data;
    }
}

export class TooManyRequestsError extends LightdashError {
    constructor(
        message = 'Too many requests',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'TooManyRequestsError',
            statusCode: 429,
            data,
        });
    }
}

export class ForbiddenError extends LightdashError {
    constructor(
        message = "You don't have access to this resource or action",
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'ForbiddenError',
            statusCode: 403,
            data,
        });
    }
}

export class DeactivatedAccountError extends LightdashError {
    constructor(
        message = 'Your account has been deactivated. Please contact your organization administrator.',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'DeactivatedAccountError',
            statusCode: 403,
            data,
        });
    }
}

export class AuthorizationError extends LightdashError {
    constructor(
        message = "You don't have authorization to perform this action",
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'AuthorizationError',
            statusCode: 401,
            data,
        });
    }
}

export class NotExistsError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotExistsError',
            statusCode: 404,
            data: {},
        });
    }
}

export class ExpiredError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'ExpiredError',
            statusCode: 406,
            data: {},
        });
    }
}

export class ParameterError extends LightdashError {
    constructor(
        message: string = 'Incorrect parameters',
        data: Record<string, AnyType> = {},
    ) {
        super({
            message,
            name: 'ParameterError',
            statusCode: 400,
            data,
        });
    }
}

export class NonCompiledModelError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
        super({
            message,
            name: 'NonCompiledModelError',
            statusCode: 400,
            data,
        });
    }
}

export class PromotionConflictError extends LightdashError {
    constructor(
        message: string = 'This promotion has conflicts that need to be confirmed',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'PromotionConflictError',
            statusCode: 409,
            data,
        });
    }
}

export class MissingCatalogEntryError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType }) {
        super({
            message,
            name: 'MissingCatalogEntryError',
            statusCode: 400,
            data,
        });
    }
}

export class MissingWarehouseCredentialsError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'MissingWarehouseCredentialsError',
            statusCode: 400,
            data: {},
        });
    }
}

export class UnexpectedServerError extends LightdashError {
    constructor(
        message = 'Something went wrong.',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedServerError',
            statusCode: 500,
            data,
        });
    }
}
/**
 * 看板导出：所选 Tab 下没有可导出的图表。
 * 前端用它把这条错误换成本地化文案，改文案时必须两边一起改（所以抽成共享常量）。
 */
export const NO_CHARTS_TO_EXPORT_MESSAGE =
    'No charts to export in the selected tabs';

/**
 * 看板一键导出：累计写入行数超过单次上限。
 * 前端按前缀匹配换成本地化文案，数值由后缀括号里带出；
 * 改文案时必须两边一起改（所以抽成共享常量）。
 */
export const DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE =
    'Dashboard export exceeded the row limit';

/**
 * 看板一键导出：产物体积超过单次上限（按最终 xlsx / csv 文件累计）。
 * 与行数上限互补：宽表即便行数没超，也可能体积过大。
 */
export const DASHBOARD_EXPORT_SIZE_LIMIT_MESSAGE =
    'Dashboard export exceeded the size limit';

export const getDashboardExportSizeLimitMessage = ({
    bytes,
    limitBytes,
}: {
    bytes: number;
    limitBytes: number;
}): string => {
    const toMb = (value: number) => Math.ceil(value / (1024 * 1024));
    return `${DASHBOARD_EXPORT_SIZE_LIMIT_MESSAGE} (${toMb(
        bytes,
    )} MB, limit ${toMb(limitBytes)} MB)`;
};

export const getDashboardExportRowLimitMessage = ({
    rows,
    limit,
}: {
    rows: number;
    limit: number;
}): string => `${DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE} (${rows} rows, limit ${limit})`;

export class UnexpectedIndexError extends LightdashError {
    constructor(
        message = 'Invalid index in array.',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedIndexError',
            statusCode: 500,
            data,
        });
    }
}
export class UnexpectedGitError extends LightdashError {
    constructor(
        message = 'Unexpected error in Git adapter',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedGitError',
            statusCode: 400,
            data,
        });
    }
}

export class UnexpectedDatabaseError extends LightdashError {
    constructor(
        message = 'Unexpected error in Lightdash database.',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedDatabaseError',
            statusCode: 500,
            data,
        });
    }
}

export class ParseError extends LightdashError {
    constructor(
        message = 'Error parsing dbt project and lightdash metadata',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'ParseError',
            statusCode: 400,
            data,
        });
    }
}

export class CompileError extends LightdashError {
    constructor(
        message = 'Error compiling sql from Lightdash configuration',
        data: Record<string, AnyType> = {},
    ) {
        super({
            message,
            name: 'CompileError',
            statusCode: 400,
            data,
        });
    }
}

export class FieldReferenceError extends LightdashError {
    constructor(
        message = 'Failed to reference field in dbt project',
        data: Record<string, AnyType> = {},
    ) {
        super({
            message,
            name: 'FieldReferenceError',
            statusCode: 400,
            data,
        });
    }
}

export class DbtError extends LightdashError {
    logs: DbtLog[] | undefined;

    constructor(message = 'Dbt raised an error', logs: DbtLog[] = []) {
        super({
            message,
            name: 'DbtError',
            statusCode: 400,
            data: {},
        });
        this.logs = logs;
    }
}

export class NotFoundError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotFoundError',
            statusCode: 404,
            data: {},
        });
    }
}

export class NotSupportedError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotSupportedError',
            statusCode: 400,
            data: {},
        });
    }
}

export class InvalidUser extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'InvalidUser',
            statusCode: 404,
            data: {},
        });
    }
}

export class WarehouseConnectionError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'WarehouseConnectionError',
            statusCode: 400,
            data: {},
        });
    }
}

export class WarehouseQueryError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
        super({
            message,
            name: 'WarehouseQueryError',
            statusCode: 400,
            data,
        });
    }
}

export class SmptError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
        super({
            message,
            name: 'SmptError',
            statusCode: 500,
            data,
        });
    }
}

export class AlreadyProcessingError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AlreadyProcessingError',
            statusCode: 409,
            data: {},
        });
    }
}
export class AlreadyExistsError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AlreadyExistsError',
            statusCode: 409,
            data: {},
        });
    }
}

export class MissingConfigError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'MissingConfigError',
            statusCode: 422,
            data: {},
        });
    }
}

export class NotEnoughResults extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotEnoughResults',
            statusCode: 406,
            data: {},
        });
    }
}

export class PaginationError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'PaginationError',
            statusCode: 422,
            data: {},
        });
    }
}

export class SlackInstallationNotFoundError extends LightdashError {
    constructor(message: string = 'Could not find slack installation') {
        super({
            message,
            name: 'SlackInstallationNotFoundError',
            statusCode: 404,
            data: {},
        });
    }
}

export class SlackError extends LightdashError {
    constructor(
        message: string = 'Slack API error occurred',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'SlackError',
            statusCode: 400,
            data,
        });
    }
}

export class MsTeamsError extends LightdashError {
    constructor(
        message: string = 'Microsoft Teams API error occurred',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'MsTeamsError',
            statusCode: 400,
            data,
        });
    }
}

export class UnexpectedGoogleSheetsError extends LightdashError {
    constructor(
        message = 'Unexpected error in Google sheets client',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'UnexpectedGoogleSheetsError',
            statusCode: 400,
            data,
        });
    }
}

export class GoogleSheetsTransientError extends LightdashError {
    constructor(
        message = 'Unexpected error in Google Sheets API',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'GoogleSheetsTransientError',
            statusCode: 500,
            data,
        });
    }
}
export class NotImplementedError extends LightdashError {
    constructor(message = 'Not implemented') {
        super({
            message,
            name: 'NotImplemented',
            statusCode: 501,
            data: {},
        });
    }
}
export const getErrorMessage = (e: unknown) =>
    e instanceof Error ? e.message : `Unknown ${typeof e} error`;

export class ScreenshotError extends LightdashError {
    constructor(
        message = 'Error capturing screenshot',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'ScreenshotError',
            statusCode: 500,
            data,
        });
    }
}

export class SshTunnelError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'SshTunnelError',
            statusCode: 400,
            data: {},
        });
    }
}

export class ReadFileError extends LightdashError {
    constructor(message: string, data: { [key: string]: AnyType } = {}) {
        super({
            message,
            name: 'ReadFileError',
            statusCode: 404,
            data,
        });
    }
}

export class S3Error extends LightdashError {
    constructor(
        message = 'Error occurred while interacting with S3',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'S3Error',
            statusCode: 500,
            data,
        });
    }
}

export class TimeoutError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'TimeoutError',
            statusCode: 400,
            data: {},
        });
    }
}

export class AiDuplicateSlackPromptError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AiDuplicateSlackPromptError',
            statusCode: 400,
            data: {},
        });
    }
}

export class AiSlackMappingNotFoundError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AiSlackMappingNotFoundError',
            statusCode: 400,
            data: {},
        });
    }
}

export class AiAgentNotFoundError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'AiAgentNotFoundError',
            statusCode: 400,
            data: {},
        });
    }
}

/* This specific error will be used in the frontend
to show a "reauthenticate" button in the UI
*/
export class SnowflakeTokenError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'SnowflakeTokenError',
            statusCode: 401,
            data: {},
        });
    }
}

export class CustomSqlQueryForbiddenError extends LightdashError {
    constructor(
        message: string = 'User cannot run queries with custom SQL dimensions',
    ) {
        super({
            message,
            name: 'CustomSqlQueryForbiddenError',
            statusCode: 403,
            data: {
                documentationUrl: `https://docs.lightdash.com/references/custom-fields#custom-sql`,
            },
        });
    }
}

export class OauthAuthenticationError extends LightdashError {
    constructor(
        message = 'OAuth authentication error',
        data: { [key: string]: AnyType } = {},
    ) {
        super({
            message,
            name: 'OauthAuthenticationError',
            statusCode: 401,
            data,
        });
    }
}

export class GenerateDailySchedulerJobError extends LightdashError {
    schedulerUuid: string;

    constructor(
        message: string,
        schedulerUuid: string,
        originalError?: unknown,
    ) {
        super({
            message,
            name: 'GenerateDailySchedulerJobError',
            statusCode: 500,
            data: {
                schedulerUuid,
                originalError:
                    originalError instanceof Error
                        ? originalError.message
                        : String(originalError),
            },
        });
        this.schedulerUuid = schedulerUuid;
        if (originalError instanceof Error) {
            this.stack = originalError.stack;
            this.cause = originalError;
        }
    }
}

export class LightdashProjectConfigError extends LightdashError {
    constructor(
        message = 'Invalid lightdash.config.yml',
        data: Record<string, AnyType> = {},
    ) {
        super({
            message,
            name: 'LightdashProjectConfigError',
            statusCode: 400,
            data,
        });
    }
}
