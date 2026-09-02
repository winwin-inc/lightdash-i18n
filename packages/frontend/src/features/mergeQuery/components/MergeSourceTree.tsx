import { type SummaryExplore } from '@lightdash/common';
import { Box, Button, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMemo, type Dispatch, type FC, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import ExploreTree from '../../../components/Explorer/ExploreTree';
import { type SelectedField } from '../../../components/Explorer/ExploreTree/SelectedFieldsSection';
import { ItemDetailProvider } from '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useMerge } from '../context/useMerge';

/** Field picker for a source owned by the merge editor. */
export const MergeSourceTree: FC<{
    sourceId: string;
    isChoosingExplore: boolean;
    setIsChoosingExplore: Dispatch<SetStateAction<boolean>>;
    selectedFields: SelectedField[];
    hideSelectedFields?: boolean;
}> = ({
    sourceId,
    isChoosingExplore,
    setIsChoosingExplore,
}) => {
    const { t } = useTranslation();
    const merge = useMerge();
    const projectUuid = useProjectUuid();
    const source = merge.additionalSources.find(({ id }) => id === sourceId);
    const exploresResult = useExplores(projectUuid, true);
    const { data: explore, isInitialLoading } = useExplore(
        source?.exploreName ?? undefined,
    );

    const selection = useMemo(
        () => ({
            activeFields: new Set([
                ...(source?.dimensions ?? []),
                ...(source?.metrics ?? []),
            ]),
            selectedDimensions: source?.dimensions ?? [],
        }),
        [source?.dimensions, source?.metrics],
    );

    const explores = useMemo(() => {
        if (!exploresResult.data) return [];
        return Object.values(exploresResult.data).sort((a, b) =>
            a.label.localeCompare(b.label),
        );
    }, [exploresResult.data]);

    if (!source) return null;

    const pickExplore = (selected: SummaryExplore) => {
        if (selected.name !== source.exploreName) {
            merge.setSourceExplore(source.id, selected.name);
        }
        setIsChoosingExplore(false);
    };

    if (isChoosingExplore) {
        return (
            <Stack spacing="xs" h="100%" sx={{ minHeight: 0 }}>
                <Button
                    variant="subtle"
                    size="xs"
                    compact
                    leftIcon={<MantineIcon icon={IconArrowLeft} size={13} />}
                    onClick={() => setIsChoosingExplore(false)}
                    w="fit-content"
                >
                    {t('features_mergeQuery.back_to_fields')}
                </Button>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    {exploresResult.isInitialLoading ? (
                        <Stack spacing="xs">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <Skeleton key={i} h={28} />
                            ))}
                        </Stack>
                    ) : (
                        <Stack spacing={4}>
                            {explores.map((item) => (
                                <UnstyledButton
                                    key={item.name}
                                    onClick={() => pickExplore(item)}
                                    sx={(theme) => ({
                                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                        borderRadius: theme.radius.sm,
                                        '&:hover': {
                                            backgroundColor:
                                                theme.colors.gray[0],
                                        },
                                    })}
                                >
                                    <Text size="sm">{item.label}</Text>
                                </UnstyledButton>
                            ))}
                        </Stack>
                    )}
                </Box>
            </Stack>
        );
    }

    return (
        <Stack spacing="xs" h="100%" sx={{ minHeight: 0 }}>
            <Button
                variant="subtle"
                size="xs"
                compact
                leftIcon={<MantineIcon icon={IconArrowLeft} size={13} />}
                onClick={() => setIsChoosingExplore(true)}
                w="fit-content"
            >
                {t('features_mergeQuery.change_table')}
            </Button>

            {source.exploreName && isInitialLoading && (
                <Stack spacing="xs">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} h={28} />
                    ))}
                </Stack>
            )}

            {explore && (
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <ItemDetailProvider>
                        <ExploreTree
                            explore={explore}
                            selection={selection}
                            onSelectedFieldChange={(fieldId, isDimension) =>
                                merge.toggleSourceField(
                                    source.id,
                                    fieldId,
                                    isDimension,
                                )
                            }
                        />
                    </ItemDetailProvider>
                </Box>
            )}
        </Stack>
    );
};
