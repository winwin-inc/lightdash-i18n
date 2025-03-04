import { formatTimestamp } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Modal,
    Select,
    Stack,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCreateScimToken } from '../../hooks/useScimAccessToken';

export const CreateTokenModal: FC<{
    onBackClick: () => void;
}> = ({ onBackClick }) => {
    const { t } = useTranslation();

    const {
        data,
        mutate: createScimToken,
        isLoading,
        isSuccess,
    } = useCreateScimToken();

    const form = useForm({
        initialValues: {
            description: '',
            expiresAt: '',
        },
    });

    const expireOptions = [
        {
            label: t('ai_scim_access_tokens_panel.expires_in.no_expiration'),
            value: '',
        },
        {
            label: t('ai_scim_access_tokens_panel.expires_in.7_days'),
            value: '7',
        },
        {
            label: t('ai_scim_access_tokens_panel.expires_in.30_days'),
            value: '30',
        },
        {
            label: t('ai_scim_access_tokens_panel.expires_in.60_days'),
            value: '60',
        },
        {
            label: t('ai_scim_access_tokens_panel.expires_in.90_days'),
            value: '90',
        },
        {
            label: t('ai_scim_access_tokens_panel.expires_in.6_months'),
            value: '180',
        },
        {
            label: t('ai_scim_access_tokens_panel.expires_in.1_year'),
            value: '365',
        },
    ];

    const handleOnSubmit = form.onSubmit(({ description, expiresAt }) => {
        const currentDate = new Date();
        const dateWhenExpires = !!Number(expiresAt)
            ? new Date(
                  currentDate.setDate(
                      currentDate.getDate() + Number(expiresAt),
                  ),
              )
            : undefined;

        createScimToken({
            description,
            expiresAt: dateWhenExpires ?? null,
        });
    });

    return (
        <Modal
            size="lg"
            opened
            onClose={() => {
                onBackClick();
            }}
            title={
                <Title order={4}>
                    {data
                        ? t(
                              'ai_scim_access_tokens_panel.token_has_been_generated',
                          )
                        : t('ai_scim_access_tokens_panel.new_token')}
                </Title>
            }
        >
            {!isSuccess ? (
                <form onSubmit={handleOnSubmit}>
                    <Stack spacing="md">
                        <TextInput
                            label={t('ai_scim_access_tokens_panel.description')}
                            disabled={isLoading}
                            placeholder={t(
                                'ai_scim_access_tokens_panel.description',
                            )}
                            required
                            {...form.getInputProps('description')}
                        />

                        <Select
                            withinPortal
                            defaultValue={expireOptions[0].value}
                            label={t('ai_scim_access_tokens_panel.expiration')}
                            data={expireOptions}
                            required
                            disabled={isLoading}
                            {...form.getInputProps('expiresAt')}
                        ></Select>

                        <Button type="submit" ml="auto" loading={isLoading}>
                            {t('ai_scim_access_tokens_panel.generate_token')}
                        </Button>
                    </Stack>
                </form>
            ) : (
                <Stack spacing="md">
                    <TextInput
                        id="invite-link-input"
                        label={t('ai_scim_access_tokens_panel.token')}
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={data.token}
                        rightSection={
                            <CopyButton value={data.token}>
                                {({ copied, copy }) => (
                                    <Tooltip
                                        label={
                                            copied
                                                ? t(
                                                      'ai_scim_access_tokens_panel.copied',
                                                  )
                                                : t(
                                                      'ai_scim_access_tokens_panel.copy',
                                                  )
                                        }
                                        withArrow
                                        position="right"
                                    >
                                        <ActionIcon
                                            color={copied ? 'teal' : 'gray'}
                                            onClick={copy}
                                        >
                                            <MantineIcon
                                                icon={
                                                    copied
                                                        ? IconCheck
                                                        : IconCopy
                                                }
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </CopyButton>
                        }
                    />
                    <Alert icon={<MantineIcon icon={IconAlertCircle} />}>
                        {data.expiresAt &&
                            `${t(
                                'ai_scim_access_tokens_panel.token_will_expire',
                            )}
                        ${formatTimestamp(data.expiresAt)} `}
                        {t(
                            'ai_scim_access_tokens_panel.make_sure_to_copy_your_access_token_now',
                        )}
                    </Alert>
                </Stack>
            )}
        </Modal>
    );
};
