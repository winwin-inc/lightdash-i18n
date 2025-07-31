import {
    getHumanReadableCronExpression,
    isMsTeamsTarget,
    isSchedulerGsheetsOptions,
    isSlackTarget,
    SchedulerFormat,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Flex,
    Group,
    Pagination,
    Paper,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@mantine/hooks';
import { IconRefresh, IconSearch, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import { usePaginatedSchedulers } from '../../features/scheduler/hooks/useScheduler';
import { useGetSlack, useSlackChannels } from '../../hooks/slack/useSlack';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import { DEFAULT_PAGE_SIZE } from '../common/Table/constants';
import SchedulersViewActionMenu from './SchedulersViewActionMenu';
import {
    getSchedulerIcon,
    getSchedulerLink,
    type SchedulerColumnName,
    type SchedulerItem,
} from './SchedulersViewUtils';

interface SchedulersProps {
    projectUuid: string;
}

type Column = {
    id: SchedulerColumnName;
    label?: string;
    cell: (item: SchedulerItem) => React.ReactNode;
    meta?: {
        style: React.CSSProperties;
    };
};

const Schedulers: FC<SchedulersProps> = ({ projectUuid }) => {
    const { classes, theme } = useTableStyles();
    const { t } = useTranslation();
    
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [sortBy] = useState<string | undefined>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const debouncedValue = useMemo(() => {
        return { search, page, sortBy, sortDirection };
    }, [search, page, sortBy, sortDirection]);

    const [debouncedSearchQueryAndPage] = useDebouncedValue(
        debouncedValue,
        300,
    );

    const { data: paginatedSchedulers, isInitialLoading: isLoadingSchedulers } =
        usePaginatedSchedulers({
            projectUuid,
            searchQuery: debouncedSearchQueryAndPage.search,
            paginateArgs: {
                page: debouncedSearchQueryAndPage.page,
                pageSize: DEFAULT_PAGE_SIZE,
            },
            sortBy: debouncedSearchQueryAndPage.sortBy,
            sortDirection: debouncedSearchQueryAndPage.sortDirection,
        });

    useEffect(() => {
        setPage(1);
    }, [search, sortBy, sortDirection]);

    const schedulers = useMemo(() => {
        return paginatedSchedulers?.data || [];
    }, [paginatedSchedulers]);

    const pagination = useMemo(() => {
        return paginatedSchedulers?.pagination;
    }, [paginatedSchedulers]);

    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const { data: allSlackChannels } = useSlackChannels(
        '',
        { excludeArchived: false },
        { enabled: organizationHasSlack },
    );

    const getSlackChannelName = useCallback(
        (channelId: string) => {
            if (allSlackChannels === undefined || allSlackChannels.length === 0)
                return channelId;
            const channelName = allSlackChannels.find(
                (slackChannel) => slackChannel.id === channelId,
            )?.name;
            return channelName || channelId;
        },
        [allSlackChannels],
    );

    const { data: project } = useProject(projectUuid);

    const columns = useMemo<Column[]>(
        () =>
            project
                ? [
                      {
                          id: 'name',
                          label: t(
                              'components_schedulers_view_table.name.label',
                          ),
                          cell: (item) => {
                              const format = () => {
                                  switch (item.format) {
                                      case SchedulerFormat.CSV:
                                          return t(
                                              'components_schedulers_view_table.name.groups.csv',
                                          );
                                      case SchedulerFormat.XLSX:
                                          return t(
                                              'components_schedulers_view_table.name.groups.xlsx',
                                          );
                                      case SchedulerFormat.IMAGE:
                                          return t(
                                              'components_schedulers_view_table.name.groups.image',
                                          );
                                      case SchedulerFormat.GSHEETS:
                                          return t(
                                              'components_schedulers_view_table.name.groups.google_sheets',
                                          );
                                  }
                              };
                              return (
                                  <Group noWrap>
                                      {getSchedulerIcon(item, theme)}
                                      <Stack spacing="two">
                                          <Anchor
                                              component={Link}
                                              unstyled
                                              to={getSchedulerLink(
                                                  item,
                                                  projectUuid,
                                              )}
                                              target="_blank"
                                          >
                                              <Tooltip
                                                  label={
                                                      <Stack
                                                          spacing="two"
                                                          fz="xs"
                                                      >
                                                          <Text color="gray.5">
                                                              {t(
                                                                  'components_schedulers_view_table.name.groups.schedule_type',
                                                              )}{' '}
                                                              <Text
                                                                  color="white"
                                                                  span
                                                              >
                                                                  {format()}
                                                              </Text>
                                                          </Text>
                                                          <Text color="gray.5">
                                                              {t(
                                                                  'components_schedulers_view_table.name.groups.created_by',
                                                              )}{' '}
                                                              <Text
                                                                  color="white"
                                                                  span
                                                              >
                                                                  {item.createdByName ||
                                                                      'n/a'}
                                                              </Text>
                                                          </Text>
                                                      </Stack>
                                                  }
                                              >
                                                  <Text
                                                      fw={600}
                                                      lineClamp={1}
                                                      sx={{
                                                          overflowWrap:
                                                              'anywhere',
                                                          '&:hover': {
                                                              textDecoration:
                                                                  'underline',
                                                          },
                                                      }}
                                                  >
                                                      {item.name}
                                                  </Text>
                                              </Tooltip>
                                          </Anchor>
                                          <Text fz="xs" color="gray.6">
                                              {item.savedChartName ||
                                                  item.dashboardName ||
                                                  'n/a'}
                                          </Text>
                                      </Stack>
                                  </Group>
                              );
                          },
                          meta: {
                              style: {
                                  width: 300,
                              },
                          },
                      },
                      {
                          id: 'destinations',
                          label: t(
                              'components_schedulers_view_table.destinations.label',
                          ),
                          cell: (item) => {
                              const currentTargets = item.targets.filter(
                                  (target) =>
                                      target.schedulerUuid ===
                                      item.schedulerUuid,
                              );
                              let emails: string[] = [];
                              let slackChannels: string[] = [];
                              let msTeamsTargets: string[] = [];
                              currentTargets.map((target) => {
                                  if (isSlackTarget(target)) {
                                      return slackChannels.push(
                                          getSlackChannelName(target.channel),
                                      );
                                  } else if (isMsTeamsTarget(target)) {
                                      return msTeamsTargets.push(
                                          target.webhook,
                                      );
                                  } else {
                                      return emails.push(target.recipient);
                                  }
                              });
                              return (
                                  <Group spacing="xxs">
                                      {emails.length > 0 && (
                                          <Tooltip
                                              label={emails.map((email, i) => (
                                                  <Text fz="xs" key={i}>
                                                      {email}
                                                  </Text>
                                              ))}
                                          >
                                              <Text
                                                  fz="xs"
                                                  color="gray.6"
                                                  underline
                                              >
                                                  {slackChannels.length > 0
                                                      ? `${t(
                                                            'components_schedulers_view_table.destinations.groups.emial',
                                                        )},`
                                                      : t(
                                                            'components_schedulers_view_table.destinations.groups.emial',
                                                        )}
                                              </Text>
                                          </Tooltip>
                                      )}
                                      {slackChannels.length > 0 && (
                                          <Tooltip
                                              label={slackChannels.map(
                                                  (channel, i) => (
                                                      <Text fz="xs" key={i}>
                                                          {channel}
                                                      </Text>
                                                  ),
                                              )}
                                          >
                                              <Text
                                                  fz="xs"
                                                  color="gray.6"
                                                  underline
                                              >
                                                  {t(
                                                      'components_schedulers_view_table.destinations.groups.slack',
                                                  )}
                                              </Text>
                                          </Tooltip>
                                      )}
                                      {item.format ===
                                          SchedulerFormat.GSHEETS &&
                                          isSchedulerGsheetsOptions(
                                              item.options,
                                          ) && (
                                              <Tooltip
                                                  label={
                                                      item.options.gdriveName
                                                  }
                                              >
                                                  <Anchor
                                                      fz="xs"
                                                      color="gray.6"
                                                      href={item.options.url}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      sx={{
                                                          textDecoration:
                                                              'underline',
                                                      }}
                                                  >
                                                      {t(
                                                          'components_schedulers_view_table.destinations.groups.google_sheets',
                                                      )}
                                                  </Anchor>
                                              </Tooltip>
                                          )}
                                      {item.format !==
                                          SchedulerFormat.GSHEETS &&
                                          slackChannels.length === 0 &&
                                          emails.length === 0 && (
                                              <Text fz="xs" color="gray.6">
                                                  {t(
                                                      'components_schedulers_view_table.destinations.no_destinations',
                                                  )}
                                              </Text>
                                          )}
                                  </Group>
                              );
                          },
                          meta: {
                              style: {
                                  width: 130,
                              },
                          },
                      },
                      {
                          id: 'frequency',
                          label: t(
                              'components_schedulers_view_table.frequency.label',
                          ),
                          cell: (item) => {
                              return (
                                  <Text fz="xs" color="gray.6">
                                      {getHumanReadableCronExpression(
                                          item.cron,
                                          item.timezone ||
                                              project.schedulerTimezone,
                                      )}
                                  </Text>
                              );
                          },
                          meta: { style: { width: 200 } },
                      },
                      {
                          id: 'actions',
                          cell: (item) => {
                              return (
                                  <Box
                                      component="div"
                                      onClick={(
                                          e: React.MouseEvent<HTMLDivElement>,
                                      ) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                      }}
                                  >
                                      <SchedulersViewActionMenu
                                          item={item}
                                          projectUuid={projectUuid}
                                      />
                                  </Box>
                              );
                          },
                          meta: {
                              style: { width: '1px' },
                          },
                      },
                  ]
                : [],
        [project, theme, projectUuid, getSlackChannelName],
    );

    return (
        <Stack spacing="xs">
            <Paper p="sm" radius={0}>
                <Group align="center" position="apart">
                    <TextInput
                        size="xs"
                        data-testid="schedulers-search-input"
                        placeholder={t(
                            'components_schedulers_view_table.search.label',
                        )}
                        onChange={(e) => setSearch(e.target.value)}
                        value={search}
                        w={320}
                        icon={<IconSearch size={14} />}
                        rightSection={
                            search.length > 0 && (
                                <ActionIcon onClick={() => setSearch('')}>
                                    <IconX size={14} />
                                </ActionIcon>
                            )
                        }
                    />
                    <ActionIcon
                        onClick={() =>
                            setSortDirection(
                                sortDirection === 'asc' ? 'desc' : 'asc',
                            )
                        }
                    >
                        <MantineIcon icon={IconRefresh} size={16} />
                    </ActionIcon>
                </Group>
            </Paper>

            <Table className={classes.root} highlightOnHover>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <Box
                                component="th"
                                key={column.id}
                                style={column?.meta?.style}
                            >
                                {column?.label}
                            </Box>
                        ))}
                    </tr>
                </thead>

                <tbody style={{ position: 'relative' }}>
                    {isLoadingSchedulers ? (
                        <tr>
                            <td colSpan={columns.length}>
                                <Text align="center" p="md">
                                    {t(
                                        'components_schedulers_view_table.loading',
                                    )}
                                </Text>
                            </td>
                        </tr>
                    ) : schedulers.length > 0 ? (
                        schedulers.map((item) => (
                            <tr key={item.schedulerUuid}>
                                {columns.map((column) => (
                                    <td key={column.id}>{column.cell(item)}</td>
                                ))}
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={columns.length}>
                                <Text align="center" p="md">
                                    {t(
                                        'components_schedulers_view_table.no_schedulers',
                                    )}
                                </Text>
                            </td>
                        </tr>
                    )}
                </tbody>
            </Table>

            {pagination?.totalPageCount && pagination.totalPageCount > 1 ? (
                <Flex m="sm" align="center" justify="center">
                    <Pagination
                        size="sm"
                        value={page}
                        onChange={setPage}
                        total={pagination?.totalPageCount}
                        mt="sm"
                    />
                </Flex>
            ) : null}
        </Stack>
    );
};

export default Schedulers;
