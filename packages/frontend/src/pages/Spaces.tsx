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
 * All the strings go through `useTranslation` with the keys
 * `pages_spaces.client_use_scope.*`, defined in both locale files.
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
        ),
        group_membership: t(
            'pages_spaces.client_use_scope.role_source.group_membership',
        ),
        organization: t(
            'pages_spaces.client_use_scope.role_source.organization',
        ),
        none: t('pages_spaces.client_use_scope.role_source.none'),
    };

    const scopeCounts = diagnostics.scopeCounts;

    const rows: { label: string; value: ReactNode }[] = [
        {
            label: t('pages_spaces.client_use_scope.applied'),
            value: diagnostics.scopeApplied
                ? t('pages_spaces.client_use_scope.applied_yes')
                : t('pages_spaces.client_use_scope.applied_no'),
        },
        {
            label: t('pages_spaces.client_use_scope.status'),
            value: <Code>{diagnostics.status}</Code>,
        },
        {
            label: t('pages_spaces.client_use_scope.reason'),
            value: diagnostics.reason || '-',
        },
        {
            label: t('pages_spaces.client_use_scope.effective_role'),
            value: t('pages_spaces.client_use_scope.effective_role_value', {
                role: diagnostics.effectiveProjectRole ?? '-',
                source: roleSourceLabels[diagnostics.roleSource],
            }),
        },
        {
            label: t('pages_spaces.client_use_scope.mobile'),
            value: diagnostics.mobile ?? '-',
        },
        {
            label: t('pages_spaces.client_use_scope.rpc_configured'),
            value: diagnostics.rpcConfigured
                ? t('pages_spaces.client_use_scope.yes')
                : t('pages_spaces.client_use_scope.no'),
        },
        {
            label: t('pages_spaces.client_use_scope.allowed_dashboard_count'),
            value: String(diagnostics.allowedDashboardCount),
        },
        {
            label: t('pages_spaces.client_use_scope.allowed_dashboards'),
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
                    t('pages_spaces.client_use_scope.none')
                ),
        },
        {
            label: t('pages_spaces.client_use_scope.scope_counts'),
            value: scopeCounts
                ? `${t('pages_spaces.client_use_scope.dashboards')} ${
                      scopeCounts.dashboards
                  } / ${t('pages_spaces.client_use_scope.charts')} ${
                      scopeCounts.charts
                  } / ${t('pages_spaces.client_use_scope.spaces')} ${
                      scopeCounts.spaces
                  } / ${t('pages_spaces.client_use_scope.explores')} ${
                      scopeCounts.explores
                  }`
                : '-',
        },
    ];

    return (
        <Paper withBorder radius="sm" p="sm">
            <Group position="apart" noWrap>
                <Text fw={500} size="sm">
                    {t('pages_spaces.client_use_scope.title')}
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
                        ? t('pages_spaces.client_use_scope.hide')
                        : t('pages_spaces.client_use_scope.show')}
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
