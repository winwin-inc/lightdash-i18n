import { type SemanticLayerField } from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Loader,
    LoadingOverlay,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useSemanticLayerViewFields } from '../api/hooks';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import { setFields } from '../store/semanticViewerSlice';
import SidebarViewFieldsGroup from './SidebarViewFieldsGroup';

const getSearchResults = (
    fields: SemanticLayerField[],
    searchQuery: string,
) => {
    if (searchQuery === '') return fields;

    return new Fuse(fields, {
        keys: ['label', 'name', 'description'],
        ignoreLocation: true,
        threshold: 0.3,
    })
        .search(searchQuery)
        .map((result) => result.item);
};

const SidebarViewFields = () => {
    const { t } = useTranslation();
    const { showToastError } = useToaster();

    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const semanticLayerView = useAppSelector(
        (state) => state.semanticViewer.semanticLayerView,
    );
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);
    const allSelectedFieldNames = useAppSelector(selectAllSelectedFieldNames);

    const dispatch = useAppDispatch();

    const [searchQuery, setSearchQuery] = useState('');

    if (!semanticLayerView) {
        throw new Error(
            t('features_semantic_sidebar_view_fields.error.impossible_state'),
        );
    }

    const fields = useSemanticLayerViewFields(
        { projectUuid, semanticLayerView, semanticLayerQuery },
        { keepPreviousData: true },
    );

    useEffect(() => {
        if (!fields.data) return;

        dispatch(setFields(fields.data));
    }, [dispatch, fields.data]);

    const searchedFields = useMemo(() => {
        if (!fields.data) return;

        return getSearchResults(fields.data, searchQuery);
    }, [fields.data, searchQuery]);

    if (fields.isLoading) {
        return (
            <Center sx={{ flexGrow: 1 }}>
                <Loader color="gray" size="sm" />
            </Center>
        );
    }

    if (fields.isError) {
        showToastError({
            title: t(
                'features_semantic_sidebar_view_fields.error.fetch_failed',
            ),
        });

        return (
            <SuboptimalState
                title="Failed to fetch fields"
                description={
                    fields.error.error.statusCode !== 500
                        ? fields.error.error.message
                        : t('features_semantic_sidebar_view_fields.error.wrong')
                }
            />
        );
    }

    const searchedOrAllFields = searchedFields ?? fields.data;

    return fields.data.length === 0 ? (
        <SuboptimalState
            title={t(
                'features_semantic_sidebar_view_fields.error.no_fields.part_1',
            )}
            description={t(
                'features_semantic_sidebar_view_fields.error.no_fields.part_2',
            )}
        />
    ) : (
        <>
            <LoadingOverlay
                visible={fields.isFetching}
                opacity={0.5}
                loaderProps={{ color: 'gray', size: 'sm' }}
            />

            <Stack sx={{ flexGrow: 1 }}>
                <Stack
                    bg="white"
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                    }}
                >
                    <TextInput
                        size="xs"
                        type="search"
                        icon={<MantineIcon icon={IconSearch} />}
                        rightSection={
                            searchQuery ? (
                                <ActionIcon
                                    size="xs"
                                    onClick={() => setSearchQuery('')}
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        placeholder={t(
                            'features_semantic_sidebar_view_fields.search_fields',
                        )}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />

                    <SidebarViewFieldsGroup
                        containerProps={{
                            sx: { boxShadow: '0 3px 0 0 white' },
                        }}
                        groupLabel={t(
                            'features_semantic_sidebar_view_fields.selected_fields',
                        )}
                        fields={searchedOrAllFields.filter((field) =>
                            allSelectedFieldNames.includes(field.name),
                        )}
                        searchQuery={searchQuery}
                    />
                </Stack>

                <Stack>
                    <SidebarViewFieldsGroup
                        groupLabel={t(
                            'features_semantic_sidebar_view_fields.available_fields',
                        )}
                        fields={searchedOrAllFields.filter(
                            (field) =>
                                !allSelectedFieldNames.includes(field.name) &&
                                field.visible,
                        )}
                        searchQuery={searchQuery}
                    />

                    <SidebarViewFieldsGroup
                        groupLabel={t(
                            'features_semantic_sidebar_view_fields.unavailable_fields',
                        )}
                        fields={searchedOrAllFields.filter(
                            (field) =>
                                !allSelectedFieldNames.includes(field.name) &&
                                !field.visible,
                        )}
                        searchQuery={searchQuery}
                    />
                </Stack>

                {searchedFields && searchedOrAllFields.length === 0 ? (
                    <SuboptimalState
                        title={t(
                            'features_semantic_sidebar_view_fields.no_fields.part_1',
                        )}
                        description={t(
                            'features_semantic_sidebar_view_fields.no_fields.part_2',
                        )}
                    />
                ) : null}
            </Stack>
        </>
    );
};

export default SidebarViewFields;
