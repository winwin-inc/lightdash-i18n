import {
    Alert,
    Anchor,
    Button,
    Group,
    List,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import {
    useSavedQuery,
    useSavedQueryDeleteMutation,
} from '../../../hooks/useSavedQuery';
import MantineIcon from '../MantineIcon';

interface ChartDeleteModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

const ChartDeleteModal: FC<ChartDeleteModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: chart, isInitialLoading } = useSavedQuery({ id: uuid });
    const {
        data: relatedDashboards,
        isInitialLoading: isLoadingRelatedDashboards,
    } = useDashboardsContainingChart(projectUuid, uuid);
    const { mutateAsync: deleteChart, isLoading: isDeleting } =
        useSavedQueryDeleteMutation();
    const { t } = useTranslation();

    if (
        isInitialLoading ||
        isLoadingRelatedDashboards ||
        !chart ||
        !relatedDashboards
    ) {
        return null;
    }

    const handleConfirm = async () => {
        await deleteChart(uuid);
        onConfirm?.();
    };

    return (
        <Modal
            title={
                <Title order={4}>
                    {t('components_common_modal_chart_delete.title')}
                </Title>
            }
            {...modalProps}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    {t('components_common_modal_chart_delete.tip')}
                    <Text span fw={600}>
                        "{chart.name}"
                    </Text>
                    ?
                </Text>

                {relatedDashboards.length > 0 && (
                    <>
                        <Alert
                            icon={<MantineIcon icon={IconAlertCircle} />}
                            title={
                                <Text fw={600}>
                                    {t(
                                        'components_common_modal_chart_delete.content',
                                        {
                                            length: relatedDashboards.length,
                                            text:
                                                relatedDashboards.length > 1
                                                    ? 's'
                                                    : '',
                                        },
                                    )}
                                </Text>
                            }
                        >
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
                    </>
                )}

                <Group position="right" mt="sm">
                    <Button
                        color="dark"
                        variant="outline"
                        onClick={modalProps.onClose}
                    >
                        {t('components_common_modal_chart_delete.cancel')}
                    </Button>

                    <Button
                        loading={isDeleting}
                        color="red"
                        onClick={handleConfirm}
                    >
                        {t('components_common_modal_chart_delete.delete')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default ChartDeleteModal;
