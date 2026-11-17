import assert from 'node:assert/strict';
import test from 'node:test';
import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';
import { accessCommands } from './access';
import { exploresCommands } from './explores';
import { fieldsCommands } from './fields';
import { infoCommands } from './info';
import { projectCommands } from './project';
import { searchCommands } from './search';
import { spacesCommands } from './spaces';
import { valuesCommands } from './values';

const UUID = '3f5d1b0e-1111-4222-8333-444455556666';

const allGroups: [string, CommandSpec[]][] = [
    ['info', infoCommands],
    ['project', projectCommands],
    ['access', accessCommands],
    ['search', searchCommands],
    ['spaces', spacesCommands],
    ['explores', exploresCommands],
    ['fields', fieldsCommands],
    ['values', valuesCommands],
];

const allSpecs: CommandSpec[] = allGroups.flatMap(([, specs]) => specs);

const specByName = (name: string): CommandSpec => {
    const spec = allSpecs.find((candidate) => candidate.name === name);
    assert.ok(spec, `未找到命令 ${name}`);
    return spec;
};

const input = (partial: Partial<CommandBuildInput>): CommandBuildInput => ({
    args: {},
    options: {},
    projectUuid: null,
    ...partial,
});

const buildOne = (spec: CommandSpec, partial: Partial<CommandBuildInput>): ToolCall => {
    const calls = spec.build(input(partial));
    assert.equal(calls.length, 1, `${spec.name} 应只产出 1 条 ToolCall`);
    return calls[0] as ToolCall;
};

const assertUsage = (fn: () => unknown, hintIncludes?: string): void => {
    assert.throws(
        fn,
        (error: unknown) => {
            assert.ok(error instanceof CliError, '应抛出 CliError');
            assert.equal(error.code, 'USAGE');
            if (hintIncludes !== undefined) {
                assert.ok(
                    (error.hint ?? '').includes(hintIncludes),
                    `hint 应包含「${hintIncludes}」，实际：${error.hint ?? ''}`,
                );
            }
            return true;
        },
    );
};

test('info：一次产出 3 条 ToolCall，args 均为空对象', () => {
    const spec = specByName('info');
    assert.deepEqual(spec.build(input({})), [
        { tool: 'get_site_info', args: {} },
        { tool: 'get_lightdash_version', args: {} },
        { tool: 'get_current_project', args: {} },
    ]);
    assert.deepEqual(spec.build(input({ projectUuid: UUID })), [
        { tool: 'get_site_info', args: { projectUuid: UUID } },
        { tool: 'get_lightdash_version', args: { projectUuid: UUID } },
        { tool: 'get_current_project', args: { projectUuid: UUID } },
    ]);
});

test('project：list / use / show 的工具与入参映射', () => {
    assert.deepEqual(buildOne(specByName('project list'), {}), {
        tool: 'list_projects',
        args: {},
    });
    // v2 无 full 参数
    const listSpec = specByName('project list');
    const listCalls = listSpec.build(input({ options: { full: true } }));
    assert.deepEqual(listCalls[0]?.args, {});

    assert.deepEqual(
        buildOne(specByName('project use <projectUuid>'), {
            args: { projectUuid: UUID },
        }),
        { tool: 'set_project', args: { projectUuid: UUID } },
    );
    // 位置参数优先于全局 --project-uuid（同一入参键）
    assert.deepEqual(
        buildOne(specByName('project use <projectUuid>'), {
            args: { projectUuid: UUID },
            projectUuid: 'other-uuid',
        }),
        { tool: 'set_project', args: { projectUuid: UUID } },
    );
    assertUsage(() => specByName('project use <projectUuid>').build(input({})));

    assert.deepEqual(buildOne(specByName('project show'), {}), {
        tool: 'get_current_project',
        args: {},
    });
});

test('access：includeExplores 始终为布尔值', () => {
    const spec = specByName('access');
    assert.deepEqual(buildOne(spec, {}), {
        tool: 'get_my_access',
        args: { includeExplores: false },
    });
    assert.deepEqual(buildOne(spec, { options: { explores: true } }), {
        tool: 'get_my_access',
        args: { includeExplores: true },
    });
    assert.deepEqual(
        buildOne(spec, { options: { explores: true }, projectUuid: UUID }),
        { tool: 'get_my_access', args: { includeExplores: true, projectUuid: UUID } },
    );
});

test('search：按 --type 路由到 find_content/find_charts/find_dashboards/find_spaces', () => {
    const spec = specByName('search <query>');
    assert.deepEqual(buildOne(spec, { args: { query: '销售额' } }), {
        tool: 'find_content',
        args: { searchQueries: [{ label: '销售额' }] },
    });
    assert.deepEqual(
        buildOne(spec, { args: { query: 'q' }, options: { type: 'chart' } }),
        { tool: 'find_charts', args: { searchQueries: [{ label: 'q' }] } },
    );
    assert.deepEqual(
        buildOne(spec, { args: { query: 'q' }, options: { type: 'dashboard' } }),
        { tool: 'find_dashboards', args: { searchQueries: [{ label: 'q' }] } },
    );
    assert.deepEqual(
        buildOne(spec, { args: { query: 'q' }, options: { type: 'space' } }),
        { tool: 'find_spaces', args: { searchQueries: [{ label: 'q' }] } },
    );
    assertUsage(() =>
        spec.build(input({ args: { query: 'q' }, options: { type: 'tile' } })),
    );
    assert.deepEqual(
        buildOne(spec, {
            args: { query: 'cls_insight_list' },
            options: { page: '2', pageSize: '25', full: true },
            projectUuid: UUID,
        }),
        {
            tool: 'find_content',
            args: {
                searchQueries: [{ label: 'cls_insight_list' }],
                page: 2,
                pageSize: 25,
                full: true,
                projectUuid: UUID,
            },
        },
    );
    assertUsage(() => spec.build(input({})));
});

test('find_* 三族共用 searchQueries:[{label}] 形状', () => {
    const cases: [CommandSpec, Partial<CommandBuildInput>, string][] = [
        [specByName('search <query>'), { args: { query: 'x' } }, 'find_content'],
        [
            specByName('search <query>'),
            { args: { query: 'x' }, options: { type: 'chart' } },
            'find_charts',
        ],
        [
            specByName('search <query>'),
            { args: { query: 'x' }, options: { type: 'dashboard' } },
            'find_dashboards',
        ],
        [
            specByName('search <query>'),
            { args: { query: 'x' }, options: { type: 'space' } },
            'find_spaces',
        ],
        [specByName('spaces find <query>'), { args: { query: 'x' } }, 'find_spaces'],
    ];
    cases.forEach(([spec, partial, tool]) => {
        const call = buildOne(spec, partial);
        assert.equal(call.tool, tool);
        assert.deepEqual(call.args.searchQueries, [{ label: 'x' }]);
    });
});

test('spaces：list 无层级参数；find 只透出 pageSize', () => {
    const listSpec = specByName('spaces list');
    assert.deepEqual(buildOne(listSpec, {}), { tool: 'list_spaces', args: {} });
    assert.deepEqual(
        buildOne(listSpec, {
            options: { page: '3', pageSize: '10', full: true },
            projectUuid: UUID,
        }),
        {
            tool: 'list_spaces',
            args: { page: 3, pageSize: 10, full: true, projectUuid: UUID },
        },
    );

    const findSpec = specByName('spaces find <query>');
    assert.deepEqual(buildOne(findSpec, { args: { query: '调味品' } }), {
        tool: 'find_spaces',
        args: { searchQueries: [{ label: '调味品' }] },
    });
    assert.deepEqual(
        buildOne(findSpec, {
            args: { query: 'q' },
            options: { pageSize: '50' },
            projectUuid: UUID,
        }),
        {
            tool: 'find_spaces',
            args: {
                searchQueries: [{ label: 'q' }],
                pageSize: 50,
                projectUuid: UUID,
            },
        },
    );
    // list 的入参里永远不该出现层级 parent 键
    const calls = listSpec.build(
        input({ options: { page: '1', pageSize: '5' }, projectUuid: UUID }),
    );
    assert.ok(!('parent' in (calls[0] as ToolCall).args));
});

test('explores：过滤键是 exploreName（不是 search），show 必填表名', () => {
    const listSpec = specByName('explores list');
    assert.deepEqual(
        buildOne(listSpec, { options: { search: 'pinleibaohsm_cls_top' } }),
        {
            tool: 'list_explores',
            args: { exploreName: 'pinleibaohsm_cls_top' },
        },
    );
    assert.deepEqual(
        buildOne(listSpec, {
            options: { search: 'cls', page: '2', pageSize: '20' },
            projectUuid: UUID,
        }),
        {
            tool: 'list_explores',
            args: {
                exploreName: 'cls',
                page: 2,
                pageSize: 20,
                projectUuid: UUID,
            },
        },
    );
    // 无 --search 时不该出现 exploreName 键；也绝不该有 full 键
    assert.deepEqual(buildOne(listSpec, {}), { tool: 'list_explores', args: {} });
    const paged = listSpec.build(input({ options: { page: '1' } }));
    assert.ok(!('full' in (paged[0] as ToolCall).args));

    const showSpec = specByName('explores show <exploreName>');
    assert.deepEqual(
        buildOne(showSpec, { args: { exploreName: 'pinleibaohsm_cls_top' } }),
        {
            tool: 'find_explores',
            args: { exploreName: 'pinleibaohsm_cls_top' },
        },
    );
    assertUsage(() => showSpec.build(input({})));
});

test('fields：缺 --explore 报 USAGE；映射 table/fieldSearchQueries/catalogTags/page', () => {
    const spec = specByName('fields find <query>');
    assertUsage(() => spec.build(input({ args: { query: '销售额' } })), 'msy-x explores list');
    assert.deepEqual(
        buildOne(spec, {
            args: { query: '销售额' },
            options: { explore: 'pinleibaohsm_cls_top' },
        }),
        {
            tool: 'find_fields',
            args: {
                table: 'pinleibaohsm_cls_top',
                fieldSearchQueries: [{ label: '销售额' }],
            },
        },
    );
    assert.deepEqual(
        buildOne(spec, {
            args: { query: '销售额' },
            options: { explore: 'cls_insight_list', tags: 'a, b,,c', page: '2' },
            projectUuid: UUID,
        }),
        {
            tool: 'find_fields',
            args: {
                table: 'cls_insight_list',
                fieldSearchQueries: [{ label: '销售额' }],
                catalogTags: ['a', 'b', 'c'],
                page: 2,
                projectUuid: UUID,
            },
        },
    );
    // 无 pageSize 入参（服务端固定 15）
    const call = buildOne(spec, {
        args: { query: 'x' },
        options: { explore: 't', pageSize: '10' },
    });
    assert.ok(!('pageSize' in call.args));
});

test('values：缺 --table 报 USAGE；映射 table/fieldId/query/dashboardUuid', () => {
    const spec = specByName('values <fieldId>');
    assertUsage(() => spec.build(input({ args: { fieldId: 't_f' } })), 'table_field');
    assertUsage(
        () => spec.build(input({ args: { fieldId: 't_f' } })),
        'msy-x fields find',
    );
    assert.deepEqual(
        buildOne(spec, {
            args: { fieldId: 'pinleibaohsm_cls_top_period' },
            options: { table: 'pinleibaohsm_cls_top' },
        }),
        {
            tool: 'search_field_values',
            args: {
                table: 'pinleibaohsm_cls_top',
                fieldId: 'pinleibaohsm_cls_top_period',
            },
        },
    );
    assert.deepEqual(
        buildOne(spec, {
            args: { fieldId: 'f' },
            options: { table: 't', search: '华南', dashboard: 'd-uuid' },
            projectUuid: UUID,
        }),
        {
            tool: 'search_field_values',
            args: {
                table: 't',
                fieldId: 'f',
                query: '华南',
                dashboardUuid: 'd-uuid',
                projectUuid: UUID,
            },
        },
    );
    // 无 limit 入参（服务端固定 100）
    const call = buildOne(spec, {
        args: { fieldId: 'f' },
        options: { table: 't', limit: '10' },
    });
    assert.ok(!('limit' in call.args));
});

test('pageSize 截断：超过 100 截断到 100；低于 1 或非整数报 USAGE', () => {
    const search = specByName('search <query>');
    const truncated = buildOne(search, {
        args: { query: 'q' },
        options: { pageSize: '250' },
    });
    assert.equal((truncated.args as Record<string, unknown>).pageSize, 100);

    const spacesList = specByName('spaces list');
    assert.equal(
        (
            buildOne(spacesList, { options: { pageSize: '999' } }).args as Record<
                string,
                unknown
            >
        ).pageSize,
        100,
    );

    assertUsage(() =>
        search.build(input({ args: { query: 'q' }, options: { pageSize: '0' } })),
    );
    assertUsage(() =>
        search.build(input({ args: { query: 'q' }, options: { pageSize: 'abc' } })),
    );
    assertUsage(() =>
        search.build(input({ args: { query: 'q' }, options: { pageSize: '2.5' } })),
    );
});

test('数字解析失败：--page 非整数/越界报 USAGE', () => {
    const search = specByName('search <query>');
    assertUsage(() =>
        search.build(input({ args: { query: 'q' }, options: { page: 'abc' } })),
    );
    assertUsage(() =>
        search.build(input({ args: { query: 'q' }, options: { page: '0' } })),
    );
    assertUsage(() =>
        search.build(input({ args: { query: 'q' }, options: { page: '1.5' } })),
    );
    const spacesList = specByName('spaces list');
    assertUsage(() => spacesList.build(input({ options: { page: '-1' } })));
    const exploresList = specByName('explores list');
    assertUsage(() =>
        exploresList.build(
            input({ options: { page: '1', pageSize: 'x' }, projectUuid: UUID }),
        ),
    );
});

test('projectUuid 注入：非 null 时合并进每条 ToolCall 的 args', () => {
    const sampleInput: Record<string, Partial<CommandBuildInput>> = {
        info: {},
        'project list': {},
        'project use <projectUuid>': { args: { projectUuid: UUID } },
        'project show': {},
        access: { options: { explores: true } },
        'search <query>': { args: { query: 'x' } },
        'spaces list': {},
        'spaces find <query>': { args: { query: 'x' } },
        'explores list': {},
        'explores show <exploreName>': { args: { exploreName: 'x' } },
        'fields find <query>': { args: { query: 'x' }, options: { explore: 'x' } },
        'values <fieldId>': { args: { fieldId: 'x_f' }, options: { table: 'x' } },
    };
    allSpecs.forEach((spec) => {
        const partial = sampleInput[spec.name];
        assert.ok(partial, `缺少 ${spec.name} 的样例入参`);
        const calls = spec.build(input({ ...partial, projectUuid: UUID }));
        assert.ok(calls.length > 0, `${spec.name} 至少产出一条 ToolCall`);
        calls.forEach((call) => {
            assert.equal(
                (call.args as Record<string, unknown>).projectUuid,
                UUID,
                `${spec.name} → ${call.tool} 应注入 projectUuid`,
            );
        });
    });
});

test('全局 projectUuid 为 null 时，args 不含来自全局的 projectUuid 键', () => {
    const sampleInput: Record<string, Partial<CommandBuildInput>> = {
        info: {},
        'project list': {},
        'project use <projectUuid>': { args: { projectUuid: 'proj-arg' } },
        'project show': {},
        access: {},
        'search <query>': { args: { query: 'x' } },
        'spaces list': {},
        'spaces find <query>': { args: { query: 'x' } },
        'explores list': {},
        'explores show <exploreName>': { args: { exploreName: 'x' } },
        'fields find <query>': { args: { query: 'x' }, options: { explore: 'x' } },
        'values <fieldId>': { args: { fieldId: 'x_f' }, options: { table: 'x' } },
    };
    allSpecs.forEach((spec) => {
        const partial = sampleInput[spec.name];
        assert.ok(partial, `缺少 ${spec.name} 的样例入参`);
        const calls = spec.build(input(partial));
        calls.forEach((call) => {
            if (spec.name === 'project use <projectUuid>') {
                // 位置参数本身就是入参 projectUuid，与全局无关
                assert.equal((call.args as Record<string, unknown>).projectUuid, 'proj-arg');
                return;
            }
            assert.ok(
                !('projectUuid' in call.args),
                `${spec.name} → ${call.tool} 不应注入 projectUuid`,
            );
        });
    });
});

test('所有 spec：dataCommand 为 false，example 以 msy-x 开头且含真实名字', () => {
    allSpecs.forEach((spec) => {
        assert.equal(spec.dataCommand, false, spec.name);
        assert.ok(
            spec.example.startsWith('msy-x '),
            `${spec.name} example 应以 msy-x 开头：${spec.example}`,
        );
    });
    const examples = allSpecs.map((spec) => spec.example).join('\n');
    assert.ok(examples.includes('pinleibaohsm_cls_top'));
    assert.ok(examples.includes('cls_insight_list'));
    assert.ok(examples.includes('pinleibaohsm_cls_top_period'));
});

test('build 是纯函数：同一入参重复调用结果一致', () => {
    const spec = specByName('search <query>');
    const partial: Partial<CommandBuildInput> = {
        args: { query: 'q' },
        options: { type: 'chart', page: '1', pageSize: '200' },
        projectUuid: UUID,
    };
    assert.deepEqual(spec.build(input(partial)), spec.build(input(partial)));
    const valuesSpec = specByName('values <fieldId>');
    const valuesPartial: Partial<CommandBuildInput> = {
        args: { fieldId: 'f' },
        options: { table: 't', search: 's', dashboard: 'd' },
        projectUuid: null,
    };
    assert.deepEqual(
        valuesSpec.build(input(valuesPartial)),
        valuesSpec.build(input(valuesPartial)),
    );
});
