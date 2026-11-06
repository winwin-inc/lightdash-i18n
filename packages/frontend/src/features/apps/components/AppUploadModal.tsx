import { Alert, Button, Modal, Stack, Text } from '@mantine-8/core';
import { useId, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useImportAppCode } from '../hooks/useImportAppCode';
import { parseDataAppUploadFiles } from '../utils/parseDataAppUpload';

type Props = {
    opened: boolean;
    projectUuid: string;
    targetAppUuid?: string;
    onClose: () => void;
    onUploaded?: () => void;
};

const AppUploadModal: FC<Props> = ({
    opened,
    projectUuid,
    targetAppUuid,
    onClose,
    onUploaded,
}) => {
    const { t } = useTranslation();
    const inputId = useId();
    const [error, setError] = useState<string | null>(null);
    const [fileList, setFileList] = useState<FileList | null>(null);
    const { mutateAsync: importApp, isLoading } = useImportAppCode();

    const handleClose = () => {
        setError(null);
        setFileList(null);
        onClose();
    };

    const handleSubmit = async () => {
        setError(null);
        if (!fileList || fileList.length === 0) {
            setError(t('features_apps_upload.need_folder'));
            return;
        }
        try {
            const body = await parseDataAppUploadFiles(fileList, targetAppUuid);
            await importApp({ projectUuid, body });
            setFileList(null);
            onUploaded?.();
            onClose();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t('features_apps_upload.parse_failed'),
            );
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={
                targetAppUuid
                    ? t('features_apps_upload.update_title')
                    : t('features_apps_upload.title')
            }
            centered
        >
            <Stack>
                <Text size="sm" c="dimmed">
                    {t('features_apps_upload.hint')}
                </Text>
                <input
                    type="file"
                    // Directory picker is the supported upload path.
                    // @ts-expect-error webkitdirectory is not in React's input types
                    webkitdirectory=""
                    multiple
                    style={{ display: 'none' }}
                    id={inputId}
                    onChange={(event) => {
                        setError(null);
                        setFileList(event.target.files);
                    }}
                />
                <Button
                    variant="default"
                    onClick={() => document.getElementById(inputId)?.click()}
                >
                    {t('features_apps_upload.pick_folder')}
                </Button>
                {fileList && fileList.length > 0 && (
                    <Text size="sm">
                        {t('features_apps_upload.file_count', {
                            count: fileList.length,
                        })}
                    </Text>
                )}
                {error && (
                    <Alert color="red" title={t('features_apps_upload.error')}>
                        {error}
                    </Alert>
                )}
                <Button
                    onClick={() => {
                        handleSubmit().catch(() => undefined);
                    }}
                    loading={isLoading}
                >
                    {t('features_apps_upload.submit')}
                </Button>
            </Stack>
        </Modal>
    );
};

export default AppUploadModal;
