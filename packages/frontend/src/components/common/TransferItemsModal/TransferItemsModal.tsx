import {
    assertUnreachable,
    ResourceViewItemType,
    type ResourceViewItem,
    type SpaceSummary,
} from '@lightdash/common';
import { Alert, Box, Button, Group, LoadingOverlay, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import MantineIcon from '../MantineIcon';
import MantineModal, { type MantineModalProps } from '../MantineModal';
import SpaceCreationForm from '../SpaceSelector/SpaceCreationForm';
import SpaceSelector from '../SpaceSelector/SpaceSelector';
import { type NestableItem } from '../Tree/types';

type Props<T, U> = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    items: T;
    spaces: U;
    isLoading: boolean;
    onConfirm: (spaceUuid: string | null) => void;
};

const ItemName = ({ name }: { name: string }) => {
    return (
        <Text fw={600} component="span">
            "{name}"
        </Text>
    );
};

const TransferItemsModal = <
    R extends ResourceViewItem,
    T extends Array<R>,
    U extends Array<NestableItem & Pick<SpaceSummary, 'isPrivate' | 'access'>>,
>({
    projectUuid,
    opened,
    onClose,
    items,
    spaces,
    onConfirm,
    isLoading,
}: Props<T, U>) => {
    const { t } = useTranslation();

    const isMovingSingleItem = items.length === 1;

    const defaultSpaceUuid = useMemo(() => {
        // return space uuid only if there's a single item (i.e. not a bulk transfer)
        if (!isMovingSingleItem) return undefined;

        const item = items[0];

        switch (item.type) {
            case ResourceViewItemType.SPACE:
                return item.data.parentSpaceUuid ?? undefined;
            case ResourceViewItemType.CHART:
            case ResourceViewItemType.DASHBOARD:
                return item.data.spaceUuid;
            default:
                return assertUnreachable(item, 'Invalid item type');
        }
    }, [isMovingSingleItem, items]);

    const getItemsText = <S extends ResourceViewItem>(itemsToProcess: S[]) => {
        if (itemsToProcess.length === 1) {
            return {
                name: itemsToProcess[0].data.name,
                type: itemsToProcess[0].type,
            };
        }
        return {
            name: `${itemsToProcess.length} ${t(
                'components_common_transfer_items_modal.items',
            )}`,
            type: 'items',
        };
    };

    const singleItemType = useMemo(() => {
        if (!isMovingSingleItem) return undefined;
        return items[0].type;
    }, [isMovingSingleItem, items]);

    const allSelectedItemsAreSpaces = useMemo(
        () => items.every((i) => i.type === ResourceViewItemType.SPACE),
        [items],
    );

    const {
        selectedSpaceUuid,
        setSelectedSpaceUuid,
        isCreatingNewSpace,
        newSpaceName,
        setNewSpaceName,
        createSpaceMutation,
        handleCreateNewSpace,
        openCreateSpaceForm,
        closeCreateSpaceForm,
    } = useSpaceManagement({
        projectUuid,
        defaultSpaceUuid,
    });

    const selectedSpaceLabel = useMemo(() => {
        if (!selectedSpaceUuid) return '';
        return (
            spaces.find((space) => space.uuid === selectedSpaceUuid)?.name || ''
        );
    }, [selectedSpaceUuid, spaces]);

    const handleConfirm = useCallback(() => {
        onConfirm(selectedSpaceUuid);
    }, [selectedSpaceUuid, onConfirm]);

    const createSpace = useCallback(async () => {
        try {
            const result = await handleCreateNewSpace();
            if (result?.uuid) {
                onConfirm(result.uuid);
            }
        } catch (error) {
            console.error('Failed to create space:', error);
        }
    }, [handleCreateNewSpace, onConfirm]);

    if (items.length === 0) return null;

    return (
        <MantineModal
            title={`${t('components_common_transfer_items_modal.move')} ${
                getItemsText(items).type
            }`}
            opened={opened}
            onClose={onClose}
            size="xl"
            actions={
                <>
                    {!isCreatingNewSpace ? (
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={openCreateSpaceForm}
                            leftIcon={<MantineIcon icon={IconPlus} />}
                        >
                            {t(
                                'components_common_transfer_items_modal.new_space',
                            )}
                        </Button>
                    ) : null}

                    <Box sx={{ flexGrow: 1 }} />

                    <Group position="right">
                        <Button
                            variant="default"
                            onClick={onClose}
                            disabled={createSpaceMutation.isLoading}
                        >
                            {t('components_common_transfer_items_modal.cancel')}
                        </Button>

                        {isCreatingNewSpace ? (
                            <Button
                                loading={createSpaceMutation.isLoading}
                                disabled={newSpaceName.length === 0}
                                onClick={createSpace}
                            >
                                {t(
                                    'components_common_transfer_items_modal.create_space',
                                )}
                            </Button>
                        ) : (
                            <Button
                                disabled={
                                    !selectedSpaceUuid &&
                                    !allSelectedItemsAreSpaces
                                }
                                onClick={handleConfirm}
                            >
                                {t(
                                    'components_common_transfer_items_modal.confirm',
                                )}
                            </Button>
                        )}
                    </Group>
                </>
            }
        >
            <LoadingOverlay
                visible={createSpaceMutation.isLoading || isLoading}
            />

            {isCreatingNewSpace ? (
                <SpaceCreationForm
                    spaceName={newSpaceName}
                    onSpaceNameChange={setNewSpaceName}
                    onCancel={closeCreateSpaceForm}
                    isLoading={createSpaceMutation.isLoading}
                    parentSpaceName={selectedSpaceLabel}
                />
            ) : (
                <>
                    <Text fz="sm" fw={500}>
                        {t(
                            'components_common_transfer_items_modal.select_space',
                            { name: getItemsText(items).name },
                        )}
                    </Text>

                    <SpaceSelector
                        itemType={singleItemType}
                        projectUuid={projectUuid}
                        spaces={spaces}
                        selectedSpaceUuid={selectedSpaceUuid}
                        onSelectSpace={setSelectedSpaceUuid}
                        isLoading={createSpaceMutation.isLoading}
                        isRootSelectionEnabled={allSelectedItemsAreSpaces}
                    >
                        {!isCreatingNewSpace && selectedSpaceLabel ? (
                            <Alert color="gray" sx={{ flexShrink: 0 }}>
                                <Text fw={500}>
                                    {t(
                                        'components_common_transfer_items_modal.move',
                                    )}{' '}
                                    {getItemsText(items).name}
                                    {t(
                                        'components_common_transfer_items_modal.to',
                                    )}
                                    {!isCreatingNewSpace ? (
                                        <ItemName name={selectedSpaceLabel} />
                                    ) : (
                                        ''
                                    )}
                                </Text>
                            </Alert>
                        ) : null}
                    </SpaceSelector>
                </>
            )}
        </MantineModal>
    );
};

export default TransferItemsModal;
