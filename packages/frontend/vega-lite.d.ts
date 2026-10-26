/**
 * vega-lite v6 的 package.json 只提供 `exports` 字段，
 * 而 frontend 的 tsconfig 用的是 `moduleResolution: node`（node10 解析），
 * 解析不到它自带的类型声明。
 *
 * 这里按仓库里 `vega-lite-schema.d.ts` 的做法补一个最小声明：
 * 只声明用到的 `compile`，运行时仍然加载真正的 vega-lite 包。
 */
declare module 'vega-lite' {
    export interface CompileResult {
        spec: Record<string, unknown>;
    }
    export function compile(spec: unknown): CompileResult;
}
