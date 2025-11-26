import { Button, Group, Modal, Text } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import ExportResults, { type ExportResultsProps } from '../ExportResults';
import MantineIcon from '../common/MantineIcon';

interface ExportDataModalProps extends ExportResultsProps {
    isOpen: boolean;
    onClose: () => void;
}

const ExportDataModal: FC<ExportDataModalProps> = ({
    isOpen,
    onClose,
    ...exportResultsProps
}) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <Modal
            opened
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconTableExport}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={600}>
                        {t('components_dashboard_tiles_export.export_data')}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: {
                    borderBottom: `1px solid ${theme.colors.gray[4]}`,
                },
                body: { padding: 0 },
            })}
        >
            <ExportResults
                {...exportResultsProps}
                renderDialogActions={({ onExport, isExporting }) => (
                    <Group
                        position="right"
                        sx={(theme) => ({
                            borderTop: `1px solid ${theme.colors.gray[4]}`,
                            bottom: 0,
                            padding: theme.spacing.md,
                        })}
                    >
                        <Button variant="outline" onClick={onClose}>
                            {t('components_dashboard_tiles_export.cancel')}
                        </Button>

                        <Button
                            loading={isExporting}
                            onClick={async () => {
                                await onExport();
                            }}
                            data-testid="chart-export-results-button"
                        >
                            {t('components_dashboard_tiles_export.download')}
                        </Button>
                    </Group>
                )}
            />
        </Modal>
    );
};

export default ExportDataModal;
