import { subject } from '@casl/ability';
import {
    ContentType,
    LightdashMode,
    type ViewerProjectRoleSource,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Code,
    Collapse,
    Group,
    Paper,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { IconChevronDown, IconFolderPlus, IconPlus } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import ForbiddenPanel from '../components/ForbiddenPanel';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';

import SpaceActionModal from '../components/common/SpaceActionModal';
import { ActionType } from '../components/common/SpaceActionModal/types';
import {
    useMyContentScope,
    type MyContentScope,
} from '../hooks/useMyContentScope';
import { useProject } from '../hooks/useProject';
import useApp from '../providers/App/useApp';

type ContentScopeDiagnosticsProps = {
    diagnostics: MyContentScope;
};

/**
 * Client-use content scope diagnostics card.
 *
 * TODO(i18n): all the strings below go through `useTranslation` with the keys
 * `pages_spaces.client_use_scope.*`, but the Chinese defaults are inlined here
 * because the locale files (`packages/frontend/public/locales/{en,zh}/translation.json`)
 * are outside the write scope of this change. Adding the same keys under
 * `pages_spaces.client_use_scope` in both locale files makes them translatable
 * without touching this component (the inline defaults are only fallbacks).
 *
 * Mantine note: this repo is on Mantine v6, which has no `Descriptions` / `Tag`
 * components, so the key/value layout uses `Table` and `Badge` instead.
 */
const ContentScopeDiagnostics: FC<ContentScopeDiagnosticsProps> = ({
    diagnostics,
}) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState<boolean>(false);

    const roleSourceLabels: Record<ViewerProjectRoleSource, string> = {
        project_membership: t(
            'pages_spaces.client_use_scope.role_source.project_membership',
            '项目成员',
        ),
        group_membership: t(
            'pages_spaces.client_use_scope.role_source.group_membership',
            '用户组',
        ),
        organization: t(
            'pages_spaces.client_use_scope.role_source.organization',
            '组织',
        ),
        none: t('pages_spaces.client_use_scope.role_source.none', '无'),
    };

    const scopeCounts = diagnostics.scopeCounts;

    const rows: { label: string; value: ReactNode }[] = [
        {
            label: t('pages_spaces.client_use_scope.applied', '生效状态'),
            value: diagnostics.scopeApplied
                ? t(
                      'pages_spaces.client_use_scope.applied_yes',
                      '已生效（受限角色）',
                  )
                : t('pages_spaces.client_use_scope.applied_no', '未生效'),
        },
        {
            label: t('pages_spaces.client_use_scope.status', '状态码'),
            value: <Code>{diagnostics.status}</Code>,
        },
        {
            label: t('pages_spaces.client_use_scope.reason', '说明'),
            value: diagnostics.reason || '-',
        },
        {
            label: t(
                'pages_spaces.client_use_scope.effective_role',
                '有效项目角色',
            ),
            value: `${diagnostics.effectiveProjectRole ?? '-'}（${
                roleSourceLabels[diagnostics.roleSource]
            }）`,
        },
        {
            label: t('pages_spaces.client_use_scope.mobile', '手机号'),
            value: diagnostics.mobile ?? '-',
        },
        {
            label: t(
                'pages_spaces.client_use_scope.rpc_configured',
                'RPC 已配置',
            ),
            value: diagnostics.rpcConfigured
                ? t('pages_spaces.client_use_scope.yes', '是')
                : t('pages_spaces.client_use_scope.no', '否'),
        },
        {
            label: t(
                'pages_spaces.client_use_scope.allowed_dashboard_count',
                '白名单看板数',
            ),
            value: String(diagnostics.allowedDashboardCount),
        },
        {
            label: t(
                'pages_spaces.client_use_scope.allowed_dashboards',
                '白名单看板',
            ),
            value:
                diagnostics.allowedDashboardNames.length > 0 ? (
                    <Group spacing="xs">
                        {diagnostics.allowedDashboardNames.map((name) => (
                            <Badge key={name} variant="light" color="blue">
                                {name}
                            </Badge>
                        ))}
                    </Group>
                ) : (
                    t('pages_spaces.client_use_scope.none', '无')
                ),
        },
        {
            label: t(
                'pages_spaces.client_use_scope.scope_counts',
                '内容范围计数',
            ),
            value: scopeCounts
                ? `${t('pages_spaces.client_use_scope.dashboards', '看板')} ${
                      scopeCounts.dashboards
                  } / ${t('pages_spaces.client_use_scope.charts', '图表')} ${
                      scopeCounts.charts
                  } / ${t('pages_spaces.client_use_scope.spaces', '空间')} ${
                      scopeCounts.spaces
                  } / ${t(
                      'pages_spaces.client_use_scope.explores',
                      '数据集',
                  )} ${scopeCounts.explores}`
                : '-',
        },
    ];

    return (
        <Paper withBorder radius="sm" p="sm">
            <Group position="apart" noWrap>
                <Text fw={500} size="sm">
                    {t(
                        'pages_spaces.client_use_scope.title',
                        '内容可见范围诊断',
                    )}
                </Text>
                <Button
                    compact
                    variant="subtle"
                    color="gray"
                    size="xs"
                    onClick={() => setIsOpen((prev) => !prev)}
                    rightIcon={
                        <IconChevronDown
                            size={14}
                            style={{
                                transform: isOpen ? 'rotate(180deg)' : 'none',
                                transition: 'transform 200ms ease',
                            }}
                        />
                    }
                >
                    {isOpen
                        ? t('pages_spaces.client_use_scope.hide', '收起')
                        : t('pages_spaces.client_use_scope.show', '展开')}
                </Button>
            </Group>

            <Collapse in={isOpen}>
                <Table
                    verticalSpacing="xs"
                    sx={(theme) => ({
                        marginTop: theme.spacing.xs,
                        'td, th': {
                            fontSize: theme.fontSizes.sm,
                            whiteSpace: 'normal',
                        },
                        'tbody tr': {
                            borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        },
                    })}
                >
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label}>
                                <td
                                    style={{
                                        width: 160,
                                        verticalAlign: 'top',
                                    }}
                                >
                                    <Text size="sm" color="dimmed">
                                        {row.label}
                                    </Text>
                                </td>
                                <td>{row.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </Collapse>
        </Paper>
    );
};

const Spaces: FC = () => {
    const { t } = useTranslation();

    const { projectUuid } = useParams() as {
        projectUuid: string;
    };
    const project = useProject(projectUuid);
    const isClientUse = project.data?.isClientUse ?? false;

    // Diagnostics are only useful in client-use mode. Failures are ignored:
    // the card is simply hidden so that the page is never blocked.
    const contentScope = useMyContentScope(
        isClientUse ? projectUuid : undefined,
    );

    const { user, health } = useApp();

    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const handleCreateSpace = () => {
        setIsCreateModalOpen(true);
    };

    const userCanManageSpace = user.data?.ability?.can(
        'create',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: projectUuid,
        }),
    );

    if (
        user.data?.ability?.cannot(
            'view',
            subject('Space', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
                isPrivate: false,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    return (
        <Page
            title={t('pages_spaces.spaces')}
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack spacing="xxl" w="100%">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            { to: '/home', title: t('pages_spaces.home') },
                            { title: t('pages_spaces.spaces'), active: true },
                        ]}
                    />

                    <Group spacing="xs">
                        {!isDemo && userCanManageSpace && (
                            <Button
                                leftIcon={<IconPlus size={18} />}
                                onClick={handleCreateSpace}
                            >
                                {t('pages_spaces.tabs.add')}
                            </Button>
                        )}
                    </Group>
                </Group>

                {isClientUse && contentScope.data && (
                    <ContentScopeDiagnostics diagnostics={contentScope.data} />
                )}

                <InfiniteResourceTable
                    isClientUse={isClientUse}
                    filters={{
                        projectUuid,
                        spaceUuids: [],
                        contentTypes: [ContentType.SPACE],
                    }}
                    contentTypeFilter={{
                        defaultValue: ContentType.SPACE,
                        options: [],
                    }}
                    columnVisibility={{
                        [ColumnVisibility.SPACE]: false,
                        [ColumnVisibility.UPDATED_AT]: false,
                        [ColumnVisibility.ACCESS]: true,
                        [ColumnVisibility.CONTENT]: true,
                    }}
                    adminContentView={userCanManageProject}
                    enableBottomToolbar={false}
                    enableRowSelection={userCanManageSpace}
                />

                {isCreateModalOpen && (
                    <SpaceActionModal
                        projectUuid={projectUuid}
                        parentSpaceUuid={null}
                        actionType={ActionType.CREATE}
                        title={t('pages_spaces.tabs.create_space')}
                        confirmButtonLabel={t('pages_spaces.tabs.create')}
                        icon={IconFolderPlus}
                        onClose={() => setIsCreateModalOpen(false)}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default Spaces;
