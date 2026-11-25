#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { CliError, toCliError } from './cli/errors';
import { ExitCode } from './cli/exitCodes';
import { registerCommands } from './commands';
import { CLI_VERSION } from './lib/version';

const writeError = (error: CliError): void => {
    process.stderr.write(`${JSON.stringify(error.toJSON())}\n`);
};

export const buildProgram = (): Command => {
    const program = new Command();
    program
        .name('msy-x')
        // 连接器的版本检查命令依赖这行输出，保持 `msy-x <semver>` 单行
        .version(`msy-x ${CLI_VERSION}`, '-v, --version', '输出 CLI 版本')
        .description(
            '马上赢 X 平台 MCP 命令行客户端（Streamable HTTP / OAuth DCR + PAT）\n' +
                '内置站点：x = https://x.brandct.com/api/v1/mcp（对外）、' +
                'inner = https://lightdash.banmahui.cn/api/v1/mcp（内部）\n' +
                '未传 --site 时用配置文件里的 currentSite（全新安装默认 x）；' +
                '两个站点都支持 OAuth 与 PAT，登录方式只看有无给 token',
        )
        .showHelpAfterError('运行 msy-x help [command] 查看用法')
        // 子命令前的全局选项旧 program，子命令后的旧叶子命令（配合 ancestorOptsOf 合并）
        .enablePositionalOptions()
        // stderr 只允许出现我们的单行 JSON（见设计稿 §8.1）；
        // commander 自己的 "error: ..." 文案会挤在同一行上下文里，屏蔽掉
        .configureOutput({ writeErr: () => undefined })
        .exitOverride();
    return program;
};

export const main = async (argv: string[]): Promise<number> => {
    const program = buildProgram();
    registerCommands(program);
    // 裸执行 `msy-x`：打印帮助并以 0 退出（不当作用法错误）
    if (argv.length <= 2) {
        program.outputHelp();
        return ExitCode.OK;
    }
    try {
        await program.parseAsync(argv);
        return ExitCode.OK;
    } catch (error) {
        if (error instanceof CommanderError) {
            // --help / --version 与正常退出都算成功；其余是用法错误
            if (error.exitCode === 0) {
                return ExitCode.OK;
            }
            writeError(
                new CliError({ code: 'USAGE', message: error.message }),
            );
            return ExitCode.USAGE;
        }
        const cliError = toCliError(error);
        writeError(cliError);
        return cliError.exitCode;
    }
};

if (require.main === module) {
    main(process.argv)
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            // main 内部已兜底；这里只防 writeError 本身出错（stdout/stderr 不可写等）
            process.stderr.write(
                `${JSON.stringify({
                    error: { code: 'SERVER_ERROR', message: String(error) },
                })}\n`,
            );
            process.exitCode = ExitCode.SERVER_ERROR;
        });
}
