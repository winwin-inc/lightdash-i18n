import { Alert, Box, Button, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowLeft, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../MantineIcon';

type SpaceCreationFormProps = {
    spaceName: string;
    onSpaceNameChange: (name: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    parentSpaceName?: string;
};

const SpaceCreationForm = ({
    spaceName,
    onSpaceNameChange,
    onCancel,
    isLoading,
    parentSpaceName,
}: SpaceCreationFormProps) => {
    const { t } = useTranslation();

    return (
        <Stack spacing="xs">
            <Box>
                <Button
                    variant="subtle"
                    leftIcon={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onCancel}
                    disabled={isLoading}
                    size="xs"
                    compact
                >
                    {t('components_common_space_selector.back')}
                </Button>
            </Box>

            <Text fz="sm" fw={500}>
                {t('components_common_space_selector.create_tip.part_1')}
                {parentSpaceName ? (
                    <>
                        {' '}
                        {t(
                            'components_common_space_selector.create_tip.part_2',
                        )}
                        <Text span fw={600}>
                            "{parentSpaceName}"
                        </Text>
                    </>
                ) : null}
                {t('components_common_space_selector.create_tip.part_3')}
            </Text>

            <TextInput
                label={t('components_common_space_selector.name.label')}
                placeholder={t(
                    'components_common_space_selector.name.placeholder',
                )}
                required
                disabled={isLoading}
                value={spaceName}
                onChange={(e) => onSpaceNameChange(e.target.value)}
            />

            {parentSpaceName ? (
                <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                    <Text fw={500} color="blue">
                        {t(
                            'components_common_space_selector.permissions.part_1',
                        )}
                        <Text span fw={600}>
                            "{parentSpaceName}"
                        </Text>
                    </Text>
                </Alert>
            ) : (
                <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                    <Text fw={500} color="blue">
                        {t(
                            'components_common_space_selector.permissions.part_2',
                        )}
                    </Text>
                </Alert>
            )}
        </Stack>
    );
};

export default SpaceCreationForm;
