import { type ApiError, type Dashboard } from '@lightdash/common';
import {
    Box,
    Button,
    Card,
    Flex,
    Image,
    LoadingOverlay,
    Modal,
    Radio,
    Stack,
    Text,
} from '@mantine/core';
import { IconEye, IconEyeClosed } from '@tabler/icons-react';
import { type UseMutationResult } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useCustomWidthOptions,
    type CUSTOM_WIDTH_OPTIONS,
} from '../../scheduler/constants';

type PreviewAndCustomizeScreenshotProps = {
    containerWidth?: number | undefined;
    exportMutation: UseMutationResult<
        string,
        ApiError,
        {
            dashboard: Dashboard;
            gridWidth: number | undefined;
            queryFilters: string;
            isPreview?: boolean | undefined;
        }
    >;
    previewChoice: typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined;
    setPreviewChoice: (
        prev: typeof CUSTOM_WIDTH_OPTIONS[number]['value'] | undefined,
    ) => void;
    onPreviewClick?: () => Promise<void>;
    currentPreview?: string;
    disabled?: boolean;
};

export const PreviewAndCustomizeScreenshot: FC<
    PreviewAndCustomizeScreenshotProps
> = ({
    containerWidth,
    exportMutation,
    previewChoice,
    setPreviewChoice,
    onPreviewClick,
    currentPreview,
    disabled = false,
}) => {
    const { t } = useTranslation();
    const customWidthOptions = useCustomWidthOptions();
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    return (
        <Box>
            <LoadingOverlay visible={exportMutation.isLoading} />

            <Stack spacing="md">
                <Flex align="flex-start" justify="space-between">
                    <Radio.Group
                        name="customWidth"
                        label={t('features_preview.custom_width')}
                        defaultValue=""
                        onChange={(value) => {
                            setPreviewChoice(value);
                        }}
                        value={previewChoice}
                    >
                        <Flex direction="column" gap="sm" pt="sm">
                            {customWidthOptions
                                .concat(
                                    containerWidth
                                        ? [
                                              {
                                                  label: `${t(
                                                      'features_preview.current_view',
                                                  )} (${containerWidth}px)`,
                                                  value: containerWidth.toString(),
                                              },
                                          ]
                                        : [],
                                )
                                .map((option) => (
                                    <Radio
                                        key={option.value}
                                        value={option.value}
                                        label={option.label}
                                        checked={previewChoice === option.value}
                                    />
                                ))}
                        </Flex>
                    </Radio.Group>

                    <Stack>
                        <Card withBorder p={0}>
                            <Image
                                src={currentPreview}
                                onClick={() => {
                                    if (currentPreview)
                                        setIsImageModalOpen(true);
                                }}
                                width={350}
                                height={350}
                                styles={{
                                    root: {
                                        objectPosition: 'top',
                                        cursor: currentPreview
                                            ? 'pointer'
                                            : 'default',
                                    },
                                }}
                                withPlaceholder
                                placeholder={
                                    <Flex
                                        gap="md"
                                        align="center"
                                        direction="column"
                                    >
                                        <MantineIcon
                                            icon={IconEyeClosed}
                                            size={30}
                                        />

                                        <Text>
                                            {t(
                                                'features_preview.no_preview_yet',
                                            )}
                                        </Text>
                                    </Flex>
                                }
                            />
                        </Card>
                        <Button
                            mx="auto"
                            display="block"
                            size="xs"
                            variant="default"
                            leftIcon={<MantineIcon icon={IconEye} />}
                            disabled={!previewChoice || disabled}
                            onClick={async () => {
                                if (onPreviewClick) {
                                    await onPreviewClick();
                                }
                            }}
                        >
                            {t('features_preview.generate_preview')}
                        </Button>
                    </Stack>
                </Flex>
            </Stack>

            <Modal
                fullScreen
                onClose={() => setIsImageModalOpen(false)}
                opened={isImageModalOpen}
            >
                <Image
                    src={currentPreview}
                    onClick={() => {
                        setIsImageModalOpen(false);
                    }}
                    width="100%"
                    height="100%"
                    styles={{
                        root: {
                            cursor: 'pointer',
                        },
                    }}
                />
            </Modal>
        </Box>
    );
};
