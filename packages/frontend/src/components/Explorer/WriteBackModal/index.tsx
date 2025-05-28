import {
    capitalize,
    getErrorMessage,
    NotImplementedError,
    type AdditionalMetric,
    type CustomDimension,
} from '@lightdash/common';
import {
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

import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { CreatedPullRequestModalContent } from './CreatedPullRequestModalContent';
import {
    useIsGithubProject,
    useWriteBackCustomDimensions,
    useWriteBackCustomMetrics,
} from './hooks';
import { convertToDbt, getItemId, getItemLabel, match } from './utils';

const useErrorTexts = () => {
    const { t } = useTranslation();

    const prDisabledMessage = t(
        'components_explorer_custom_metric_write_back_modal.pr_disabled_message',
    );

    const texts = {
        customDimension: {
            name: t(
                'components_explorer_custom_metric_write_back_modal.custom_dimension.name',
            ),
            baseName: t(
                'components_explorer_custom_metric_write_back_modal.custom_dimension.base_name',
            ),
            prDisabled: prDisabledMessage,
        },
        customMetric: {
            name: t(
                'components_explorer_custom_metric_write_back_modal.custom_metric.name',
            ),
            baseName: t(
                'components_explorer_custom_metric_write_back_modal.custom_metric.base_name',
            ),
            prDisabled: prDisabledMessage,
        },
    } as const;

    return {
        texts,
        prDisabledMessage,
    };
};

const SingleItemModalContent = ({
    handleClose,
    item,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    item: CustomDimension | AdditionalMetric;
}) => {
    const { t } = useTranslation();
    const { texts, prDisabledMessage } = useErrorTexts();

    const type = match(
        item,
        () => 'customDimension' as const,
        () => 'customMetric' as const,
    );

    const parseError = useCallback(
        (
            error: unknown,
            errorType: 'customDimension' | 'customMetric',
        ): string => {
            const errorName =
                error instanceof Error ? error.name : 'unknown error';
            const errorTitle =
                error instanceof NotImplementedError
                    ? t(
                          'components_explorer_custom_metric_write_back_modal.unsupported_definition_error',
                          {
                              type: texts[errorType].baseName,
                          },
                      )
                    : errorName;
            return `${t(
                'components_explorer_custom_metric_write_back_modal.error',
            )}: ${errorTitle}\n${getErrorMessage(error)}`;
        },
        [texts, t],
    );

    const {
        mutate: writeBackCustomDimension,
        data: writeBackCustomDimensionData,
        isLoading: writeBackCustomDimensionIsLoading,
    } = useWriteBackCustomDimensions(projectUuid!);
    const {
        mutate: writeBackCustomMetrics,
        data: writeBackCustomMetricsData,
        isLoading: writeBackCustomMetricsIsLoading,
    } = useWriteBackCustomMetrics(projectUuid!);

    const data = match(
        item,
        () => writeBackCustomDimensionData,
        () => writeBackCustomMetricsData,
    );

    const isLoading = match(
        item,
        () => writeBackCustomDimensionIsLoading,
        () => writeBackCustomMetricsIsLoading,
    );

    const [showDiff, setShowDiff] = useState(true);
    const [error, setError] = useState<string | undefined>();

    const isGithubProject = useIsGithubProject(projectUuid);

    const previewCode = useMemo(() => {
        try {
            const { key, value } = convertToDbt(item);

            const code = yaml.dump({
                [key]: value,
            });

            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e, type));
            return '';
        }
    }, [item, type, parseError]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip = isGithubProject && !error;

    const errorTooltipLabel = error
        ? t(
              'components_explorer_custom_metric_write_back_modal.unsupported_definition_error',
              {
                  type: texts[type].baseName,
              },
          )
        : prDisabledMessage;

    const buttonDisabled = isLoading || !disableErrorTooltip;

    const itemLabel = getItemLabel(item);

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
                            'components_explorer_custom_metric_write_back_modal.single_custom_metric.content',
                            {
                                type: texts[type].name,
                                baseName: texts[type].baseName,
                            },
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
                        'components_explorer_custom_metric_write_back_modal.single_custom_metric.content',
                        {
                            type: texts[type].name,
                        },
                    )}
                </Text>
                <List spacing="xs" pl="xs">
                    <List.Item fz="xs" ff="monospace">
                        {itemLabel}
                    </List.Item>
                </List>
                <CollapsableCard
                    isOpen={showDiff}
                    title={t(
                        'components_explorer_custom_metric_write_back_modal.single_custom_metric.show_code',
                        {
                            type: texts[type].baseName,
                        },
                    )}
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
                                match(
                                    item,
                                    (customDimension) =>
                                        writeBackCustomDimension([
                                            customDimension,
                                        ]),
                                    (customMetric) =>
                                        writeBackCustomMetrics([customMetric]),
                                );
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

const MultipleItemsModalContent = ({
    handleClose,
    items,
    projectUuid,
}: {
    handleClose: () => void;
    projectUuid: string;
    items: CustomDimension[] | AdditionalMetric[];
}) => {
    const { t } = useTranslation();
    const { texts, prDisabledMessage } = useErrorTexts();

    const type = match(
        items[0]!,
        () => 'customDimension' as const,
        () => 'customMetric' as const,
    );

    const {
        mutate: writeBackCustomDimension,
        data: writeBackCustomDimensionData,
        isLoading: writeBackCustomDimensionIsLoading,
    } = useWriteBackCustomDimensions(projectUuid!);
    const {
        mutate: writeBackCustomMetrics,
        data: writeBackCustomMetricsData,
        isLoading: writeBackCustomMetricsIsLoading,
    } = useWriteBackCustomMetrics(projectUuid!);

    const data = match(
        items[0]!,
        () => writeBackCustomDimensionData,
        () => writeBackCustomMetricsData,
    );

    const isLoading = match(
        items[0]!,
        () => writeBackCustomDimensionIsLoading,
        () => writeBackCustomMetricsIsLoading,
    );

    const isGithubProject = useIsGithubProject(projectUuid);

    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

    const selectedItems = useMemo(
        () => items.filter((item) => selectedItemIds.includes(getItemId(item))),
        [items, selectedItemIds],
    );

    const [error, setError] = useState<string | undefined>();

    const previewCode = useMemo(() => {
        if (selectedItems.length === 0) return '';
        try {
            const code = yaml.dump(
                selectedItems
                    .map((item) => {
                        const { key, value } = convertToDbt(item);
                        return {
                            [key]: value,
                        };
                    })
                    .reduce((acc, curr) => ({ ...acc, ...curr }), {}),
            );
            setError(undefined);
            return code;
        } catch (e) {
            setError(parseError(e, type));
            return '';
        }
    }, [selectedItems, type]);

    if (data) {
        // Return a simple confirmation modal with the PR URL
        return (
            <CreatedPullRequestModalContent data={data} onClose={handleClose} />
        );
    }

    const disableErrorTooltip =
        isGithubProject && selectedItemIds.length > 0 && !error;

    const errorTooltipLabel = error
        ? t(
              'components_explorer_custom_metric_write_back_modal.unsupported_definition_error',
              {
                  type: texts[type].baseName,
              },
          )
        : !isGithubProject
        ? prDisabledMessage
        : t(
              'components_explorer_custom_metric_write_back_modal.select_item_to_open_pr',
              {
                  type: texts[type].baseName,
              },
          );

    const buttonDisabled =
        isLoading || !disableErrorTooltip || selectedItemIds.length === 0;
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
                    'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.content',
                    {
                        type: texts[type].baseName,
                    },
                )}
            </Text>

            <Stack p="md">
                <Group align="flex-start" h="305px">
                    <Stack w="30%" h="100%">
                        <Text>
                            {t(
                                'components_explorer_custom_metric_write_back_modal.multiple_custom_metrics.available_items',
                                {
                                    type: texts[type].name,
                                    length: selectedItemIds.length,
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
                            {items.map((item) => {
                                const itemId = getItemId(item);
                                const itemLabel = getItemLabel(item);
                                return (
                                    <Tooltip
                                        label={itemLabel}
                                        key={itemId}
                                        position="right"
                                    >
                                        <Group
                                            noWrap
                                            key={itemId}
                                            onClick={() =>
                                                setSelectedItemIds(
                                                    !selectedItemIds.includes(
                                                        itemId,
                                                    )
                                                        ? [
                                                              ...selectedItemIds,
                                                              itemId,
                                                          ]
                                                        : selectedItemIds.filter(
                                                              (name) =>
                                                                  name !==
                                                                  itemId,
                                                          ),
                                                )
                                            }
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <Checkbox
                                                size="xs"
                                                checked={selectedItemIds.includes(
                                                    itemId,
                                                )}
                                            />
                                            <Text truncate="end">
                                                {itemLabel}
                                            </Text>
                                        </Group>
                                    </Tooltip>
                                );
                            })}
                        </Stack>
                    </Stack>
                    <Stack w="calc(70% - 18px)" h="100%">
                        <Text>
                            {capitalize(texts[type].baseName)} YAML to be
                            created:
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
                                if (!items || selectedItems.length === 0)
                                    return;

                                match(
                                    items[0],
                                    () =>
                                        writeBackCustomDimension(
                                            selectedItems as CustomDimension[],
                                        ),
                                    () =>
                                        writeBackCustomMetrics(
                                            selectedItems as AdditionalMetric[],
                                        ),
                                );
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

export const WriteBackModal = () => {
    const { isOpen, items } = useExplorerContext(
        (context) => context.state.modals.writeBack,
    );

    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleWriteBackModal,
    );

    if (!isOpen) {
        return null;
    }

    if (!items || items.length === 0) {
        console.error(
            new Error(
                t(
                    'components_explorer_custom_metric_write_back_modal.no_items_to_write_back',
                ),
            ),
        );
        return null; // TODO: Add a modal to explain that no custom metrics or dimensions are defined
    }

    if (items && items.length === 1) {
        return (
            <SingleItemModalContent
                handleClose={toggleModal}
                item={items[0]}
                projectUuid={projectUuid!}
            />
        );
    }

    return (
        <MultipleItemsModalContent
            handleClose={toggleModal}
            projectUuid={projectUuid!}
            items={items}
        />
    );
};
