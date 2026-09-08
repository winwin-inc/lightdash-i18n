import { createGenerator } from './codegen';
import { parse } from './compiler';
import { FUNCTION_DEFINITIONS } from './functions';
import type { FunctionDefinitionEntry } from './functions';
import type {
    ASTNode,
    CompileOptions,
    Dialect,
    FunctionCategory,
    FunctionDefinition,
} from './types';

export type {
    ASTNode,
    CompileOptions,
    Dialect,
    FunctionCategory,
    FunctionDefinition,
};
export type {
    FunctionName,
    FunctionDefinitionEntry,
    FunctionDefinitionFor,
} from './functions';
export { parse } from './compiler';
export { extractColumnRefs, containsAggregateOrWindow } from './ast';
export { FUNCTION_CATALOG, FUNCTION_DEFINITIONS } from './functions';

// Dialects the formula package can compile to. Consumers (backend mapper,
// frontend UI gating) use this as the single source of truth.
export const SUPPORTED_DIALECTS = [
    'postgres',
    'redshift',
    'bigquery',
    'snowflake',
    'duckdb',
    'databricks',
    'clickhouse',
    'athena',
    'trino',
] as const satisfies readonly Dialect[];

type MissingSupportedDialect = Exclude<
    Dialect,
    (typeof SUPPORTED_DIALECTS)[number]
>;
const supportedDialectsAreExhaustive: MissingSupportedDialect extends never
    ? true
    : MissingSupportedDialect = true;
void supportedDialectsAreExhaustive;

// Use `const` assignments (not `export function`) so Vite/Rollup CJS interop
// can statically detect named exports from packages/formula/dist/index.js.
export const compile = (formula: string, options: CompileOptions): string => {
    const ast = parse(formula);
    const generator = createGenerator(options);
    return generator.generate(ast);
};

export const listFunctions = (): readonly FunctionDefinitionEntry[] =>
    FUNCTION_DEFINITIONS;
