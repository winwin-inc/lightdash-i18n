import { getAppDisplayName } from '@lightdash/common';
import {
    Alert,
    Anchor,
    Button,
    List,
    Loader,
    Text,
} from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useDeleteApp } from '../../../features/apps/hooks/useDeleteApp';
import { useDashboardsContainingApp } from '../../../hooks/dashboard/useDashboards';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';

interface AppDeleteModalProps {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    uuid: string;
    name: string;
    onConfirm?: () => void;
}

const AppDeleteModal: FC<AppDeleteModalProps> = ({
    opened,
    onClose,
    projectUuid,
    uuid,
    name,
    onConfirm,
}) => {
    const { t } = useTranslation();
    const { mutateAsync: deleteApp, isLoading: isDeleting } = useDeleteApp();
    const { data: relatedDashboards, isInitialLoading: isLoadingDashboards } =
        useDashboardsContainingApp(
            opened ? projectUuid : undefined,
            opened ? uuid : undefined,
        );

    const handleConfirm = async () => {
        await deleteApp({ projectUuid, appUuid: uuid });
        onConfirm?.();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('components_common_modal_app_delete.title')}
            actions={
                <>
                    <Button
                        variant="default"
                        disabled={isDeleting}
                        onClick={onClose}
                    >
                        {t('components_common_modal_app_delete.cancel')}
                    </Button>
                    <Button
                        color="red"
                        loading={isDeleting}
                        disabled={isDeleting || isLoadingDashboards}
                        onClick={() => {
                            handleConfirm().catch(() => undefined);
                        }}
                    >
                        {t('components_common_modal_app_delete.delete')}
                    </Button>
                </>
            }
        >
            <Text size="sm">
                {t('components_common_modal_app_delete.tip')}
                <Text span fw={600}>
                    {getAppDisplayName(name, uuid)}
                </Text>
                {t('components_common_modal_app_delete.tip_suffix')}
            </Text>
            {isLoadingDashboards ? (
                <Loader size="sm" />
            ) : relatedDashboards && relatedDashboards.length > 0 ? (
                <Alert
                    icon={<MantineIcon icon={IconAlertCircle} />}
                    title={
                        <Text fw={600}>
                            {t('components_common_modal_app_delete.content', {
                                length: relatedDashboards.length,
                            })}
                        </Text>
                    }
                >
                    <Text size="sm" mb="xs">
                        {t('components_common_modal_app_delete.warning')}
                    </Text>
                    <List fz="sm">
                        {relatedDashboards.map((dashboard) => (
                            <List.Item key={dashboard.uuid}>
                                <Anchor
                                    component={Link}
                                    target="_blank"
                                    to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                >
                                    {dashboard.name}
                                </Anchor>
                            </List.Item>
                        ))}
                    </List>
                </Alert>
            ) : null}
        </MantineModal>
    );
};

export default AppDeleteModal;
