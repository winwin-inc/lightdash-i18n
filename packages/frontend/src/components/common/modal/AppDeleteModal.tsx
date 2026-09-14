import { getAppDisplayName } from '@lightdash/common';
import { Button, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { useDeleteApp } from '../../../features/apps/hooks/useDeleteApp';
import MantineModal from '../MantineModal';

interface AppDeleteModalProps {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    uuid: string;
    name: string;
    onConfirm?: () => void;
}

// Soft-delete health fields are Phase C — always show permanent-delete copy.
const AppDeleteModal: FC<AppDeleteModalProps> = ({
    opened,
    onClose,
    projectUuid,
    uuid,
    name,
    onConfirm,
}) => {
    const { mutateAsync: deleteApp, isLoading: isDeleting } = useDeleteApp();

    const handleConfirm = async () => {
        await deleteApp({ projectUuid, appUuid: uuid });
        onConfirm?.();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete app"
            actions={
                <Button
                    color="red"
                    loading={isDeleting}
                    disabled={isDeleting}
                    onClick={() => {
                        void handleConfirm();
                    }}
                >
                    Delete
                </Button>
            }
        >
            <Text size="sm">
                Delete{' '}
                <Text span fw={600}>
                    {getAppDisplayName(name, uuid)}
                </Text>
                ? This app and all of its versions will be permanently deleted,
                including any built artifacts in storage.
            </Text>
        </MantineModal>
    );
};

export default AppDeleteModal;
