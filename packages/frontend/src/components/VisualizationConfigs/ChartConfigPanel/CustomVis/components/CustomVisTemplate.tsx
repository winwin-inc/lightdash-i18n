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
import { IconCode, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    type ChartTemplateListItem,
    getTemplateSpec,
} from '../../../../../features/templates/api/templatesApi';
import {
    useChartTemplate,
    useChartTemplates,
} from '../../../../../features/templates/hooks/useTemplates';
import MantineIcon from '../../../../common/MantineIcon';
import MantineModal from '../../../../common/MantineModal';

const MODAL_SCROLL_HEIGHT = 'calc(88vh - 260px)';

export const SelectTemplate = ({
    setEditorConfig,
}: {
    setEditorConfig: (config: string) => void;
}) => {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<
        string | undefined
    >(undefined);
    const [selectedChartType, setSelectedChartType] = useState<string>('all');
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [previewImageTitle, setPreviewImageTitle] = useState<string>('');

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

    useEffect(() => {
        if (!opened || filteredTemplates.length === 0) return;

        const hasCurrentSelection = filteredTemplates.some(
            (template) => String(template.id) === selectedTemplateId,
        );

        if (!selectedTemplateId || !hasCurrentSelection) {
            setSelectedTemplateId(String(filteredTemplates[0].id));
        }
    }, [opened, filteredTemplates, selectedTemplateId]);

    const selectedTemplateSpec = useMemo(
        () => getTemplateSpec(selectedTemplate),
        [selectedTemplate],
    );

    const selectedTemplateSpecString = useMemo(() => {
        if (!selectedTemplateSpec) return '';
        return JSON.stringify(selectedTemplateSpec, null, 2);
    }, [selectedTemplateSpec]);

    const applyTemplate = useCallback(() => {
        if (!selectedTemplateSpecString) return;
        setEditorConfig(selectedTemplateSpecString);
        setOpened(false);
    }, [selectedTemplateSpecString, setEditorConfig]);

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

    return (
        <>
            <MantineModal
                opened={opened}
                onClose={() => setOpened(false)}
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
                    },
                }}
                actions={
                    <>
                        <Button
                            variant="default"
                            onClick={() => setOpened(false)}
                        >
                            {t(
                                'components_visualization_configs_custom_vis_template.cancel',
                            )}
                        </Button>
                        <Button
                            onClick={applyTemplate}
                            disabled={!selectedTemplateSpecString}
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
                            setSelectedChartType(value || 'all')
                        }
                        data={chartTypeOptions}
                    />

                    <div
                        style={{
                            display: 'block',
                        }}
                    >
                        <ScrollArea h={MODAL_SCROLL_HEIGHT}>
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
                                            <Button
                                                key={templateId}
                                                variant={
                                                    selected
                                                        ? 'light'
                                                        : 'default'
                                                }
                                                size="sm"
                                                fullWidth
                                                onClick={() =>
                                                    setSelectedTemplateId(
                                                        templateId,
                                                    )
                                                }
                                                styles={{
                                                    root: {
                                                        minHeight: 58,
                                                        height: 'auto',
                                                        paddingTop: 6,
                                                        paddingBottom: 6,
                                                    },
                                                    inner: {
                                                        justifyContent:
                                                            'flex-start',
                                                        alignItems:
                                                            'flex-start',
                                                    },
                                                }}
                                            >
                                                <Group
                                                    spacing="xs"
                                                    align="flex-start"
                                                    noWrap
                                                    sx={{ width: '100%' }}
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
                                                            onClick={(
                                                                event,
                                                            ) => {
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
                                                            flexDirection:
                                                                'column',
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
                                                </Group>
                                            </Button>
                                        );
                                    })
                                )}
                            </Stack>
                        </ScrollArea>
                    </div>
                </Stack>
            </MantineModal>

            <Button
                size="sm"
                variant="default"
                compact
                fz="xs"
                leftIcon={<MantineIcon icon={IconPlus} />}
                onClick={() => setOpened(true)}
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
        </>
    );
};
