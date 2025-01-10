import {
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    useValidation,
    useValidationMutation,
} from '../../hooks/validation/useValidation';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { formatTime } from '../SchedulersView/SchedulersViewUtils';
import { ValidatorTable } from './ValidatorTable';

const MIN_ROWS_TO_ENABLE_SCROLLING = 6;

export const SettingsValidator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const theme = useMantineTheme();
    const [isValidating, setIsValidating] = useState(false);
    const { t } = useTranslation();

    const { user } = useApp();
    const { data, isLoading } = useValidation(projectUuid, user, true); // Note: Users that land on this page can always manage validations
    const { mutate: validateProject } = useValidationMutation(
        projectUuid,
        () => setIsValidating(false),
        () => setIsValidating(false),
    );

    return (
        <>
            <Text color="dimmed">{t('components_settings_validator.tip')}</Text>

            <Paper withBorder shadow="sm">
                <Group
                    position="apart"
                    p="md"
                    sx={{
                        borderBottomWidth: 1,
                        borderBottomStyle: 'solid',
                        borderBottomColor: theme.colors.gray[3],
                    }}
                >
                    <Text fw={500} fz="xs" c="gray.6">
                        {!!data?.length
                            ? `Last validated at: ${formatTime(
                                  data[0].createdAt,
                              )}`
                            : null}
                    </Text>
                    <Button
                        onClick={() => {
                            setIsValidating(true);
                            validateProject();
                        }}
                        loading={isValidating}
                    >
                        {t('components_settings_validator.run_validation')}
                    </Button>
                </Group>
                <Box
                    sx={{
                        overflowY:
                            data && data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? 'scroll'
                                : 'auto',
                        maxHeight:
                            data && data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? '500px'
                                : 'auto',
                    }}
                >
                    {isLoading ? (
                        <Group position="center" spacing="xs" p="md">
                            <Loader color="gray" />
                        </Group>
                    ) : !!data?.length ? (
                        <ValidatorTable data={data} projectUuid={projectUuid} />
                    ) : (
                        <Group position="center" spacing="xs" p="md">
                            <MantineIcon icon={IconCheck} color="green" />
                            <Text fw={500} c="gray.7">
                                {t(
                                    'components_settings_validator.no_validation_errors_found',
                                )}
                            </Text>
                        </Group>
                    )}
                </Box>
            </Paper>
        </>
    );
};
