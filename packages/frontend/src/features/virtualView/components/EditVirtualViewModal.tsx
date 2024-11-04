import { type Explore } from '@lightdash/common';
import {
    Button,
    Center,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { lazy, Suspense, useState, useTransition, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import useSearchParams from '../../../hooks/useSearchParams';
import { useExplorerContext } from '../../../providers/ExplorerProvider';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    activeTableName: string;
    setIsEditVirtualViewOpen: (value: boolean) => void;
    explore: Explore;
};

const SqlRunnerNewPage = lazy(() => import('../../../pages/SqlRunnerNew'));

export const EditVirtualViewModal: FC<Props> = ({
    opened,
    onClose,
    activeTableName,
    explore,
}) => {
    const { t } = useTranslation();

    const hasUnsavedChanges = !!useSearchParams('create_saved_chart_version');
    const [isPending, startTransition] = useTransition();

    const [modalStep, setModalStep] = useState<
        'unsavedChanges' | 'editVirtualView' | undefined
    >(hasUnsavedChanges ? 'unsavedChanges' : 'editVirtualView');

    const clearQuery = useExplorerContext(
        (context) => context.actions.clearQuery,
    );

    const handleClose = () => {
        if (modalStep === 'editVirtualView') {
            setModalStep(undefined);
            onClose();
        }
    };

    return (
        <Modal
            opened={opened}
            closeOnClickOutside={false}
            withCloseButton={false}
            onClose={handleClose}
            title={
                modalStep === 'unsavedChanges' ? (
                    <Group spacing="xs">
                        <MantineIcon icon={IconAlertCircle} />
                        <Text fw={500}>
                            {t('components_virtual_view.edit.title')}
                        </Text>
                    </Group>
                ) : null
            }
            size={modalStep === 'editVirtualView' ? '97vw' : 'lg'}
            yOffset={modalStep === 'editVirtualView' ? '3vh' : undefined}
            xOffset={modalStep === 'editVirtualView' ? '2vw' : undefined}
            centered={modalStep !== 'editVirtualView'}
            styles={(theme) => ({
                header: {
                    padding:
                        modalStep === 'editVirtualView' ? 0 : theme.spacing.md,
                },
                body: {
                    padding:
                        modalStep === 'editVirtualView' ? 0 : theme.spacing.md,
                },
            })}
        >
            {modalStep === 'unsavedChanges' && (
                <Stack>
                    <Text fz="sm">
                        {t('components_virtual_view.edit.content')}
                    </Text>
                    <Group position="right">
                        <Button variant="outline" onClick={onClose}>
                            {t('components_virtual_view.edit.cancel')}
                        </Button>
                        <Button
                            color="red"
                            onClick={() => {
                                startTransition(() => {
                                    clearQuery();
                                    setModalStep('editVirtualView');
                                });
                            }}
                            loading={isPending}
                        >
                            {t('components_virtual_view.edit.discard')}
                        </Button>
                    </Group>
                </Stack>
            )}
            {modalStep === 'editVirtualView' && (
                <Suspense
                    fallback={
                        <Center h="95vh" w="95vw">
                            <Stack align="center" justify="center">
                                <Loader variant="bars" />
                                <Text fw={500}>
                                    {t('components_virtual_view.edit.loading')}
                                </Text>
                            </Stack>
                        </Center>
                    }
                >
                    <SqlRunnerNewPage
                        isEditMode
                        virtualViewState={{
                            name: explore.name,
                            label: explore.label,
                            sql: explore.tables[activeTableName].sqlTable,
                            onCloseEditVirtualView: onClose,
                        }}
                    />
                </Suspense>
            )}
        </Modal>
    );
};
