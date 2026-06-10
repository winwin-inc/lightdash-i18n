import { FeatureFlags } from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Loader,
    SegmentedControl,
    Text,
} from '@mantine/core';
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import { type IDisposable, type languages } from 'monaco-editor';
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDeepCompareEffect } from 'react-use';

import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import {
    composeCustomVisSpec,
    decomposeCustomVisSpec,
    DEFAULT_RESPONSIVE_BREAKPOINT,
    isEffectiveMobileSpec,
    type VegaSpec,
} from '../../../CustomVisualization/responsive';
import DocumentationHelpButton from '../../../DocumentationHelpButton';
import { isCustomVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { GenerateVizWithAi } from './components/CustomVisAi';
import { SelectTemplate } from './components/CustomVisTemplate';
import { type Schema } from './types/types';

type EditorTab = 'desktop' | 'mobile';

const MONACO_DEFAULT_OPTIONS: EditorProps['options'] = {
    cursorBlinking: 'smooth',
    folding: true,
    lineNumbersMinChars: 1,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    quickSuggestions: true,
    contextmenu: false,
    fixedOverflowWidgets: true,
};

const formatSpecJson = (spec: VegaSpec): string =>
    JSON.stringify(spec, null, 2);

const initVegaLazySchema = async () => {
    const vegaLiteSchema = await import(
        'vega-lite/build/vega-lite-schema.json'
    );

    return [
        {
            uri: 'https://lightdash.com/schemas/vega-lite-schema-custom.json',
            fileMatch: ['*'],
            schema: vegaLiteSchema.default,
        },
    ];
};

const loadMonaco = (monaco: Monaco, schemas: Schema[]) => {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        comments: 'warning',
        trailingCommas: 'warning',
        enableSchemaRequest: true,
        schemas,
        validate: true,
    });

    monaco.languages.json.jsonDefaults.setModeConfiguration({
        documentFormattingEdits: false,
        documentRangeFormattingEdits: false,
        completionItems: true,
        hovers: true,
        documentSymbols: true,
        tokens: true,
        colors: true,
        foldingRanges: true,
        diagnostics: true,
    });
};

const registerCustomCompletionProvider = (
    monaco: Monaco,
    language: string,
    fields: string[],
) => {
    console.debug('Loading completion provider with fields', fields);
    return monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems: (model, position) => {
            const wordUntilPosition = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: wordUntilPosition.startColumn,
                endColumn: wordUntilPosition.endColumn,
            };

            const suggestions: languages.CompletionItem[] = fields.map(
                (field) => {
                    return {
                        label: field,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: field,
                        range,
                    };
                },
            );

            return { suggestions };
        },
        triggerCharacters: ['$'],
    });
};

export const ConfigTabs: React.FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    const isCustomConfig = isCustomVisualizationConfig(visualizationConfig);

    const [isLoading, setIsLoading] = useState(true);
    const schemas = useRef<Schema[] | null>(null);
    const isInternalVisSpecUpdateRef = useRef(false);

    const { t } = useTranslation();

    const chartConfig = useMemo(
        () => (isCustomConfig ? visualizationConfig.chartConfig : undefined),
        [isCustomConfig, visualizationConfig.chartConfig],
    );

    const initFromVisSpec = useCallback((visSpec: string) => {
        try {
            const decomposed = decomposeCustomVisSpec(
                JSON.parse(visSpec) as VegaSpec,
            );
            return {
                desktopJson: formatSpecJson(decomposed.desktop),
                mobileJson: decomposed.mobile
                    ? formatSpecJson(decomposed.mobile)
                    : '',
                rewrite: decomposed.rewrite,
            };
        } catch {
            return {
                desktopJson: visSpec,
                mobileJson: '',
                rewrite: false,
            };
        }
    }, []);

    const initialVisSpec = isCustomConfig
        ? visualizationConfig.chartConfig.visSpec || ''
        : '';
    const initialEditorState = initFromVisSpec(initialVisSpec);

    const [desktopJson, setDesktopJson] = useState(
        initialEditorState.desktopJson,
    );
    const [mobileJson, setMobileJson] = useState(initialEditorState.mobileJson);
    const [rewriteEnabled, setRewriteEnabled] = useState(
        initialEditorState.rewrite,
    );

    const activeTab = chartConfig?.editorResponsiveTab ?? 'desktop';
    const setActiveTab = useCallback(
        (tab: EditorTab) => {
            chartConfig?.setEditorResponsiveTab(tab);
        },
        [chartConfig],
    );

    const completionProviderRef = useRef<IDisposable | null>(null);
    const monacoInstanceRef = useRef<Monaco | null>(null);

    const { fields } = useMemo(() => {
        return {
            fields: chartConfig?.fields,
        };
    }, [chartConfig]);

    useEffect(() => {
        if (!chartConfig?.visSpec || isInternalVisSpecUpdateRef.current) {
            isInternalVisSpecUpdateRef.current = false;
            return;
        }
        const next = initFromVisSpec(chartConfig.visSpec);
        setDesktopJson(next.desktopJson);
        setMobileJson(next.mobileJson);
        setRewriteEnabled(next.rewrite);
    }, [chartConfig?.visSpec, initFromVisSpec]);

    useDeepCompareEffect(() => {
        if (!chartConfig || !isLoading) return;

        async function initVegaAsync() {
            schemas.current = await initVegaLazySchema();
            setIsLoading(false);
        }

        void initVegaAsync();
    }, [isLoading, chartConfig]);

    useEffect(() => {
        return () => {
            if (completionProviderRef.current) {
                console.debug(
                    'Clearning Monaco completion provider on unmount',
                );
                completionProviderRef.current.dispose();
            }
        };
    }, []);

    useEffect(() => {
        if (!monacoInstanceRef.current) return;

        if (completionProviderRef.current) {
            console.debug(
                'Refreshing Monaco completion provider with new fields',
            );
            completionProviderRef.current.dispose();
        }
        if (fields)
            completionProviderRef.current = registerCustomCompletionProvider(
                monacoInstanceRef.current,
                'json',
                fields,
            );
    }, [fields]);

    const composeAndSetVisSpec = useCallback(() => {
        if (isLoading || !chartConfig) return;

        try {
            const desktop = JSON.parse(desktopJson) as VegaSpec;
            const parsedMobile =
                mobileJson.trim() !== ''
                    ? (JSON.parse(mobileJson) as VegaSpec)
                    : null;
            const mobile = isEffectiveMobileSpec(parsedMobile)
                ? parsedMobile
                : null;

            const composed = composeCustomVisSpec({
                desktop,
                mobile,
                breakpoint: DEFAULT_RESPONSIVE_BREAKPOINT,
                rewrite: rewriteEnabled || desktop.rewrite === true,
            });

            isInternalVisSpecUpdateRef.current = true;
            chartConfig.setVisSpec(formatSpecJson(composed));
        } catch {
            // Invalid JSON while typing — skip compose until valid
        }
    }, [isLoading, chartConfig, desktopJson, mobileJson, rewriteEnabled]);

    useEffect(() => {
        composeAndSetVisSpec();
    }, [composeAndSetVisSpec]);

    const [monacoOptions, setMonacoOptions] = useState<
        EditorProps['options'] | undefined
    >();

    const isAiEnabled = useFeatureFlagEnabled(FeatureFlags.AiCustomViz);
    useDeepCompareEffect(() => {
        const containerId = 'monaco-overflow-container';
        let container = document.getElementById(containerId);
        if (!container) {
            const wrapper = document.createElement('div');
            wrapper.className = 'monaco-editor';
            container = document.createElement('div');
            container.id = containerId;
            wrapper.appendChild(container);
            document.getElementById('root')?.appendChild(wrapper);
        }
        setMonacoOptions({
            ...MONACO_DEFAULT_OPTIONS,
            overflowWidgetsDomNode: container,
        });
    }, [monacoOptions]);

    const { itemsMap } = useVisualizationContext();

    const setDesktopEditorConfig = useCallback(
        (config: string) => {
            setActiveTab('desktop');
            setDesktopJson(config);
        },
        [setActiveTab],
    );

    const editorValue = activeTab === 'desktop' ? desktopJson : mobileJson;

    const setEditorValue = useCallback(
        (value: string) => {
            if (activeTab === 'desktop') {
                setDesktopJson(value);
            } else {
                setMobileJson(value);
            }
        },
        [activeTab],
    );

    if (!isCustomConfig) return null;

    if (!monacoOptions || isLoading) {
        return <Loader color="gray" size="xs" />;
    }

    const { series } = visualizationConfig.chartConfig;

    const isEditorEmpty = (editorValue || '').length === 0;

    return (
        <>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>
                            <Flex justify="space-between" gap="xs">
                                <Text>Vega-Lite JSON</Text>
                                <DocumentationHelpButton
                                    pos="relative"
                                    top="2px"
                                    href="https://docs.lightdash.com/references/custom-charts#custom-charts"
                                />
                            </Flex>
                        </Config.Heading>

                        <Flex
                            align="center"
                            justify="space-between"
                            wrap="wrap"
                            gap="md"
                            mb="xs"
                        >
                            <Button.Group style={{ flexShrink: 0 }}>
                                <SelectTemplate
                                    itemsMap={itemsMap}
                                    isCustomConfig={isCustomConfig}
                                    isEditorEmpty={isEditorEmpty}
                                    setEditorConfig={setDesktopEditorConfig}
                                />

                                {isAiEnabled && (
                                    <GenerateVizWithAi
                                        itemsMap={itemsMap}
                                        sampleResults={series.slice(0, 3)}
                                        setEditorConfig={setDesktopEditorConfig}
                                        editorConfig={desktopJson}
                                    />
                                )}
                            </Button.Group>

                            <SegmentedControl
                                size="xs"
                                style={{ flexShrink: 0 }}
                                value={activeTab}
                                onChange={(value) =>
                                    setActiveTab(value as EditorTab)
                                }
                                data={[
                                    {
                                        label: t(
                                            'components_visualization_configs_custom_vis.responsive.desktop',
                                        ),
                                        value: 'desktop',
                                    },
                                    {
                                        label: t(
                                            'components_visualization_configs_custom_vis.responsive.mobile',
                                        ),
                                        value: 'mobile',
                                    },
                                ]}
                            />
                        </Flex>
                    </Config.Group>
                </Config.Section>
            </Config>
            <Group
                h="calc(100vh - 300px)"
                align="top"
                mt="4px"
                sx={{
                    borderTop: '0.125rem solid #dee2e6',
                }}
            >
                {isEditorEmpty ? (
                    <Text
                        pos="absolute"
                        w="330px"
                        color="gray.5"
                        sx={{
                            pointerEvents: 'none',
                            zIndex: 100,
                            fontFamily: 'monospace',
                            marginLeft: '35px',
                            fontSize: '12px',
                            lineHeight: '19px',
                            letterSpacing: '0px',
                        }}
                    >
                        {t(
                            'components_visualization_configs_custom_vis.placeholder',
                        )}
                    </Text>
                ) : null}

                <Editor
                    key={activeTab}
                    loading={<Loader color="gray" size="xs" />}
                    beforeMount={(monaco) => {
                        loadMonaco(monaco, schemas.current!);
                        monacoInstanceRef.current = monaco;

                        if (completionProviderRef.current) {
                            console.debug(
                                'Clearing Monaco completion provider on beforeMount',
                                completionProviderRef.current,
                            );
                            completionProviderRef.current.dispose();
                        }

                        if (fields)
                            completionProviderRef.current =
                                registerCustomCompletionProvider(
                                    monaco,
                                    'json',
                                    fields,
                                );
                    }}
                    defaultLanguage="json"
                    options={monacoOptions}
                    value={editorValue}
                    onChange={(config) => {
                        setEditorValue(config ?? '');
                    }}
                />
            </Group>
        </>
    );
});
