import {
    getItemLabel,
    getItemLabelWithoutTableName,
    isDimension,
    isMetric,
    type MetricQuery,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Box,
    Button,
    Group,
    Image,
    Loader,
    Modal,
    MultiSelect,
    ScrollArea,
    Select,
    Stack,
    Text,
    Textarea,
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
    isArcPieSpec,
    validateGeneratedVegaSpec,
} from '../utils/validateGeneratedVegaSpec';
import { CandidateVegaPreview } from './CandidateVegaPreview';

type CurrentQueryField = {
    fieldId: string;
    label: string;
    aliases?: string[];
    isSelected?: boolean;
    fieldKind?: 'metric' | 'dimension' | 'unknown';
};

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
type ModalStep = 'template' | 'ai';
type CandidateWithValidation =
    GenerateChartTemplateCandidatesResponse['candidates'][number] & {
        normalizedSpec: Record<string, unknown>;
        frontendErrors: string[];
    };
type GeneratedSelectionMeta =
    GenerateChartTemplateCandidatesResponse['selectionMeta'];

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
    const [aiCandidates, setAiCandidates] = useState<CandidateWithValidation[]>(
        [],
    );
    const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
    const [compatibilityTips, setCompatibilityTips] = useState<{
        level: string;
        reasons: string[];
        suggestions: string[];
    } | null>(null);
    const [selectionMetaTips, setSelectionMetaTips] =
        useState<GeneratedSelectionMeta>(null);
    const [regenerateDimensions, setRegenerateDimensions] = useState<string[]>(
        [],
    );
    const [regenerateMetrics, setRegenerateMetrics] = useState<string[]>([]);
    const [regenerateUserPrompt, setRegenerateUserPrompt] = useState('');
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

    const selectedTemplateSpec = useMemo(
        () => getTemplateSpec(selectedTemplate),
        [selectedTemplate],
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

    const getFieldDisplayName = useCallback(
        (fieldId: string): string => {
            const item = itemsMap?.[fieldId];
            return item ? getItemLabelWithoutTableName(item) : fieldId;
        },
        [itemsMap],
    );
    const formatFieldList = useCallback(
        (fieldIds: string[]): string[] =>
            fieldIds.map((fieldId) => getFieldDisplayName(fieldId)),
        [getFieldDisplayName],
    );
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
            setCompatibilityTips(null);
            setSelectionMetaTips(null);
            setAiCandidates([]);
            setSelectedCandidateIndex(0);
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
        if (!opened || selectedChartType === 'all') return;

        const hasSelectedChartType = templates.some(
            (template) => template.chart_type === selectedChartType,
        );
        if (!hasSelectedChartType) {
            updateSelectedChartType('all');
        }
    }, [opened, selectedChartType, templates, updateSelectedChartType]);

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

    const syncRegenerateFromExplore = useCallback(() => {
        setRegenerateDimensions(selectedDimensions);
        setRegenerateMetrics(selectedMetrics);
    }, [selectedDimensions, selectedMetrics]);

    const syncRegenerateFromSelectionMeta = useCallback(
        (meta: GeneratedSelectionMeta | null) => {
            if (!meta) return;
            if (meta.chosenDimensions.length > 0) {
                setRegenerateDimensions(meta.chosenDimensions);
            }
            if (meta.chosenMetrics.length > 0) {
                setRegenerateMetrics(meta.chosenMetrics);
            }
        },
        [],
    );

    useEffect(() => {
        if (opened) {
            syncRegenerateFromExplore();
        }
    }, [opened, syncRegenerateFromExplore]);

    const dimensionFieldOptions = useMemo(
        () =>
            currentQueryFields
                .filter((field) => field.fieldKind === 'dimension')
                .map((field) => ({
                    value: field.fieldId,
                    label: field.label,
                })),
        [currentQueryFields],
    );

    const metricFieldOptions = useMemo(
        () =>
            currentQueryFields
                .filter((field) => field.fieldKind === 'metric')
                .map((field) => ({
                    value: field.fieldId,
                    label: field.label,
                })),
        [currentQueryFields],
    );

    const isPieTemplate = useMemo(() => {
        const chartType = selectedTemplate?.chart_type?.toLowerCase() || '';
        return chartType.includes('pie') || chartType.includes('饼');
    }, [selectedTemplate?.chart_type]);

    const regenerateConfigHints = useMemo(() => {
        const hints: string[] = [];
        if (compatibilityTips?.suggestions.length) {
            hints.push(...compatibilityTips.suggestions);
        }
        if (compatibilityTips?.reasons.length) {
            hints.push(...compatibilityTips.reasons);
        }
        return hints;
    }, [compatibilityTips]);

    const selectedTemplateSpecString = useMemo(() => {
        if (!selectedTemplateSpec) return '';
        return JSON.stringify(selectedTemplateSpec, null, 2);
    }, [selectedTemplateSpec]);
    const selectedCandidate = aiCandidates[selectedCandidateIndex];
    const selectedCandidatePreview = useMemo(() => {
        if (!selectedCandidate?.spec) return null;
        return validateGeneratedVegaSpec(
            selectedCandidate.spec,
            availableFieldIds,
            {
                selectedDimensions: regenerateDimensions,
                selectedMetrics: regenerateMetrics,
                baselineDimensions: selectionMetaTips?.chosenDimensions ?? [],
                baselineMetrics: selectionMetaTips?.chosenMetrics ?? [],
            },
        );
    }, [
        selectedCandidate?.spec,
        regenerateDimensions,
        regenerateMetrics,
        availableFieldIds,
        selectionMetaTips,
    ]);
    const selectedSpecSupportsFieldRemap = useMemo(() => {
        if (!selectedCandidate?.spec) return false;
        if (isArcPieSpec(selectedCandidate.spec)) return true;
        return (
            (selectionMetaTips?.chosenDimensions.length ?? 0) > 0 ||
            (selectionMetaTips?.chosenMetrics.length ?? 0) > 0
        );
    }, [selectedCandidate?.spec, selectionMetaTips]);
    const previewValidationPassed = useMemo(() => {
        if (!selectedCandidate?.valid) return false;
        return selectedCandidatePreview?.isValid ?? false;
    }, [selectedCandidate?.valid, selectedCandidatePreview?.isValid]);
    const previewDerivedErrors = useMemo(
        () => selectedCandidatePreview?.errors ?? [],
        [selectedCandidatePreview?.errors],
    );
    const selectedCandidateSpecString = useMemo(() => {
        if (!selectedCandidatePreview?.normalizedSpec) return '';
        return JSON.stringify(selectedCandidatePreview.normalizedSpec, null, 2);
    }, [selectedCandidatePreview?.normalizedSpec]);
    const selectedTemplateDisplayName = useMemo(() => {
        const rawTemplateName = selectedTemplate?.example_name;
        if (!rawTemplateName) {
            return selectedTemplateId ? `模板 ${selectedTemplateId}` : '模板';
        }

        const matched = rawTemplateName.match(/^(.*?)\((.+)\)$/);
        if (!matched) {
            return rawTemplateName;
        }

        const [, technicalName, chineseName] = matched;
        return chineseName?.trim() || technicalName?.trim() || rawTemplateName;
    }, [selectedTemplate, selectedTemplateId]);
    const selectedCandidateReasoningText = useMemo(() => {
        if (!selectedCandidate?.reasoning) {
            return t(
                'components_visualization_configs_custom_vis_template.ai_no_reasoning',
            );
        }

        return selectedCandidate.reasoning.replace(
            /基于模板\s*\d+\s*规则映射生成/g,
            `基于模板「${selectedTemplateDisplayName}」规则映射生成`,
        );
    }, [selectedCandidate, selectedTemplateDisplayName, t]);
    const applyAiCandidate = useCallback(() => {
        if (!selectedCandidate || !previewValidationPassed) {
            return;
        }
        if (!selectedCandidatePreview?.normalizedSpec) {
            return;
        }
        if (selectedTemplateId) {
            rememberSelectedTemplateId(selectedTemplateId);
        }

        setEditorConfig(
            JSON.stringify(selectedCandidatePreview.normalizedSpec, null, 2),
        );
        setOpened(false);
        setModalStep('template');
    }, [
        selectedCandidate,
        previewValidationPassed,
        selectedCandidatePreview?.normalizedSpec,
        selectedTemplateId,
        rememberSelectedTemplateId,
        setEditorConfig,
    ]);

    const generateAiCandidates = useCallback(async () => {
        if (!selectedTemplateId) return;
        rememberSelectedTemplateId(selectedTemplateId);

        setCompatibilityTips(null);
        setSelectionMetaTips(null);
        const response = await generateCandidates({
            templateId: selectedTemplateId,
            payload: {
                fields: currentQueryFields.map((field) => ({
                    fieldId: field.fieldId,
                    label: field.label,
                    fieldKind: field.fieldKind || 'unknown',
                    isSelected: field.isSelected,
                })),
                selectedDimensions: regenerateDimensions,
                selectedMetrics: regenerateMetrics,
                userPrompt: regenerateUserPrompt.trim() || undefined,
            },
        });

        if (!response) return;

        if (!response.success) {
            const compatibility = response.compatibility || {
                level: 'warning',
                reasons: [],
                suggestions: [],
            };
            setCompatibilityTips({
                level: compatibility.level,
                reasons:
                    compatibility.reasons.length > 0
                        ? compatibility.reasons
                        : response.msg
                          ? [response.msg]
                          : [],
                suggestions: compatibility.suggestions || [],
            });
            setSelectionMetaTips(response.selectionMeta);
            syncRegenerateFromSelectionMeta(response.selectionMeta);
            if (modalStep === 'template') {
                setAiCandidates([]);
                setSelectedCandidateIndex(0);
            }
            return;
        }

        if (!response.renderable || response.candidates.length === 0) {
            const compatibility = response.compatibility || {
                level: 'warning',
                reasons: [],
                suggestions: [],
            };
            setCompatibilityTips({
                level: compatibility.level,
                reasons: compatibility.reasons || [],
                suggestions: compatibility.suggestions || [],
            });
            setSelectionMetaTips(response.selectionMeta);
            syncRegenerateFromSelectionMeta(response.selectionMeta);
            if (modalStep === 'template') {
                setAiCandidates([]);
                setSelectedCandidateIndex(0);
            }
            return;
        }

        const candidates = (response?.candidates || []).map((candidate) => {
            const validation = validateGeneratedVegaSpec(
                candidate.spec,
                availableFieldIds,
                {
                    selectedDimensions: regenerateDimensions,
                    selectedMetrics: regenerateMetrics,
                },
            );
            return {
                ...candidate,
                normalizedSpec: validation.normalizedSpec,
                frontendErrors: validation.errors,
            };
        });

        setAiCandidates(candidates);
        setSelectedCandidateIndex(0);
        setSelectionMetaTips(response.selectionMeta);
        syncRegenerateFromSelectionMeta(response.selectionMeta);
        setRegenerateUserPrompt('');
        setModalStep('ai');
    }, [
        selectedTemplateId,
        generateCandidates,
        currentQueryFields,
        regenerateDimensions,
        regenerateMetrics,
        regenerateUserPrompt,
        availableFieldIds,
        rememberSelectedTemplateId,
        syncRegenerateFromSelectionMeta,
        modalStep,
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
                    if (isGeneratingCandidates) return;
                    setOpened(false);
                    setModalStep('template');
                    setAiCandidates([]);
                    setSelectedCandidateIndex(0);
                    setCompatibilityTips(null);
                    setSelectionMetaTips(null);
                    setRegenerateUserPrompt('');
                    syncRegenerateFromExplore();
                }}
                title={t(
                    modalStep === 'template'
                        ? 'components_visualization_configs_custom_vis_template.insert_template'
                        : 'components_visualization_configs_custom_vis_template.ai_candidates_title',
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
                            disabled={isGeneratingCandidates}
                            onClick={() => {
                                if (modalStep === 'ai') {
                                    setModalStep('template');
                                    return;
                                }
                                setOpened(false);
                                setModalStep('template');
                                setAiCandidates([]);
                                setSelectedCandidateIndex(0);
                                setCompatibilityTips(null);
                                setSelectionMetaTips(null);
                                setRegenerateUserPrompt('');
                                syncRegenerateFromExplore();
                            }}
                        >
                            {modalStep === 'template'
                                ? t(
                                      'components_visualization_configs_custom_vis_template.cancel',
                                  )
                                : t(
                                      'components_visualization_configs_custom_vis_template.ai_back_step',
                                  )}
                        </Button>
                        <Button
                            onClick={
                                modalStep === 'template'
                                    ? () => {
                                          void generateAiCandidates();
                                      }
                                    : applyAiCandidate
                            }
                            disabled={
                                modalStep === 'template'
                                    ? !selectedTemplateSpec ||
                                      isGeneratingCandidates
                                    : !selectedCandidate ||
                                      !previewValidationPassed ||
                                      isGeneratingCandidates
                            }
                            loading={
                                modalStep === 'template' &&
                                isGeneratingCandidates
                            }
                        >
                            {modalStep === 'template'
                                ? t(
                                      isGeneratingCandidates
                                          ? 'components_visualization_configs_custom_vis_template.ai_generating'
                                          : 'components_visualization_configs_custom_vis_template.ai_generate_candidates',
                                  )
                                : t(
                                      'components_visualization_configs_custom_vis_template.ai_apply_selected_candidate',
                                  )}
                        </Button>
                    </>
                }
            >
                <Box pos="relative">
                    {modalStep === 'template' ? (
                        <Stack spacing="sm">
                            {isGeneratingCandidates ? (
                                <Group spacing={6}>
                                    <Loader size="xs" color="blue" />
                                    <Text size="xs" c="dimmed">
                                        {t(
                                            'components_visualization_configs_custom_vis_template.ai_generating',
                                        )}
                                    </Text>
                                </Group>
                            ) : null}
                            <Text size="xs" color="dimmed">
                                {t(
                                    'components_visualization_configs_custom_vis_template.selecting_new_template_will_reset_the_config',
                                )}
                            </Text>
                            {compatibilityTips ? (
                                <Alert
                                    color={
                                        compatibilityTips.level === 'good'
                                            ? 'green'
                                            : 'yellow'
                                    }
                                    variant="light"
                                    title={t(
                                        'components_visualization_configs_custom_vis_template.ai_validation_failed',
                                    )}
                                    p="sm"
                                >
                                    <Box
                                        sx={{
                                            maxHeight: 96,
                                            overflowY: 'auto',
                                        }}
                                    >
                                        <Stack spacing={4}>
                                            {compatibilityTips.reasons.map(
                                                (reason, idx) => (
                                                    <Text
                                                        key={`compatibility-reason-${idx}`}
                                                        size="11px"
                                                        c="dimmed"
                                                    >
                                                        - {reason}
                                                    </Text>
                                                ),
                                            )}
                                            {compatibilityTips.suggestions.map(
                                                (suggestion, idx) => (
                                                    <Text
                                                        key={`compatibility-suggestion-${idx}`}
                                                        size="11px"
                                                        c="dimmed"
                                                    >
                                                        - {suggestion}
                                                    </Text>
                                                ),
                                            )}
                                            {compatibilityTips.reasons
                                                .length === 0 &&
                                            compatibilityTips.suggestions
                                                .length === 0 ? (
                                                <Text size="11px" c="dimmed">
                                                    {t(
                                                        'components_visualization_configs_custom_vis_template.ai_no_candidates',
                                                    )}
                                                </Text>
                                            ) : null}
                                        </Stack>
                                    </Box>
                                </Alert>
                            ) : null}
                            <Select
                                size="xs"
                                value={selectedChartType}
                                disabled={isGeneratingCandidates}
                                onChange={(value) =>
                                    updateSelectedChartType(value || 'all')
                                }
                                data={chartTypeOptions}
                            />

                            <div
                                style={{
                                    display: 'block',
                                }}
                            >
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
                                            filteredTemplates.map(
                                                (template) => {
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
                                                            onClick={() => {
                                                                if (
                                                                    isGeneratingCandidates
                                                                )
                                                                    return;
                                                                selectTemplateId(
                                                                    templateId,
                                                                );
                                                            }}
                                                            sx={(theme) => ({
                                                                minHeight: 58,
                                                                borderRadius:
                                                                    theme.radius
                                                                        .sm,
                                                                border: `1px solid ${
                                                                    selected
                                                                        ? theme
                                                                              .colors
                                                                              .blue[5]
                                                                        : theme
                                                                              .colors
                                                                              .gray[3]
                                                                }`,
                                                                backgroundColor:
                                                                    selected
                                                                        ? theme
                                                                              .colors
                                                                              .blue[0]
                                                                        : theme.white,
                                                                padding: 8,
                                                                cursor: isGeneratingCandidates
                                                                    ? 'default'
                                                                    : 'pointer',
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
                                                                        width={
                                                                            52
                                                                        }
                                                                        height={
                                                                            52
                                                                        }
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
                                                                        display:
                                                                            'flex',
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
                                                                        {
                                                                            primaryName
                                                                        }
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
                                                                        disabled={
                                                                            isGeneratingCandidates
                                                                        }
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
                                                                        disabled={
                                                                            isGeneratingCandidates
                                                                        }
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
                                                },
                                            )
                                        )}
                                    </Stack>
                                </ScrollArea>
                            </div>
                        </Stack>
                    ) : (
                        <ScrollArea {...MODAL_SCROLL_AREA_PROPS}>
                            <Stack
                                spacing="sm"
                                sx={{
                                    maxWidth: '100%',
                                    overflowX: 'hidden',
                                }}
                            >
                                {isGeneratingCandidates ? (
                                    <Group spacing={6}>
                                        <Loader size="xs" color="blue" />
                                        <Text size="xs" c="dimmed">
                                            {t(
                                                'components_visualization_configs_custom_vis_template.ai_generating',
                                            )}
                                        </Text>
                                    </Group>
                                ) : null}
                                <Stack spacing="sm">
                                    {aiCandidates.length > 1 ? (
                                        <Group spacing={6}>
                                            {aiCandidates.map(
                                                (candidate, index) => {
                                                    const isValid =
                                                        candidate.valid;
                                                    const isSelected =
                                                        index ===
                                                        selectedCandidateIndex;
                                                    return (
                                                        <Badge
                                                            key={`${candidate.strategy}-${index}`}
                                                            size="sm"
                                                            radius="sm"
                                                            variant={
                                                                isSelected
                                                                    ? 'filled'
                                                                    : 'light'
                                                            }
                                                            color={
                                                                isValid
                                                                    ? 'blue'
                                                                    : 'gray'
                                                            }
                                                            sx={{
                                                                cursor: isGeneratingCandidates
                                                                    ? 'default'
                                                                    : 'pointer',
                                                                userSelect:
                                                                    'none',
                                                            }}
                                                            onClick={() =>
                                                                !isGeneratingCandidates
                                                                    ? setSelectedCandidateIndex(
                                                                          index,
                                                                      )
                                                                    : undefined
                                                            }
                                                        >
                                                            {t(
                                                                `components_visualization_configs_custom_vis_template.ai_strategy_${candidate.strategy}`,
                                                            )}
                                                        </Badge>
                                                    );
                                                },
                                            )}
                                        </Group>
                                    ) : null}
                                    {selectedCandidate ? (
                                        <Stack spacing={4}>
                                            <Group
                                                spacing={6}
                                                align="flex-start"
                                                sx={{
                                                    flexWrap: 'wrap',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <Text
                                                    size="xs"
                                                    c={
                                                        previewValidationPassed
                                                            ? 'green.7'
                                                            : 'orange.8'
                                                    }
                                                    fw={500}
                                                    sx={{ flexShrink: 0 }}
                                                >
                                                    {t(
                                                        previewValidationPassed
                                                            ? 'components_visualization_configs_custom_vis_template.ai_validation_passed'
                                                            : 'components_visualization_configs_custom_vis_template.ai_validation_failed',
                                                    )}
                                                </Text>
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    lineClamp={2}
                                                    sx={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    {
                                                        selectedCandidateReasoningText
                                                    }
                                                </Text>
                                            </Group>
                                            {!previewValidationPassed
                                                ? [
                                                      ...(selectedCandidate.errors ||
                                                          []),
                                                      ...previewDerivedErrors,
                                                      ...selectedCandidate.frontendErrors,
                                                  ]
                                                      .filter(
                                                          (error, idx, arr) =>
                                                              arr.indexOf(
                                                                  error,
                                                              ) === idx,
                                                      )
                                                      .slice(0, 6)
                                                      .map((error, idx) => (
                                                          <Text
                                                              key={`preview-error-${idx}`}
                                                              size="11px"
                                                              c="dimmed"
                                                          >
                                                              - {error}
                                                          </Text>
                                                      ))
                                                : null}
                                        </Stack>
                                    ) : null}
                                    {regenerateDimensions.length > 0 ||
                                    regenerateMetrics.length > 0 ? (
                                        <Group
                                            spacing="md"
                                            align="center"
                                            sx={{
                                                flexWrap: 'wrap',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {regenerateDimensions.length > 0 ? (
                                                <Text size="xs" lh={1.5}>
                                                    <Text
                                                        component="span"
                                                        c="dimmed"
                                                    >
                                                        {t(
                                                            'components_visualization_configs_custom_vis_template.ai_preview_active_dimensions',
                                                        )}
                                                        ：
                                                    </Text>
                                                    {formatFieldList(
                                                        regenerateDimensions,
                                                    ).join('、')}
                                                </Text>
                                            ) : null}
                                            {regenerateMetrics.length > 0 ? (
                                                <Text size="xs" lh={1.5}>
                                                    <Text
                                                        component="span"
                                                        c="dimmed"
                                                    >
                                                        {t(
                                                            'components_visualization_configs_custom_vis_template.ai_preview_active_metrics',
                                                        )}
                                                        ：
                                                    </Text>
                                                    {formatFieldList(
                                                        regenerateMetrics,
                                                    ).join('、')}
                                                </Text>
                                            ) : null}
                                        </Group>
                                    ) : null}
                                    {selectedCandidatePreview?.normalizedSpec ? (
                                        <CandidateVegaPreview
                                            spec={
                                                selectedCandidatePreview.normalizedSpec
                                            }
                                            fieldIds={
                                                returnedFieldIds.length > 0
                                                    ? returnedFieldIds
                                                    : selectedFieldIds
                                            }
                                            isLoading={isGeneratingCandidates}
                                            previewKey={`${selectedCandidateIndex}-${selectedCandidate.strategy}-${regenerateDimensions.join(',')}-${regenerateMetrics.join(',')}-${selectedCandidatePreview.isValid}`}
                                        />
                                    ) : null}
                                    {selectedCandidate ? (
                                        <Group spacing={4}>
                                            <Button
                                                variant="light"
                                                color="gray"
                                                size="sm"
                                                fz="xs"
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
                                                variant="light"
                                                color="gray"
                                                size="sm"
                                                fz="xs"
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
                                        </Group>
                                    ) : null}
                                    {regenerateConfigHints.length > 0 ? (
                                        <Alert
                                            color={
                                                compatibilityTips?.level ===
                                                'good'
                                                    ? 'green'
                                                    : 'yellow'
                                            }
                                            variant="light"
                                            p="sm"
                                        >
                                            <Stack spacing={4}>
                                                {regenerateConfigHints.map(
                                                    (hint, idx) => (
                                                        <Text
                                                            key={`regenerate-hint-${idx}`}
                                                            size="11px"
                                                            c="dimmed"
                                                        >
                                                            - {hint}
                                                        </Text>
                                                    ),
                                                )}
                                            </Stack>
                                        </Alert>
                                    ) : null}
                                    <Box
                                        sx={(theme) => ({
                                            border: `1px solid ${theme.colors.gray[3]}`,
                                            borderRadius: theme.radius.sm,
                                            padding: theme.spacing.sm,
                                            backgroundColor:
                                                theme.colors.gray[0],
                                        })}
                                    >
                                        <Stack spacing="sm">
                                            <Text size="sm" fw={600}>
                                                {t(
                                                    'components_visualization_configs_custom_vis_template.ai_adjust_section_title',
                                                )}
                                            </Text>
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                lh={1.45}
                                                sx={{
                                                    wordBreak: 'break-word',
                                                }}
                                            >
                                                {t(
                                                    'components_visualization_configs_custom_vis_template.ai_adjust_section_hint',
                                                )}
                                                {!selectedSpecSupportsFieldRemap
                                                    ? ` · ${t(
                                                          'components_visualization_configs_custom_vis_template.ai_field_preview_unsupported_hint',
                                                      )}`
                                                    : null}
                                            </Text>
                                            <MultiSelect
                                                data={dimensionFieldOptions}
                                                value={regenerateDimensions}
                                                onChange={
                                                    setRegenerateDimensions
                                                }
                                                label={t(
                                                    isPieTemplate
                                                        ? 'components_visualization_configs_custom_vis_template.ai_regenerate_dimensions_pie'
                                                        : 'components_visualization_configs_custom_vis_template.ai_adjust_dimensions',
                                                )}
                                                placeholder={t(
                                                    'components_visualization_configs_custom_vis_template.ai_regenerate_dimensions',
                                                )}
                                                searchable
                                                clearable
                                                disabled={
                                                    isGeneratingCandidates
                                                }
                                                maxDropdownHeight={200}
                                            />
                                            <MultiSelect
                                                data={metricFieldOptions}
                                                value={regenerateMetrics}
                                                onChange={setRegenerateMetrics}
                                                label={t(
                                                    isPieTemplate
                                                        ? 'components_visualization_configs_custom_vis_template.ai_regenerate_metrics_pie'
                                                        : 'components_visualization_configs_custom_vis_template.ai_adjust_metrics',
                                                )}
                                                placeholder={t(
                                                    'components_visualization_configs_custom_vis_template.ai_regenerate_metrics',
                                                )}
                                                searchable
                                                clearable
                                                disabled={
                                                    isGeneratingCandidates
                                                }
                                                maxDropdownHeight={200}
                                            />
                                            <Textarea
                                                label={t(
                                                    'components_visualization_configs_custom_vis_template.ai_adjust_prompt',
                                                )}
                                                placeholder={t(
                                                    'components_visualization_configs_custom_vis_template.ai_regenerate_hint_placeholder',
                                                )}
                                                value={regenerateUserPrompt}
                                                onChange={(event) =>
                                                    setRegenerateUserPrompt(
                                                        event.currentTarget
                                                            .value,
                                                    )
                                                }
                                                minRows={2}
                                                autosize
                                                disabled={
                                                    isGeneratingCandidates
                                                }
                                            />
                                            <Group position="right">
                                                <Button
                                                    variant="filled"
                                                    color="blue"
                                                    size="sm"
                                                    onClick={() => {
                                                        void generateAiCandidates();
                                                    }}
                                                    disabled={
                                                        isGeneratingCandidates ||
                                                        !regenerateUserPrompt.trim()
                                                    }
                                                    loading={
                                                        isGeneratingCandidates
                                                    }
                                                >
                                                    {t(
                                                        'components_visualization_configs_custom_vis_template.ai_regenerate_with_ai',
                                                    )}
                                                </Button>
                                            </Group>
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Stack>
                        </ScrollArea>
                    )}
                </Box>
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
                        variant="light"
                        color="blue"
                        size="sm"
                        fz="xs"
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
