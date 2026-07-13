import {
    Box,
    Button,
    Group,
    Image,
    Loader,
    Modal,
    ScrollArea,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCode, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    type ChartTemplateListItem,
    getChartTemplate,
    getTemplateSpec,
} from '../../../../../features/templates/api/templatesApi';
import {
    useChartTemplate,
    useChartTemplates,
} from '../../../../../features/templates/hooks/useTemplates';
import useToaster from '../../../../../hooks/toaster/useToaster';
import MantineIcon from '../../../../common/MantineIcon';
import MantineModal from '../../../../common/MantineModal';

const MODAL_SCROLL_HEIGHT = 'calc(88vh - 260px)';
const MODAL_SCROLL_AREA_PROPS = {
    h: MODAL_SCROLL_HEIGHT,
    offsetScrollbars: true,
    className: 'only-vertical',
    variant: 'primary' as const,
    styles: {
        root: {
            overflowX: 'hidden' as const,
        },
        viewport: {
            paddingRight: 14,
            overflowX: 'hidden' as const,
        },
        scrollbar: {
            '&[data-orientation="horizontal"]': {
                display: 'none',
            },
        },
    },
};
const LAST_SELECTED_TEMPLATE_STORAGE_KEY = 'lastSelectedChartTemplateId';
const LAST_SELECTED_TEMPLATE_CHART_TYPE_STORAGE_KEY =
    'lastSelectedChartTemplateChartType';

export const SelectTemplate = ({
    setEditorConfig,
}: {
    setEditorConfig: (config: string) => void;
}) => {
    const { t } = useTranslation();
    const clipboard = useClipboard({ timeout: 1200 });
    const { showToastSuccess } = useToaster();

    const [opened, setOpened] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<
        string | undefined
    >(undefined);
    const [selectedChartType, setSelectedChartType] = useState<string>(() => {
        try {
            const remembered = localStorage.getItem(
                LAST_SELECTED_TEMPLATE_CHART_TYPE_STORAGE_KEY,
            );
            return remembered || 'all';
        } catch {
            return 'all';
        }
    });
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [previewImageTitle, setPreviewImageTitle] = useState<string>('');
    const [isSpecPreviewOpen, setIsSpecPreviewOpen] = useState(false);

    const { data: templates = [], isLoading: isTemplatesLoading } =
        useChartTemplates({
            enabled: opened,
        });
    const { data: selectedTemplate } = useChartTemplate(selectedTemplateId, {
        enabled: opened && !!selectedTemplateId,
    });

    const chartTypeOptions = useMemo(() => {
        const chartTypes = Array.from(
            new Set(
                templates
                    .map((template) => template.chart_type)
                    .filter((value): value is string => !!value),
            ),
        );

        return [
            {
                value: 'all',
                label: t(
                    'components_visualization_configs_custom_vis_template.all_chart_types',
                ),
            },
            ...chartTypes.map((chartType) => ({
                value: chartType,
                label: chartType,
            })),
        ];
    }, [templates, t]);

    const filteredTemplates = useMemo(() => {
        if (selectedChartType === 'all') return templates;
        return templates.filter(
            (template) => template.chart_type === selectedChartType,
        );
    }, [templates, selectedChartType]);

    const rememberSelectedTemplateId = useCallback((templateId: string) => {
        try {
            localStorage.setItem(
                LAST_SELECTED_TEMPLATE_STORAGE_KEY,
                templateId,
            );
        } catch {
            // Ignore localStorage write failures
        }
    }, []);

    const selectTemplateId = useCallback(
        (templateId: string) => {
            setSelectedTemplateId(templateId);
            rememberSelectedTemplateId(templateId);
        },
        [rememberSelectedTemplateId],
    );

    const updateSelectedChartType = useCallback((chartType: string) => {
        setSelectedChartType(chartType);
        try {
            localStorage.setItem(
                LAST_SELECTED_TEMPLATE_CHART_TYPE_STORAGE_KEY,
                chartType,
            );
        } catch {
            // Ignore localStorage write failures
        }
    }, []);

    useEffect(() => {
        if (!opened || filteredTemplates.length === 0) return;

        const hasCurrentSelection = filteredTemplates.some(
            (template) => String(template.id) === selectedTemplateId,
        );

        if (!selectedTemplateId || !hasCurrentSelection) {
            let rememberedTemplateId: string | null = null;
            try {
                rememberedTemplateId = localStorage.getItem(
                    LAST_SELECTED_TEMPLATE_STORAGE_KEY,
                );
            } catch {
                rememberedTemplateId = null;
            }

            const hasRememberedSelection =
                rememberedTemplateId &&
                filteredTemplates.some(
                    (template) => String(template.id) === rememberedTemplateId,
                );

            if (hasRememberedSelection && rememberedTemplateId) {
                setSelectedTemplateId(rememberedTemplateId);
            } else {
                setSelectedTemplateId(String(filteredTemplates[0].id));
            }
        }
    }, [opened, filteredTemplates, selectedTemplateId]);

    useEffect(() => {
        if (!opened || selectedChartType === 'all') return;

        const hasSelectedChartType = templates.some(
            (template) => template.chart_type === selectedChartType,
        );
        if (!hasSelectedChartType) {
            updateSelectedChartType('all');
        }
    }, [opened, selectedChartType, templates, updateSelectedChartType]);

    const selectedTemplateSpec = useMemo(
        () => getTemplateSpec(selectedTemplate),
        [selectedTemplate],
    );

    const selectedTemplateSpecString = useMemo(() => {
        if (!selectedTemplateSpec) return '';
        return JSON.stringify(selectedTemplateSpec, null, 2);
    }, [selectedTemplateSpec]);

    const insertSelectedTemplate = useCallback(() => {
        if (!selectedTemplateSpec) return;
        if (selectedTemplateId) {
            rememberSelectedTemplateId(selectedTemplateId);
        }
        setEditorConfig(JSON.stringify(selectedTemplateSpec, null, 2));
        setOpened(false);
    }, [
        selectedTemplateSpec,
        selectedTemplateId,
        rememberSelectedTemplateId,
        setEditorConfig,
    ]);

    const copyTemplateSpec = useCallback(() => {
        if (!selectedTemplateSpecString) return;
        clipboard.copy(selectedTemplateSpecString);
        showToastSuccess({
            title: t('components_json_viewer_modal.copied'),
        });
    }, [clipboard, selectedTemplateSpecString, showToastSuccess, t]);

    const getTemplateDisplayName = (template: ChartTemplateListItem) => {
        const rawName = template.example_name || `Template ${template.id}`;
        const matched = rawName.match(/^(.*?)\((.+)\)$/);

        if (!matched) {
            return {
                primaryName: rawName,
                secondaryName: null as string | null,
            };
        }

        const [, technicalName, chineseName] = matched;
        return {
            primaryName: chineseName.trim(),
            secondaryName: technicalName.trim(),
        };
    };

    const openTemplateDetailFromList = useCallback(
        (templateId: string) => {
            selectTemplateId(templateId);
            setIsSpecPreviewOpen(true);
        },
        [selectTemplateId],
    );

    const copyTemplateFromList = useCallback(
        async (templateId: string) => {
            const detail = await getChartTemplate(templateId);
            const spec = getTemplateSpec(detail);
            if (!spec) return;

            selectTemplateId(templateId);
            clipboard.copy(JSON.stringify(spec, null, 2));
            showToastSuccess({
                title: t('components_json_viewer_modal.copied'),
            });
        },
        [clipboard, selectTemplateId, showToastSuccess, t],
    );

    return (
        <>
            <MantineModal
                opened={opened}
                onClose={() => {
                    setOpened(false);
                }}
                title={t(
                    'components_visualization_configs_custom_vis_template.insert_template',
                )}
                icon={IconCode}
                size="xl"
                modalRootProps={{
                    size: 800,
                }}
                modalContentProps={{
                    sx: {
                        width: '90vw',
                        maxWidth: 800,
                    },
                }}
                modalBodyProps={{
                    sx: {
                        maxHeight: 'calc(88vh - 130px)',
                        overflow: 'hidden',
                        overflowX: 'hidden',
                    },
                }}
                actions={
                    <>
                        <Button
                            variant="default"
                            onClick={() => {
                                setOpened(false);
                            }}
                        >
                            {t(
                                'components_visualization_configs_custom_vis_template.cancel',
                            )}
                        </Button>
                        <Button
                            onClick={insertSelectedTemplate}
                            disabled={!selectedTemplateSpec}
                        >
                            {t(
                                'components_visualization_configs_custom_vis_template.apply',
                            )}
                        </Button>
                    </>
                }
            >
                <Stack spacing="sm">
                    <Text size="xs" color="dimmed">
                        {t(
                            'components_visualization_configs_custom_vis_template.selecting_new_template_will_reset_the_config',
                        )}
                    </Text>
                    <Select
                        size="xs"
                        value={selectedChartType}
                        onChange={(value) =>
                            updateSelectedChartType(value || 'all')
                        }
                        data={chartTypeOptions}
                    />

                    <ScrollArea {...MODAL_SCROLL_AREA_PROPS}>
                        <Stack spacing="xs">
                            {isTemplatesLoading ? (
                                <Loader color="gray" size="sm" />
                            ) : filteredTemplates.length === 0 ? (
                                <Text size="sm" color="dimmed">
                                    {t(
                                        'components_visualization_configs_custom_vis_template.no_templates_available',
                                    )}
                                </Text>
                            ) : (
                                filteredTemplates.map((template) => {
                                    const templateId = String(template.id);
                                    const selected =
                                        templateId === selectedTemplateId;
                                    const { primaryName, secondaryName } =
                                        getTemplateDisplayName(template);
                                    return (
                                        <Box
                                            key={templateId}
                                            onClick={() => {
                                                selectTemplateId(templateId);
                                            }}
                                            sx={(theme) => ({
                                                minHeight: 58,
                                                borderRadius: theme.radius.sm,
                                                border: `1px solid ${
                                                    selected
                                                        ? theme.colors.blue[5]
                                                        : theme.colors.gray[3]
                                                }`,
                                                backgroundColor: selected
                                                    ? theme.colors.blue[0]
                                                    : theme.white,
                                                padding: 8,
                                                cursor: 'pointer',
                                            })}
                                        >
                                            <Group
                                                spacing="xs"
                                                align="center"
                                                noWrap
                                                sx={{
                                                    width: '100%',
                                                }}
                                            >
                                                {template.cover_image_url ? (
                                                    <Image
                                                        src={
                                                            template.cover_image_url
                                                        }
                                                        width={52}
                                                        height={52}
                                                        radius="xs"
                                                        withPlaceholder
                                                        alt={primaryName}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setPreviewImageUrl(
                                                                template.cover_image_url ||
                                                                    null,
                                                            );
                                                            setPreviewImageTitle(
                                                                primaryName,
                                                            );
                                                        }}
                                                        sx={{
                                                            flexShrink: 0,
                                                            background:
                                                                '#f8f9fa',
                                                            cursor: 'zoom-in',
                                                        }}
                                                        styles={{
                                                            image: {
                                                                objectFit:
                                                                    'contain',
                                                            },
                                                        }}
                                                    />
                                                ) : null}
                                                <Box
                                                    sx={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems:
                                                            'flex-start',
                                                        gap: 2,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    <Text
                                                        size="sm"
                                                        fw={500}
                                                        title={primaryName}
                                                        sx={{
                                                            width: '100%',
                                                            maxWidth: '100%',
                                                            overflow: 'hidden',
                                                            textOverflow:
                                                                'ellipsis',
                                                            whiteSpace:
                                                                'nowrap',
                                                        }}
                                                    >
                                                        {primaryName}
                                                    </Text>
                                                    {secondaryName ? (
                                                        <Text
                                                            size="11px"
                                                            color="dimmed"
                                                            title={
                                                                secondaryName
                                                            }
                                                            sx={{
                                                                width: '100%',
                                                                maxWidth:
                                                                    '100%',
                                                                overflow:
                                                                    'hidden',
                                                                textOverflow:
                                                                    'ellipsis',
                                                                whiteSpace:
                                                                    'nowrap',
                                                            }}
                                                        >
                                                            {secondaryName}
                                                        </Text>
                                                    ) : null}
                                                    {template.chart_type ? (
                                                        <Text
                                                            size="11px"
                                                            color="dimmed"
                                                        >
                                                            {
                                                                template.chart_type
                                                            }
                                                        </Text>
                                                    ) : null}
                                                </Box>
                                                <Group
                                                    spacing={4}
                                                    ml="auto"
                                                    align="center"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                    }}
                                                >
                                                    <Button
                                                        variant="subtle"
                                                        size="xs"
                                                        compact
                                                        onClick={() => {
                                                            openTemplateDetailFromList(
                                                                templateId,
                                                            );
                                                        }}
                                                    >
                                                        {t(
                                                            'components_visualization_configs_custom_vis_template.view_template_detail',
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="subtle"
                                                        size="xs"
                                                        compact
                                                        onClick={() => {
                                                            void copyTemplateFromList(
                                                                templateId,
                                                            );
                                                        }}
                                                    >
                                                        {t(
                                                            'components_json_viewer_modal.copy',
                                                        )}
                                                    </Button>
                                                </Group>
                                            </Group>
                                        </Box>
                                    );
                                })
                            )}
                        </Stack>
                    </ScrollArea>
                </Stack>
            </MantineModal>

            <Button
                size="sm"
                variant="default"
                compact
                fz="xs"
                leftIcon={<MantineIcon icon={IconPlus} />}
                onClick={() => {
                    setOpened(true);
                }}
            >
                {t(
                    'components_visualization_configs_custom_vis_template.insert_template',
                )}
            </Button>

            <Modal
                opened={!!previewImageUrl}
                onClose={() => setPreviewImageUrl(null)}
                title={previewImageTitle}
                centered
                size="xl"
            >
                {previewImageUrl ? (
                    <Image
                        src={previewImageUrl}
                        alt={previewImageTitle}
                        fit="contain"
                        width="100%"
                        styles={{
                            image: {
                                maxHeight: '75vh',
                            },
                        }}
                    />
                ) : null}
            </Modal>

            <Modal
                opened={isSpecPreviewOpen}
                onClose={() => setIsSpecPreviewOpen(false)}
                title={t(
                    'components_visualization_configs_custom_vis_template.template_json_title',
                )}
                centered
                size="xl"
            >
                <Group position="right" mb="xs">
                    <Button
                        variant="light"
                        color="blue"
                        size="sm"
                        fz="xs"
                        onClick={copyTemplateSpec}
                        disabled={!selectedTemplateSpecString}
                    >
                        {clipboard.copied
                            ? t('components_json_viewer_modal.copied')
                            : t('components_json_viewer_modal.copy')}
                    </Button>
                </Group>
                <ScrollArea h="70vh">
                    <Box
                        sx={(theme) => ({
                            backgroundColor: theme.colors.gray[0],
                            borderRadius: theme.radius.sm,
                            padding: theme.spacing.sm,
                        })}
                    >
                        <Text
                            component="pre"
                            size="xs"
                            sx={{
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {selectedTemplateSpecString ||
                                t(
                                    'components_visualization_configs_custom_vis_template.template_spec_not_available',
                                )}
                        </Text>
                    </Box>
                </ScrollArea>
            </Modal>
        </>
    );
};
