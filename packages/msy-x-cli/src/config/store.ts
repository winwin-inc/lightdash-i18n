import { randomBytes } from 'node:crypto';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { CliError } from '../cli/errors';
import type { CliConfig } from '../types';
import {
    CONFIG_FILE_MODE,
    ensureConfigDir,
    ensureFileMode,
    getConfigFilePath,
    type EnvVars,
} from './paths';

const DOCTOR_HINT = '运行 msy-x doctor 检查配置，或备份后删除该文件让 CLI 重新生成';

const authModeSchema = z.enum(['oauth', 'pat']);
const authHeaderSchema = z.enum(['authorization', 'x-api-key']);

const siteConfigSchema = z.object({
    mcpUrl: z.string().min(1),
    authMode: authModeSchema,
    authHeader: authHeaderSchema,
});

const oauthCredentialsSchema = z.object({
    mode: z.literal('oauth'),
    clientId: z.string(),
    clientSecret: z.string().nullable(),
    redirectUri: z.string(),
    accessToken: z.string(),
    accessExpiresAt: z.string(),
    refreshToken: z.string().nullable(),
    scope: z.string(),
});

const patCredentialsSchema = z.object({
    mode: z.literal('pat'),
    pat: z.string(),
});

const authCredentialsSchema = z.discriminatedUnion('mode', [
    oauthCredentialsSchema,
    patCredentialsSchema,
]);

/** 与 src/types.ts 的 CliConfig 冻结契约对齐（结构不符时这里会编译报错） */
const cliConfigSchema = z.object({
    currentSite: z.string().min(1),
    sites: z.record(z.string(), siteConfigSchema),
    auth: z.record(z.string(), authCredentialsSchema),
});

/** 内置默认配置（设计稿 §4.2）：文件不存在时按此行为 */
export const defaultConfig = (): CliConfig => ({
    currentSite: 'x',
    sites: {
        x: {
            mcpUrl: 'https://x.brandct.com/api/v1/mcp',
            authMode: 'oauth',
            authHeader: 'authorization',
        },
        inner: {
            mcpUrl: 'https://lightdash.banmahui.cn/api/v1/mcp',
            authMode: 'pat',
            authHeader: 'authorization',
        },
    },
    auth: {},
});

const parseConfigOrThrow = (raw: unknown, file: string): CliConfig => {
    const parsed = cliConfigSchema.safeParse(raw);
    if (!parsed.success) {
        throw new CliError({
            code: 'CONFIG',
            message: `配置文件结构与预期不符：${file}`,
            hint: DOCTOR_HINT,
            cause: parsed.error,
        });
    }
    return parsed.data;
};

/**
 * 读取配置文件；文件不存在返回内置默认配置。
 * YAML 解析失败或结构非法 → CliError('CONFIG')（退 2），
 * 只读不写，绝不覆盖原文件。
 */
export const readConfig = async (env: EnvVars = process.env): Promise<CliConfig> => {
    const file = getConfigFilePath(env);
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return defaultConfig();
        }
        throw new CliError({
            code: 'CONFIG',
            message: `无法读取配置文件：${file}（${(error as Error).message}）`,
            hint: DOCTOR_HINT,
            cause: error,
        });
    }
    let raw: unknown;
    try {
        raw = yaml.load(text);
    } catch (error) {
        throw new CliError({
            code: 'CONFIG',
            message: `配置文件不是合法 YAML：${file}`,
            hint: DOCTOR_HINT,
            cause: error,
        });
    }
    return parseConfigOrThrow(raw, file);
};

/**
 * 原子写配置：同目录临时文件 → chmod 0600 → rename 覆盖。
 * 写前确保目录存在（0700）。任何失败都会清理临时文件并抛出，
 * 不会留下半截目标文件。
 */
export const writeConfig = async (
    config: CliConfig,
    env: EnvVars = process.env,
): Promise<void> => {
    // 写入前同样校验，防止程序内构造出非法结构落盘
    const target = getConfigFilePath(env);
    const validated = parseConfigOrThrow(config, target);

    await ensureConfigDir(env);
    const dir = path.dirname(target);
    const temp = path.join(
        dir,
        `.${path.basename(target)}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`,
    );
    const body = yaml.dump(validated, { lineWidth: -1, noRefs: true });
    try {
        await writeFile(temp, body, 'utf8');
        await ensureFileMode(temp);
        await rename(temp, target);
    } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
    }
};

/**
 * doctor / 报错提示用的配置文件路径（绝对路径）。
 * 只输出路径本身，绝不输出文件内容或凭证。
 */
export const getConfigPathForDisplay = (env: EnvVars = process.env): string =>
    getConfigFilePath(env);

/** 读取文件权限位（八进制），供 doctor 检查 0600 */
export const getFileModeForDisplay = async (
    env: EnvVars = process.env,
): Promise<number | null> => {
    try {
        const info = await stat(getConfigFilePath(env));
        // eslint-disable-next-line no-bitwise
        return info.mode & 0o777;
    } catch {
        return null;
    }
};

export { CONFIG_FILE_MODE };
