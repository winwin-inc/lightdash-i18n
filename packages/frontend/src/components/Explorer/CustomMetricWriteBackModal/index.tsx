import {
    convertCustomMetricToDbt,
    DbtProjectType,
    getErrorMessage,
    NotImplementedError,
    type AdditionalMetric,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Checkbox,
    Group,
    List,
    Modal,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import * as yaml from 'js-yaml';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useProject } from '../../../hooks/useProject';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { useWriteBackCustomMetrics } from './hooks/useCustomMetricWriteBack';

const useIsGithubProject = (projectUuid: string) => {
    const { data: project } = useProject(projectUuid);
    return project?.dbtConnection.type === DbtProjectType.GITHUB;
};

const CreatedPullRequestModalContent = ({
    onClose,
    data,
}: {
    onClose: () => void;
    data: { prUrl: string };
}) => {
    const { t } = useTranslation();

    const prDisabledMessage = t(
        'components_explorer_custom_metric_write_back_modal.pr_disabled_message',
    );
    const unsupportedMetricDefinitionError = t(
        'components_explorer_custom_metric_write_back_modal.unsupported_metric_definition_error',
    );

    return (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>
                        {t(
                            'components_explorer_custom_metric_write_back_modal.create_pr.write_back_to_dbt',
                        )}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md">
                <Text>
                    {t(
                        'components_explorer_custom_metric_write_back_modal.create_pr.content.part_1',
                    )}{' '}
                    <Anchor href={data.prUrl} target="_blank" span fw={700}>
                        #{data.prUrl.split('/').pop()}
                    </Anchor>{' '}
                    {t(
                        'components_explorer_custom_metric_write_back_modal.create_pr.content.part_2',
                    )}
                    <Text pt="md">
                        {t(
                            'components_explorer_custom_metric_write_back_modal.create_pr.content.part_3',
                        )}
                    </Text>
                </Text>
            </Stack>
            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={onClose}
                    variant="outline"
                    size="xs"
                >
                    {t(
                        'components_explorer_custom_metric_write_back_modal.create_pr.close',
                    )}
                </Button>
            </Group>
        </Modal>
    );
};

const parseError = (error: unknown): string => {
    const errorName = error instanceof Error ? error.name : 'unknown error';
    return `Error: ${
        error instanceof NotImplementedError
            ? t(
                  'components_explorer_custom_metric_write_back_modal.unsupported_metric_definition_error',
              )
            : errorName
    }

${getErrorMessage(error)}`;
};

const SingleCustomMetricModalContent = ({
    handleClose,
    item,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    item: AdditionalMetric;
}) => {
    const { t } = useTranslation();
    const {
        mutate: writeBackCustomMetrics,
        data,
        isLoading,
    } = useWriteBackCustomMetrics(projectUuid!);
    const [showDiff, setShowDiff] = useState(true);
    const [error, setError] = useState<string | undefined>();

    const isGithubProject = useIsGithubProject(projectUuid);

    const previewCode = useMemo(() => {
        try {
            const code = yaml.dump({
                [item.name]: convertCustomMetricToDbt(item),
            });
            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e));
            return '';
        }
    }, [item]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip = isGithubProject && !error;

    const errorTooltipLabel = error
        ? unsupportedMetricDefinitionError
        : prDisabledMessage;

    const buttonDisabled = isLoading || !disableErrorTooltip;

    return (
        <Modal
            size="lg"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={handleClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>
                        {t(
                            'components_explorer_custom_metric_write_back_modal.single_custom_metric.write_back_to_dbt',
                        )}
                    </Text>
                    <Tooltip
                        variant="xs"
                        withinPortal
                        multiline
                        maw={300}
                        label={t(
                            'components_explorer_custom_metric_write_back_modal.single_custom_metric.content.part_1',
                        )}
                    >
                        <MantineIcon
                            color="gray.7"
                            icon={IconInfoCircle}
                            size={16}
                        />
                    </Tooltip>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md">
                <Text>
                    {t(
                        'components_explorer_custom_metric_write_back_modal.single_custom_metric.content.part_2',
                    )}
                </Text>
                <List spacing="xs" pl="xs">
                    <List.Item fz="xs" ff="monospace">
                        {item.label}
                    </List.Item>
                </List>
                <CollapsableCard
                    isOpen={showDiff}
                    title={'Show metrics code'}
                    onToggle={() => setShowDiff(!showDiff)}
                >
                    <Stack ml={36}>
                        <Prism language="yaml" withLineNumbers trim={false}>
                            {error || previewCode}
                        </Prism>
                    </Stack>
                </CollapsableCard>
            </Stack>

            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={handleClose}
                    variant="outline"
                    disabled={isLoading}
                    size="xs"
                >
                    {t(
                        'components_explorer_custom_metric_write_back_modal.single_custom_metric.cancel',
                    )}
                </Button>

                <Tooltip
                    label={errorTooltipLabel}
                    disabled={disableErrorTooltip}
                >
                    <div>
                        <Button
                            disabled={buttonDisabled}
                            size="xs"
                            onClick={() => {
                                if (!item) return;
                                writeBackCustomMetrics([item]);
                            }}
                        >
                            {isLoading
                                ? t(
                                      'components_explorer_custom_metric_write_back_modal.single_custom_metric.create_pr',
                                  )
                                : t(
                                      'components_explorer_custom_metric_write_back_modal.single_custom_metric.open_pr',
                                  )}
                        </Button>
                    </div>
                </Tooltip>
            </Group>
        </Modal>
    );
};

const MultipleCustomMetricModalContent = ({
    handleClose,
    items,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    items: AdditionalMetric[];
}) => {
    const { t } = useTranslation();
    const {
        mutate: writeBackCustomMetrics,
        data,
        isLoading,
    } = useWriteBackCustomMetrics(projectUuid);

    const isGithubProject = useIsGithubProject(projectUuid);

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [error, setError] = useState<string | undefined>();

    const previewCode = useMemo(() => {
        if (selectedItems.length === 0) return '';
        try {
            const selectedMetrics = items.filter((item) =>
                selectedItems.includes(item.name),
            );
            const code = yaml.dump(
                selectedMetrics.map((item) => ({
                    [item.name]: convertCustomMetricToDbt(item),
                })),
            );
            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e));
            return '';
        }
    }, [items, selectedItems]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip =
        isGithubProject && selectedItems.length > 0 && !error;

    const errorTooltipLabel = error
        ? unsupportedMetricDefinitionError
        : !isGithubProject
        ? prDisabledMessage
        : t(
              'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.select_metrics',
          );

    const buttonDisabled = isLoading || !disableErrorTooltip;

    return (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={handleClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>
                        {t(
                            'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.write_back_to_dbt',
                        )}
                    </Text>
                </Group>
            }
            styles={() => ({
                body: { padding: 0, height: '435px' },
            })}
        >
            <Text
                pl="md"
                pb="sm"
                fz="s"
                color="gray.7"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[4]}`,
                })}
            >
                {t(
                    'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.content.part_1',
                )}
            </Text>

            <Stack p="md">
                <Group align="flex-start" h="305px">
                    <Stack w="30%" h="100%">
                        <Text>
                            {t(
                                'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.content.part_2',
                                {
                                    length: selectedItems.length,
                                },
                            )}
                        </Text>

                        <Stack
                            h="100%"
                            p="sm"
                            sx={{
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                                overflowY: 'auto',
                            }}
                        >
                            {items.map((item) => (
                                <Tooltip
                                    label={item.label}
                                    key={item.name}
                                    position="right"
                                >
                                    <Group
                                        noWrap
                                        key={item.name}
                                        onClick={() =>
                                            setSelectedItems(
                                                !selectedItems.includes(
                                                    item.name,
                                                )
                                                    ? [
                                                          ...selectedItems,
                                                          item.name,
                                                      ]
                                                    : selectedItems.filter(
                                                          (name) =>
                                                              name !==
                                                              item.name,
                                                      ),
                                            )
                                        }
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <Checkbox
                                            size="xs"
                                            checked={selectedItems.includes(
                                                item.name,
                                            )}
                                        />
                                        <Text truncate="end">{item.label}</Text>
                                    </Group>
                                </Tooltip>
                            ))}
                        </Stack>
                    </Stack>
                    <Stack w="calc(70% - 18px)" h="100%">
                        <Text>
                            {t(
                                'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.metric_yaml_to_be_created',
                            )}
                        </Text>

                        <Stack
                            h="100%"
                            sx={{
                                overflowY: 'auto',
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                            }}
                        >
                            <Prism
                                language="yaml"
                                trim={false}
                                noCopy={previewCode === ''}
                            >
                                {error || previewCode}
                            </Prism>
                        </Stack>
                    </Stack>
                </Group>
            </Stack>

            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={handleClose}
                    variant="outline"
                    disabled={isLoading}
                    size="xs"
                >
                    {t(
                        'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.cancel',
                    )}
                </Button>

                <Tooltip
                    label={errorTooltipLabel}
                    disabled={disableErrorTooltip}
                >
                    <div>
                        <Button
                            disabled={buttonDisabled}
                            size="xs"
                            onClick={() => {
                                if (!items) return;
                                writeBackCustomMetrics(items);
                            }}
                        >
                            {isLoading
                                ? t(
                                      'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.create_pr',
                                  )
                                : t(
                                      'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.open_pr',
                                  )}
                        </Button>
                    </div>
                </Tooltip>
            </Group>
        </Modal>
    );
};

export const CustomMetricWriteBackModal = () => {
    const { items, multiple, isOpen } = useExplorerContext(
        (context) => context.state.modals.additionalMetricWriteBack,
    );
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricWriteBackModal,
    );

    const handleClose = useCallback(() => {
        toggleModal();
    }, [toggleModal]);

    if (!isOpen) {
        return null;
    }

    if (items && !multiple && items.length === 1) {
        return (
            <SingleCustomMetricModalContent
                handleClose={handleClose}
                item={items[0]}
                projectUuid={projectUuid!}
            />
        );
    } else if (multiple === true) {
        return (
            <MultipleCustomMetricModalContent
                handleClose={handleClose}
                projectUuid={projectUuid!}
                items={items || []}
            />
        );
    } else {
        console.error(
            `Invalid custom metric modal arguments multiple="${multiple}": `,
            items,
        );
    }
};
