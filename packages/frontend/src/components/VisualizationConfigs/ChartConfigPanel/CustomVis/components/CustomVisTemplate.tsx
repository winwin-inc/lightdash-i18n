import {
    getItemLabel,
    getItemLabelWithoutTableName,
    isDimension,
    isMetric,
    type MetricQuery,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
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
    type GenerateChartTemplateCandidatesResponse,
    getChartTemplate,
    getTemplateSpec,
} from '../../../../../features/templates/api/templatesApi';
import {
    useChartTemplate,
    useChartTemplates,
    useGenerateChartTemplateCandidates,
} from '../../../../../features/templates/hooks/useTemplates';
import useToaster from '../../../../../hooks/toaster/useToaster';
import MantineIcon from '../../../../common/MantineIcon';
import MantineModal from '../../../../common/MantineModal';
import { isCustomVisualizationConfig } from '../../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../../LightdashVisualization/useVisualizationContext';
import {
    applyMappingsToSpec,
    buildDefaultMappings,
    type CurrentQueryField,
    extractTemplateFieldRefs,
    type TemplateFieldRef,
} from '../utils/templateFieldMapping';
import { validateGeneratedVegaSpec } from '../utils/validateGeneratedVegaSpec';

const MODAL_SCROLL_HEIGHT = 'calc(88vh - 260px)';
type ModalStep = 'template' | 'ai' | 'mapping';
type CandidateWithValidation =
    GenerateChartTemplateCandidatesResponse['candidates'][number] & {
        normalizedSpec: Record<string, unknown>;
        frontendErrors: string[];
    };

export const SelectTemplate = ({
    setEditorConfig,
}: {
    setEditorConfig: (config: string) => void;
}) => {
    const { t } = useTranslation();
    const { itemsMap, resultsData, visualizationConfig } =
        useVisualizationContext();
    const clipboard = useClipboard({ timeout: 1200 });
    const { showToastSuccess } = useToaster();

    const [opened, setOpened] = useState(false);
    const [modalStep, setModalStep] = useState<ModalStep>('template');
    const [selectedTemplateId, setSelectedTemplateId] = useState<
        string | undefined
    >(undefined);
    const [selectedChartType, setSelectedChartType] = useState<string>('all');
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [previewImageTitle, setPreviewImageTitle] = useState<string>('');
    const [isSpecPreviewOpen, setIsSpecPreviewOpen] = useState(false);
    const [fieldMappings, setFieldMappings] = useState<
        Record<string, string | null>
    >({});
    const [aiCandidates, setAiCandidates] = useState<CandidateWithValidation[]>(
        [],
    );
    const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
    const {
        mutateAsync: generateCandidates,
        isLoading: isGeneratingCandidates,
    } = useGenerateChartTemplateCandidates();

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

    const templateFieldRefs = useMemo<TemplateFieldRef[]>(
        () => extractTemplateFieldRefs(selectedTemplateSpec),
        [selectedTemplateSpec],
    );

    const selectedFieldIds = useMemo(() => {
        const metricQuery: MetricQuery | undefined = resultsData?.metricQuery;
        if (!metricQuery) return [];
        return [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map(
                (calculation) => calculation.name,
            ),
        ];
    }, [resultsData?.metricQuery]);

    const returnedFieldIds = useMemo(() => {
        if (!isCustomVisualizationConfig(visualizationConfig)) return [];
        return visualizationConfig.chartConfig.fields ?? [];
    }, [visualizationConfig]);

    const currentQueryFields = useMemo<CurrentQueryField[]>(() => {
        const fieldIds = Array.from(
            new Set([
                ...returnedFieldIds,
                ...selectedFieldIds,
                ...Object.keys(itemsMap || {}),
            ]),
        );

        const buildPriority = (fieldId: string): number => {
            const inReturnedFields = returnedFieldIds.includes(fieldId);
            const isSelected = selectedFieldIds.includes(fieldId);
            if (inReturnedFields && isSelected) return 0;
            if (inReturnedFields) return 1;
            if (isSelected) return 2;
            return 3;
        };

        return fieldIds
            .map((fieldId) => {
                const item = itemsMap?.[fieldId];
                const fieldKind: CurrentQueryField['fieldKind'] = item
                    ? isDimension(item)
                        ? 'dimension'
                        : isMetric(item)
                          ? 'metric'
                          : 'unknown'
                    : 'unknown';
                return {
                    fieldId,
                    label: item ? getItemLabelWithoutTableName(item) : fieldId,
                    aliases: item
                        ? [
                              getItemLabel(item),
                              getItemLabelWithoutTableName(item),
                              fieldId,
                          ]
                        : [fieldId],
                    isSelected: selectedFieldIds.includes(fieldId),
                    fieldKind,
                };
            })
            .sort((a, b) => {
                const priorityDelta =
                    buildPriority(a.fieldId) - buildPriority(b.fieldId);
                if (priorityDelta !== 0) return priorityDelta;
                return a.label.localeCompare(b.label);
            });
    }, [itemsMap, returnedFieldIds, selectedFieldIds]);

    const mappingFieldOptions = useMemo(() => {
        return currentQueryFields.map((field) => {
            const item = itemsMap?.[field.fieldId];
            const group = item
                ? isDimension(item)
                    ? t(
                          'components_visualization_configs_custom_vis_template.group_dimensions',
                      )
                    : isMetric(item)
                      ? t(
                            'components_visualization_configs_custom_vis_template.group_metrics',
                        )
                      : t(
                            'components_visualization_configs_custom_vis_template.group_others',
                        )
                : t(
                      'components_visualization_configs_custom_vis_template.group_others',
                  );

            return {
                value: field.fieldId,
                label: field.label,
                group,
            };
        });
    }, [currentQueryFields, itemsMap, t]);

    const currentFieldKindById = useMemo(
        () =>
            new Map(
                currentQueryFields.map((field) => [
                    field.fieldId,
                    field.fieldKind || 'unknown',
                ]),
            ),
        [currentQueryFields],
    );
    const availableFieldIds = useMemo(
        () => new Set(currentQueryFields.map((field) => field.fieldId)),
        [currentQueryFields],
    );
    const selectedDimensions = useMemo(
        () =>
            selectedFieldIds.filter(
                (fieldId) => currentFieldKindById.get(fieldId) === 'dimension',
            ),
        [selectedFieldIds, currentFieldKindById],
    );
    const selectedMetrics = useMemo(
        () =>
            selectedFieldIds.filter(
                (fieldId) => currentFieldKindById.get(fieldId) === 'metric',
            ),
        [selectedFieldIds, currentFieldKindById],
    );

    const defaultMappings = useMemo(
        () => buildDefaultMappings(templateFieldRefs, currentQueryFields),
        [templateFieldRefs, currentQueryFields],
    );

    const unresolvedRequiredFields = useMemo(
        () =>
            templateFieldRefs.filter(
                (fieldRef) =>
                    fieldRef.required && !fieldMappings[fieldRef.field],
            ),
        [templateFieldRefs, fieldMappings],
    );
    const unresolvedOptionalFields = useMemo(
        () =>
            templateFieldRefs.filter(
                (fieldRef) =>
                    !fieldRef.required && !fieldMappings[fieldRef.field],
            ),
        [templateFieldRefs, fieldMappings],
    );
    const mappedRequiredCount = useMemo(
        () =>
            templateFieldRefs.filter(
                (fieldRef) =>
                    fieldRef.required && !!fieldMappings[fieldRef.field],
            ).length,
        [templateFieldRefs, fieldMappings],
    );
    const requiredCount = useMemo(
        () => templateFieldRefs.filter((fieldRef) => fieldRef.required).length,
        [templateFieldRefs],
    );
    const selectedTemplateSpecString = useMemo(() => {
        if (!selectedTemplateSpec) return '';
        return JSON.stringify(selectedTemplateSpec, null, 2);
    }, [selectedTemplateSpec]);
    const selectedCandidate = aiCandidates[selectedCandidateIndex];
    const hasValidCandidates = useMemo(
        () =>
            aiCandidates.some(
                (candidate) =>
                    candidate.valid && candidate.frontendErrors.length === 0,
            ),
        [aiCandidates],
    );
    const selectedCandidateSpecString = useMemo(() => {
        if (!selectedCandidate?.normalizedSpec) return '';
        return JSON.stringify(selectedCandidate.normalizedSpec, null, 2);
    }, [selectedCandidate]);

    const applyTemplate = useCallback(() => {
        if (!selectedTemplateSpec) return;
        const mappedSpec = applyMappingsToSpec(
            selectedTemplateSpec,
            fieldMappings,
            {
                unresolvedOptionalFields: unresolvedOptionalFields.map(
                    (fieldRef) => fieldRef.field,
                ),
            },
        );
        setEditorConfig(JSON.stringify(mappedSpec, null, 2));
        setOpened(false);
        setModalStep('template');
    }, [
        selectedTemplateSpec,
        fieldMappings,
        unresolvedOptionalFields,
        setEditorConfig,
    ]);

    const applyAiCandidate = useCallback(() => {
        if (
            !selectedCandidate ||
            !selectedCandidate.valid ||
            selectedCandidate.frontendErrors.length > 0
        ) {
            return;
        }

        setEditorConfig(
            JSON.stringify(selectedCandidate.normalizedSpec, null, 2),
        );
        setOpened(false);
        setModalStep('template');
    }, [selectedCandidate, setEditorConfig]);

    const moveToMappingStep = useCallback(() => {
        if (!selectedTemplateSpec) return;
        setFieldMappings(defaultMappings);
        setModalStep('mapping');
    }, [selectedTemplateSpec, defaultMappings]);

    const generateAiCandidates = useCallback(async () => {
        if (!selectedTemplateId) return;

        const response = await generateCandidates({
            templateId: selectedTemplateId,
            payload: {
                fields: currentQueryFields.map((field) => ({
                    fieldId: field.fieldId,
                    label: field.label,
                    fieldKind: field.fieldKind || 'unknown',
                    isSelected: field.isSelected,
                })),
                selectedDimensions,
                selectedMetrics,
            },
        });

        const candidates = (response?.candidates || []).map((candidate) => {
            const validation = validateGeneratedVegaSpec(
                candidate.spec,
                availableFieldIds,
            );
            return {
                ...candidate,
                normalizedSpec: validation.normalizedSpec,
                frontendErrors: validation.errors,
            };
        });

        setAiCandidates(candidates);
        setSelectedCandidateIndex(0);
        setModalStep('ai');
    }, [
        selectedTemplateId,
        generateCandidates,
        currentQueryFields,
        selectedDimensions,
        selectedMetrics,
        availableFieldIds,
    ]);

    const copyTemplateSpec = useCallback(() => {
        const contentToCopy =
            selectedCandidateSpecString || selectedTemplateSpecString;
        if (!contentToCopy) return;
        clipboard.copy(contentToCopy);
        showToastSuccess({
            title: t('components_json_viewer_modal.copied'),
        });
    }, [
        clipboard,
        selectedCandidateSpecString,
        selectedTemplateSpecString,
        showToastSuccess,
        t,
    ]);

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

    const openTemplateDetailFromList = useCallback((templateId: string) => {
        setSelectedTemplateId(templateId);
        setIsSpecPreviewOpen(true);
    }, []);

    const copyTemplateFromList = useCallback(
        async (templateId: string) => {
            const detail = await getChartTemplate(templateId);
            const spec = getTemplateSpec(detail);
            if (!spec) return;

            setSelectedTemplateId(templateId);
            clipboard.copy(JSON.stringify(spec, null, 2));
            showToastSuccess({
                title: t('components_json_viewer_modal.copied'),
            });
        },
        [clipboard, showToastSuccess, t],
    );

    return (
        <>
            <MantineModal
                opened={opened}
                onClose={() => {
                    setOpened(false);
                    setModalStep('template');
                    setAiCandidates([]);
                    setSelectedCandidateIndex(0);
                }}
                title={t(
                    modalStep === 'template'
                        ? 'components_visualization_configs_custom_vis_template.insert_template'
                        : modalStep === 'ai'
                          ? 'components_visualization_configs_custom_vis_template.ai_candidates_title'
                          : 'components_visualization_configs_custom_vis_template.mapping_step_title',
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
                            onClick={() => {
                                if (
                                    modalStep === 'mapping' ||
                                    modalStep === 'ai'
                                ) {
                                    setModalStep('template');
                                    return;
                                }
                                setOpened(false);
                                setModalStep('template');
                                setAiCandidates([]);
                                setSelectedCandidateIndex(0);
                            }}
                        >
                            {modalStep === 'template'
                                ? t(
                                      'components_visualization_configs_custom_vis_template.cancel',
                                  )
                                : t(
                                      'components_visualization_configs_custom_vis_template.mapping_back_step',
                                  )}
                        </Button>
                        <Button
                            onClick={
                                modalStep === 'template'
                                    ? () => {
                                          void generateAiCandidates();
                                      }
                                    : modalStep === 'ai'
                                      ? applyAiCandidate
                                      : applyTemplate
                            }
                            disabled={
                                modalStep === 'template'
                                    ? !selectedTemplateSpec ||
                                      isGeneratingCandidates
                                    : modalStep === 'ai'
                                      ? !selectedCandidate ||
                                        !selectedCandidate.valid ||
                                        selectedCandidate.frontendErrors
                                            .length > 0
                                      : unresolvedRequiredFields.length > 0
                            }
                        >
                            {modalStep === 'template'
                                ? t(
                                      isGeneratingCandidates
                                          ? 'components_visualization_configs_custom_vis_template.ai_generating'
                                          : 'components_visualization_configs_custom_vis_template.ai_generate_candidates',
                                  )
                                : modalStep === 'ai'
                                  ? t(
                                        'components_visualization_configs_custom_vis_template.ai_apply_selected_candidate',
                                    )
                                  : t(
                                        'components_visualization_configs_custom_vis_template.confirm_apply_mapped_template',
                                    )}
                        </Button>
                    </>
                }
            >
                {modalStep === 'template' ? (
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
                                            const templateId = String(
                                                template.id,
                                            );
                                            const selected =
                                                templateId ===
                                                selectedTemplateId;
                                            const {
                                                primaryName,
                                                secondaryName,
                                            } =
                                                getTemplateDisplayName(
                                                    template,
                                                );
                                            return (
                                                <Box
                                                    key={templateId}
                                                    onClick={() =>
                                                        setSelectedTemplateId(
                                                            templateId,
                                                        )
                                                    }
                                                    sx={(theme) => ({
                                                        minHeight: 58,
                                                        borderRadius:
                                                            theme.radius.sm,
                                                        border: `1px solid ${
                                                            selected
                                                                ? theme.colors
                                                                      .blue[5]
                                                                : theme.colors
                                                                      .gray[3]
                                                        }`,
                                                        backgroundColor:
                                                            selected
                                                                ? theme.colors
                                                                      .blue[0]
                                                                : theme.white,
                                                        padding: 8,
                                                        cursor: 'pointer',
                                                    })}
                                                >
                                                    <Group
                                                        spacing="xs"
                                                        align="center"
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
                                                                alt={
                                                                    primaryName
                                                                }
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
                                                                title={
                                                                    primaryName
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
                                                                    {
                                                                        secondaryName
                                                                    }
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
                                                            onClick={(
                                                                event,
                                                            ) => {
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
                        </div>
                    </Stack>
                ) : modalStep === 'ai' ? (
                    <Stack spacing="sm">
                        <Text size="xs" color="dimmed">
                            {t(
                                'components_visualization_configs_custom_vis_template.ai_candidates_description',
                            )}
                        </Text>

                        {aiCandidates.length === 0 ? (
                            <Text size="sm" color="dimmed">
                                {t(
                                    'components_visualization_configs_custom_vis_template.ai_no_candidates',
                                )}
                            </Text>
                        ) : (
                            <>
                                <Group spacing={6}>
                                    {aiCandidates.map((candidate, index) => {
                                        const isValid =
                                            candidate.valid &&
                                            candidate.frontendErrors.length ===
                                                0;
                                        return (
                                            <Button
                                                key={`${candidate.strategy}-${index}`}
                                                size="xs"
                                                variant={
                                                    index ===
                                                    selectedCandidateIndex
                                                        ? 'filled'
                                                        : 'default'
                                                }
                                                color={
                                                    isValid ? 'blue' : 'gray'
                                                }
                                                onClick={() =>
                                                    setSelectedCandidateIndex(
                                                        index,
                                                    )
                                                }
                                            >
                                                {t(
                                                    `components_visualization_configs_custom_vis_template.ai_strategy_${candidate.strategy}`,
                                                )}
                                            </Button>
                                        );
                                    })}
                                </Group>

                                {selectedCandidate ? (
                                    <Stack spacing={6}>
                                        <Text size="xs" color="dimmed">
                                            {selectedCandidate.reasoning ||
                                                t(
                                                    'components_visualization_configs_custom_vis_template.ai_no_reasoning',
                                                )}
                                        </Text>

                                        {selectedCandidate.valid &&
                                        selectedCandidate.frontendErrors
                                            .length === 0 ? (
                                            <Text size="xs" c="green.7">
                                                {t(
                                                    'components_visualization_configs_custom_vis_template.ai_validation_passed',
                                                )}
                                            </Text>
                                        ) : (
                                            <>
                                                <Text size="xs" c="orange.8">
                                                    {t(
                                                        'components_visualization_configs_custom_vis_template.ai_validation_failed',
                                                    )}
                                                </Text>
                                                {(
                                                    selectedCandidate.errors ||
                                                    []
                                                )
                                                    .concat(
                                                        selectedCandidate.frontendErrors,
                                                    )
                                                    .slice(0, 6)
                                                    .map((error, idx) => (
                                                        <Text
                                                            key={`${error}-${idx}`}
                                                            size="11px"
                                                            c="dimmed"
                                                        >
                                                            - {error}
                                                        </Text>
                                                    ))}
                                            </>
                                        )}

                                        <Group spacing={4}>
                                            <Button
                                                variant="subtle"
                                                size="xs"
                                                compact
                                                onClick={() =>
                                                    setIsSpecPreviewOpen(true)
                                                }
                                                disabled={
                                                    !selectedCandidateSpecString
                                                }
                                            >
                                                {t(
                                                    'components_visualization_configs_custom_vis_template.view_template_json',
                                                )}
                                            </Button>
                                            <Button
                                                variant="subtle"
                                                size="xs"
                                                compact
                                                onClick={copyTemplateSpec}
                                                disabled={
                                                    !selectedCandidateSpecString
                                                }
                                            >
                                                {clipboard.copied
                                                    ? t(
                                                          'components_json_viewer_modal.copied',
                                                      )
                                                    : t(
                                                          'components_json_viewer_modal.copy',
                                                      )}
                                            </Button>
                                            <Button
                                                variant="subtle"
                                                size="xs"
                                                compact
                                                onClick={() => {
                                                    void generateAiCandidates();
                                                }}
                                                loading={isGeneratingCandidates}
                                            >
                                                {t(
                                                    'components_visualization_configs_custom_vis_template.ai_regenerate',
                                                )}
                                            </Button>
                                        </Group>
                                    </Stack>
                                ) : null}

                                {!hasValidCandidates && (
                                    <Button
                                        variant="default"
                                        size="xs"
                                        onClick={moveToMappingStep}
                                    >
                                        {t(
                                            'components_visualization_configs_custom_vis_template.ai_fallback_to_mapping',
                                        )}
                                    </Button>
                                )}
                            </>
                        )}
                    </Stack>
                ) : (
                    <Stack spacing="sm">
                        <Text size="xs" color="dimmed">
                            {t(
                                'components_visualization_configs_custom_vis_template.field_mapping_title',
                            )}
                        </Text>
                        {templateFieldRefs.length === 0 ? (
                            <Text size="sm" color="dimmed">
                                {t(
                                    'components_visualization_configs_custom_vis_template.no_template_fields_required',
                                )}
                            </Text>
                        ) : (
                            <>
                                <Group position="apart" align="center">
                                    <Text size="xs" color="dimmed">
                                        {t(
                                            'components_visualization_configs_custom_vis_template.mapping_progress',
                                            {
                                                mapped: mappedRequiredCount,
                                                total: requiredCount,
                                            },
                                        )}
                                    </Text>
                                    <Group spacing={4}>
                                        <Button
                                            variant="subtle"
                                            size="xs"
                                            compact
                                            onClick={() =>
                                                setIsSpecPreviewOpen(true)
                                            }
                                            disabled={
                                                !selectedTemplateSpecString
                                            }
                                        >
                                            {t(
                                                'components_visualization_configs_custom_vis_template.view_template_json',
                                            )}
                                        </Button>
                                        <Button
                                            variant="subtle"
                                            size="xs"
                                            compact
                                            onClick={copyTemplateSpec}
                                            disabled={
                                                !selectedTemplateSpecString
                                            }
                                        >
                                            {clipboard.copied
                                                ? t(
                                                      'components_json_viewer_modal.copied',
                                                  )
                                                : t(
                                                      'components_json_viewer_modal.copy',
                                                  )}
                                        </Button>
                                    </Group>
                                </Group>
                                {unresolvedRequiredFields.length > 0 && (
                                    <Text size="xs" c="orange.8">
                                        {t(
                                            'components_visualization_configs_custom_vis_template.field_mapping_unresolved',
                                            {
                                                count: unresolvedRequiredFields.length,
                                            },
                                        )}
                                    </Text>
                                )}
                                {unresolvedOptionalFields.length > 0 && (
                                    <Text size="xs" color="dimmed">
                                        {t(
                                            'components_visualization_configs_custom_vis_template.field_mapping_optional_unresolved',
                                            {
                                                count: unresolvedOptionalFields.length,
                                            },
                                        )}
                                    </Text>
                                )}
                                <Divider />
                                <ScrollArea h={MODAL_SCROLL_HEIGHT}>
                                    <Stack spacing="xs">
                                        {templateFieldRefs.map(
                                            (templateField) => (
                                                <Group
                                                    key={templateField.field}
                                                    align="flex-end"
                                                    grow
                                                >
                                                    <Box>
                                                        <Text
                                                            size="xs"
                                                            fw={500}
                                                        >
                                                            {
                                                                templateField.field
                                                            }
                                                        </Text>
                                                        <Text
                                                            size="11px"
                                                            color={
                                                                fieldMappings[
                                                                    templateField
                                                                        .field
                                                                ]
                                                                    ? 'dimmed'
                                                                    : templateField.required
                                                                      ? 'orange.8'
                                                                      : 'dimmed'
                                                            }
                                                        >
                                                            {fieldMappings[
                                                                templateField
                                                                    .field
                                                            ]
                                                                ? t(
                                                                      'components_visualization_configs_custom_vis_template.field_mapping_required',
                                                                  )
                                                                : templateField.required
                                                                  ? t(
                                                                        'components_visualization_configs_custom_vis_template.field_mapping_unresolved_single',
                                                                    )
                                                                  : t(
                                                                        'components_visualization_configs_custom_vis_template.field_mapping_optional',
                                                                    )}
                                                        </Text>
                                                    </Box>
                                                    <Select
                                                        searchable
                                                        clearable
                                                        data={
                                                            mappingFieldOptions
                                                        }
                                                        value={
                                                            fieldMappings[
                                                                templateField
                                                                    .field
                                                            ] ?? null
                                                        }
                                                        onChange={(value) =>
                                                            setFieldMappings(
                                                                (previous) => ({
                                                                    ...previous,
                                                                    [templateField.field]:
                                                                        value ??
                                                                        null,
                                                                }),
                                                            )
                                                        }
                                                        placeholder={t(
                                                            'components_visualization_configs_custom_vis_template.field_mapping_select_placeholder',
                                                        )}
                                                    />
                                                </Group>
                                            ),
                                        )}
                                    </Stack>
                                </ScrollArea>
                            </>
                        )}
                    </Stack>
                )}
            </MantineModal>

            <Button
                size="sm"
                variant="default"
                compact
                fz="xs"
                leftIcon={<MantineIcon icon={IconPlus} />}
                onClick={() => {
                    setOpened(true);
                    setModalStep('template');
                    setAiCandidates([]);
                    setSelectedCandidateIndex(0);
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
                        variant="default"
                        size="xs"
                        compact
                        onClick={copyTemplateSpec}
                        disabled={
                            !(
                                selectedCandidateSpecString ||
                                selectedTemplateSpecString
                            )
                        }
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
                                fontFamily:
                                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            }}
                        >
                            {selectedCandidateSpecString ||
                                selectedTemplateSpecString}
                        </Text>
                    </Box>
                </ScrollArea>
            </Modal>
        </>
    );
};
