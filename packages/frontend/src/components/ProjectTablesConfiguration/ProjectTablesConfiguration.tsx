import { subject } from '@casl/ability';
import { hasIntersection, TableSelectionType } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Collapse,
    Flex,
    Highlight,
    Loader,
    MultiSelect,
    Radio,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { z } from 'zod';

import { useExplores } from '../../hooks/useExplores';
import {
    useProjectTablesConfiguration,
    useUpdateProjectTablesConfiguration,
} from '../../hooks/useProjectTablesConfiguration';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';

const validationSchema = z.object({
    type: z.nativeEnum(TableSelectionType),
    tags: z.array(z.string()),
    names: z.array(z.string()),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = {
    projectUuid: string;
    onSuccess?: () => void;
};

const ProjectTablesConfiguration: FC<Props> = ({ projectUuid, onSuccess }) => {
    const { track } = useTracking();
    const { user } = useApp();
    const ability = useAbilityContext();
    const [isListOpen, toggleList] = useToggle(false);
    const { t } = useTranslation();
    const [search, setSearch] = useState('');

    const { data: explores, isInitialLoading: isLoadingExplores } =
        useExplores(projectUuid);

    const { data: tablesConfig, isInitialLoading: isLoadingTablesConfig } =
        useProjectTablesConfiguration(projectUuid);

    const {
        mutate: update,
        isLoading: isSaving,
        isSuccess,
    } = useUpdateProjectTablesConfiguration(projectUuid);

    const canUpdateTableConfiguration = ability.can(
        'update',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const disabled =
        isLoadingTablesConfig ||
        isSaving ||
        isLoadingExplores ||
        !canUpdateTableConfiguration;

    const form = useForm<FormValues>({
        initialValues: {
            type: TableSelectionType.ALL,
            tags: [],
            names: [],
        },
        validate: zodResolver(validationSchema),
    });

    const modelsIncluded = useMemo<string[]>(() => {
        if (!explores) {
            return [];
        }
        const typeValue = form.values.type || TableSelectionType.ALL;
        const tagsValue = form.values.tags || [];
        const namesValue = form.values.names || [];
        if (typeValue === TableSelectionType.ALL) {
            return explores.map(({ name }) => name);
        }
        if (typeValue === TableSelectionType.WITH_NAMES) {
            return namesValue;
        }
        if (
            typeValue === TableSelectionType.WITH_TAGS &&
            tagsValue.length > 0
        ) {
            return explores.reduce<string[]>(
                (acc, { name, tags }) =>
                    hasIntersection(tags || [], tagsValue)
                        ? [...acc, name]
                        : acc,
                [],
            );
        }
        return [];
    }, [form.values, explores]);

    const availableTags = useMemo<string[]>(
        () =>
            Array.from(
                (explores || []).reduce<Set<string>>((acc, explore) => {
                    (explore.tags || []).forEach((tag) => acc.add(tag));
                    return acc;
                }, new Set()),
            ),
        [explores],
    );

    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    useEffect(() => {
        if (!tablesConfig) return;

        const { type, value } = tablesConfig.tableSelection;

        const getValueBasedOnType = (selectionType: TableSelectionType) =>
            type === selectionType && value ? value : [];

        const initialValues = {
            type: type,
            tags: getValueBasedOnType(TableSelectionType.WITH_TAGS),
            names: getValueBasedOnType(TableSelectionType.WITH_NAMES),
        };

        form.setInitialValues(initialValues);
        form.setValues(initialValues);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tablesConfig]);

    useEffect(() => {
        if (isSuccess && onSuccess) {
            onSuccess();
        }
    }, [isSuccess, onSuccess]);

    const handleSubmit = form.onSubmit(async (formData) => {
        if (!form.isValid()) return;

        track({
            name: EventName.UPDATE_PROJECT_TABLES_CONFIGURATION_BUTTON_CLICKED,
        });

        let value: string[] | null = null;
        if (
            formData.type === TableSelectionType.WITH_TAGS &&
            formData.tags.length > 0
        ) {
            value = formData.tags;
        }
        if (
            formData.type === TableSelectionType.WITH_NAMES &&
            formData.names.length > 0
        ) {
            value = formData.names;
        }
        update({
            tableSelection: {
                type: formData.type,
                value,
            },
        });
    });

    return (
        <form name="project_table_configuration" onSubmit={handleSubmit}>
            <SettingsGridCard>
                <div>
                    <Title order={5}>
                        {t(
                            'components_project_tables_configuration.table_selection',
                        )}
                    </Title>
                    <Text color="gray.6" my={'xs'}>
                        {t(
                            'components_project_tables_configuration.tip.part_1',
                        )}
                        <b>{modelsIncluded.length}</b>
                        {t(
                            'components_project_tables_configuration.tip.part_2',
                        )}{' '}
                        {modelsIncluded.length > 0 && (
                            <Anchor
                                size="sm"
                                component="button"
                                onClick={toggleList}
                            >
                                (
                                {isListOpen
                                    ? t(
                                          'components_project_tables_configuration.tip.part_3',
                                      )
                                    : t(
                                          'components_project_tables_configuration.tip.part_4',
                                      )}{' '}
                                {t(
                                    'components_project_tables_configuration.tip.part_5',
                                )}
                                )
                            </Anchor>
                        )}
                    </Text>
                    <Collapse in={isListOpen}>
                        <ScrollArea h={180}>
                            {modelsIncluded.map((name) => (
                                <Text
                                    key={name}
                                    title={name}
                                    truncate
                                    color="gray.6"
                                >
                                    {name}
                                </Text>
                            ))}
                        </ScrollArea>
                    </Collapse>
                </div>

                <div>
                    <Radio.Group
                        name="type"
                        label={t(
                            'components_project_tables_configuration.radio_groups.label',
                        )}
                        withAsterisk
                        {...form.getInputProps('type')}
                    >
                        <Stack mt={'md'} spacing={'md'}>
                            <Radio
                                value={TableSelectionType.ALL}
                                label={t(
                                    'components_project_tables_configuration.radio_groups.radio_all.label',
                                )}
                                description={t(
                                    'components_project_tables_configuration.radio_groups.radio_all.description',
                                )}
                                disabled={disabled}
                            />

                            <Box>
                                <Radio
                                    value={TableSelectionType.WITH_TAGS}
                                    label={
                                        <>
                                            {t(
                                                'components_project_tables_configuration.radio_groups.radio_with_tags.label',
                                            )}{' '}
                                            <DocumentationHelpButton href="https://docs.getdbt.com/reference/resource-configs/tags#examples" />
                                        </>
                                    }
                                    description={t(
                                        'components_project_tables_configuration.radio_groups.radio_with_tags.description',
                                    )}
                                    disabled={disabled}
                                />

                                {form.values.type ===
                                    TableSelectionType.WITH_TAGS && (
                                    <MultiSelect
                                        ml={'xxl'}
                                        size={'xs'}
                                        mt={'xs'}
                                        name="tags"
                                        label={t(
                                            'components_project_tables_configuration.radio_groups.radio_with_tags.select.label',
                                        )}
                                        required
                                        data={availableTags}
                                        disabled={
                                            disabled ||
                                            availableTags.length === 0
                                        }
                                        placeholder={t(
                                            'components_project_tables_configuration.radio_groups.radio_with_tags.select.placeholder',
                                        )}
                                        searchable
                                        clearSearchOnChange={false}
                                        searchValue={search}
                                        onSearchChange={setSearch}
                                        itemComponent={({ label, ...others }) =>
                                            others.disabled ? (
                                                <Text
                                                    color="dimmed"
                                                    {...others}
                                                >
                                                    {label}
                                                </Text>
                                            ) : (
                                                <Highlight
                                                    highlight={search}
                                                    {...others}
                                                >
                                                    {label}
                                                </Highlight>
                                            )
                                        }
                                        nothingFound={
                                            isLoadingTablesConfig
                                                ? t(
                                                      'components_project_tables_configuration.radio_groups.radio_with_tags.select.nothingFound.loading',
                                                  )
                                                : t(
                                                      'components_project_tables_configuration.radio_groups.radio_with_tags.select.nothingFound.no_results',
                                                  )
                                        }
                                        rightSection={
                                            isLoadingTablesConfig ? (
                                                <Loader
                                                    size="xs"
                                                    color="gray"
                                                />
                                            ) : null
                                        }
                                        onDropdownClose={() => {
                                            handleResetSearch();
                                        }}
                                        {...form.getInputProps('tags')}
                                        error={
                                            availableTags.length === 0
                                                ? t(
                                                      'components_project_tables_configuration.radio_groups.radio_with_tags.select.error',
                                                  )
                                                : undefined
                                        }
                                    />
                                )}
                            </Box>
                            <Box>
                                <Radio
                                    value={TableSelectionType.WITH_NAMES}
                                    label={t(
                                        'components_project_tables_configuration.radio_groups.radio_with_names.label',
                                    )}
                                    description={t(
                                        'components_project_tables_configuration.radio_groups.radio_with_names.description',
                                    )}
                                    disabled={disabled}
                                />

                                {form.values.type ===
                                    TableSelectionType.WITH_NAMES && (
                                    <MultiSelect
                                        ml={'xxl'}
                                        size={'xs'}
                                        mt={'xs'}
                                        name="names"
                                        label={t(
                                            'components_project_tables_configuration.radio_groups.radio_with_names.select.label',
                                        )}
                                        required
                                        data={(explores || []).map(
                                            ({ name }) => name,
                                        )}
                                        disabled={disabled}
                                        placeholder={t(
                                            'components_project_tables_configuration.radio_groups.radio_with_names.select.placeholder',
                                        )}
                                        searchable
                                        clearSearchOnChange={false}
                                        searchValue={search}
                                        onSearchChange={setSearch}
                                        itemComponent={({ label, ...others }) =>
                                            others.disabled ? (
                                                <Text
                                                    color="dimmed"
                                                    {...others}
                                                >
                                                    {label}
                                                </Text>
                                            ) : (
                                                <Highlight
                                                    highlight={search}
                                                    {...others}
                                                >
                                                    {label}
                                                </Highlight>
                                            )
                                        }
                                        nothingFound={
                                            isLoadingTablesConfig
                                                ? t(
                                                      'components_project_tables_configuration.radio_groups.radio_with_names.select.nothingFound.loading',
                                                  )
                                                : t(
                                                      'components_project_tables_configuration.radio_groups.radio_with_names.select.nothingFound.no_results',
                                                  )
                                        }
                                        rightSection={
                                            isLoadingTablesConfig ? (
                                                <Loader
                                                    size="xs"
                                                    color="gray"
                                                />
                                            ) : null
                                        }
                                        onDropdownClose={() => {
                                            handleResetSearch();
                                        }}
                                        {...form.getInputProps('names')}
                                    />
                                )}
                            </Box>
                        </Stack>
                    </Radio.Group>

                    {canUpdateTableConfiguration && (
                        <Flex justify="flex-end" gap="sm" mt="xl">
                            {form.isDirty() && !disabled && (
                                <Button
                                    variant="outline"
                                    onClick={() => form.reset()}
                                >
                                    {t(
                                        'components_project_tables_configuration.cancel',
                                    )}
                                </Button>
                            )}

                            <Button
                                type="submit"
                                loading={isSaving}
                                disabled={disabled}
                            >
                                {t(
                                    'components_project_tables_configuration.save_changes',
                                )}
                            </Button>
                        </Flex>
                    )}
                </div>
            </SettingsGridCard>
        </form>
    );
};

export default ProjectTablesConfiguration;
