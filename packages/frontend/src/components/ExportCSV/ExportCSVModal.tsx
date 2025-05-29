import { Button, Group, Modal, Text, type ModalProps } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import ExportCSV, { type ExportCSVProps } from '.';
import MantineIcon from '../common/MantineIcon';

type ExportCSVModalProps = ModalProps &
    ExportCSVProps & {
        onConfirm?: () => void;
    };

const ExportCSVModal: FC<ExportCSVModalProps> = ({
    projectUuid,
    onConfirm,
    totalResults,
    getCsvLink,
    ...modalProps
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconTableExport}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={600}>
                        {t('components_export_csv_modal.title')}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
            {...modalProps}
        >
            <ExportCSV
                projectUuid={projectUuid}
                totalResults={totalResults}
                getCsvLink={getCsvLink}
                isDialogBody
                renderDialogActions={({ onExport, isExporting }) => (
                    <Group
                        position="right"
                        sx={(theme) => ({
                            borderTop: `1px solid ${theme.colors.gray[4]}`,
                            bottom: 0,
                            padding: theme.spacing.md,
                        })}
                    >
                        <Button variant="outline" onClick={modalProps.onClose}>
                            {t('components_export_csv_modal.cancel')}
                        </Button>

                        <Button
                            loading={isExporting}
                            onClick={async () => {
                                await onExport();
                                onConfirm?.();
                            }}
                        >
                            {t('components_export_csv_modal.export')}
                        </Button>
                    </Group>
                )}
            />
        </Modal>
    );
};

export default ExportCSVModal;
