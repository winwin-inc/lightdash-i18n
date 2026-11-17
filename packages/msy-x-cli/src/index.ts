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
        // 豆包 CLI 连接器的版本检查命令依赖这行输出，保持 `msy-x <semver>` 单行
        .version(`msy-x ${CLI_VERSION}`, '-v, --version', '输出 CLI 版本')
        .description(
            '马上赢 X 平台 MCP 命令行客户端（Streamable HTTP / OAuth DCR + PAT）\n' +
                '默认站点：x（https://x.brandct.com/api/v1/mcp）',
        )
        .showHelpAfterError('运行 msy-x help [command] 查看用法')
        .exitOverride();
    return program;
};

export const main = async (argv: string[]): Promise<number> => {
    const program = buildProgram();
    registerCommands(program);
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
    void main(process.argv).then((code) => {
        process.exitCode = code;
    });
}
