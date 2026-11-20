import { chmod, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** 环境变量视图；注入便于测试（不污染真实 process.env） */
export type EnvVars = Record<string, string | undefined>;

export const CONFIG_DIR_MODE = 0o700;
export const CONFIG_FILE_MODE = 0o600;

const CONFIG_DIR_NAME = 'msy-x';
const CONFIG_FILE_NAME = 'config.yaml';

const isWindows = (): boolean => process.platform === 'win32';

const expandHome = (value: string): string => {
    if (value === '~') {
        return os.homedir();
    }
    if (value.startsWith('~/')) {
        return path.join(os.homedir(), value.slice(2));
    }
    return value;
};

const isSet = (value: string | undefined): value is string =>
    value !== undefined && value.trim() !== '';

/** MSY_X_CONFIG 覆盖值（指向配置文件本身），未设置时返回 null */
const getConfigOverride = (env: EnvVars): string | null => {
    const override = env.MSY_X_CONFIG;
    return isSet(override) ? path.resolve(expandHome(override.trim())) : null;
};

/**
 * 配置目录（设计稿 §4.1）：
 * - `MSY_X_CONFIG` 指向配置文件时取其所在目录；
 * - 否则 linux/macOS `~/.config/msy-x`、win32 `%APPDATA%\msy-x`。
 */
export const getConfigDir = (env: EnvVars = process.env): string => {
    const override = getConfigOverride(env);
    if (override !== null) {
        return path.dirname(override);
    }
    if (isWindows()) {
        const appData =
            env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
        return path.join(appData, CONFIG_DIR_NAME);
    }
    return path.join(os.homedir(), '.config', CONFIG_DIR_NAME);
};

/** 配置文件完整路径（`MSY_X_CONFIG` 覆盖时即该文件本身） */
export const getConfigFilePath = (env: EnvVars = process.env): string => {
    const override = getConfigOverride(env);
    if (override !== null) {
        return override;
    }
    return path.join(getConfigDir(env), CONFIG_FILE_NAME);
};

/** 确保配置目录存在且权限为 0700（win32 跳过 chmod，见设计稿 §4.1） */
export const ensureConfigDir = async (env: EnvVars = process.env): Promise<string> => {
    const dir = getConfigDir(env);
    await mkdir(dir, { recursive: true, mode: CONFIG_DIR_MODE });
    if (!isWindows()) {
        // mkdir 的 mode 受 umask 影响，显式 chmod 保证权限位
        await chmod(dir, CONFIG_DIR_MODE);
    }
    return dir;
};

/** 确保文件权限为 0600（win32 跳过，不做 ACL 加固） */
export const ensureFileMode = async (file: string): Promise<void> => {
    if (!isWindows()) {
        await chmod(file, CONFIG_FILE_MODE);
    }
};
