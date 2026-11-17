/**
 * 最小类型声明：本包只用到 js-yaml 的 load/dump。
 *
 * package.json 目前未声明 @types/js-yaml（且 pnpm 严格 node_modules 下
 * 根级 @types/js-yaml 对本包不可见）。本文件在 config 层内兜底，
 * 父任务补上 `@types/js-yaml` devDependency 后应删除本文件。
 */
declare module 'js-yaml' {
    export interface LoadOptions {
        encoding?: string;
        onWarning?: (error: Error) => void;
        schema?: unknown;
        json?: boolean;
    }

    export interface DumpOptions {
        indent?: number;
        /** -1 表示不折行 */
        lineWidth?: number;
        noRefs?: boolean;
        sortKeys?: boolean | ((a: string, b: string) => number);
        quotingType?: "'" | '"';
    }

    export function load(source: string, options?: LoadOptions): unknown;

    export function dump(value: unknown, options?: DumpOptions): string;

    const jsYaml: {
        load: typeof load;
        dump: typeof dump;
    };

    export default jsYaml;
}
