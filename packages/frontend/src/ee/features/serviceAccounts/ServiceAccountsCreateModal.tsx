import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Modal,
    MultiSelect,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react';
import { addDays } from 'date-fns';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';

import { ServiceAccountScope } from '@lightdash/common';

const AVAILABLE_SCOPES = Object.values(ServiceAccountScope)
    .map((scope) => ({
        label: scope,
        value: scope,
        group: scope.split(':')[0],
    }))
    .filter((scope) => scope.group !== 'scim');

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (values: any) => void;
    isWorking: boolean;
    token?: string;
};

export const ServiceAccountsCreateModal: FC<Props> = ({
    isOpen,
    onClose,
    onSave,
    isWorking,
    token,
}) => {
    const { t } = useTranslation();

    const expireOptions = [
        {
            label: t(
                'features_service_accounts_create_modal.expire_options.no_expiration',
            ),
            value: '',
        },
        {
            label: t(
                'features_service_accounts_create_modal.expire_options.7_days',
            ),
            value: '7',
        },
        {
            label: t(
                'features_service_accounts_create_modal.expire_options.30_days',
            ),
            value: '30',
        },
        {
            label: t(
                'features_service_accounts_create_modal.expire_options.60_days',
            ),
            value: '60',
        },
        {
            label: t(
                'features_service_accounts_create_modal.expire_options.90_days',
            ),
            value: '90',
        },
        {
            label: t(
                'features_service_accounts_create_modal.expire_options.6_months',
            ),
            value: '180',
        },
        {
            label: t(
                'features_service_accounts_create_modal.expire_options.1_year',
            ),
            value: '365',
        },
    ];

    const form = useForm({
        initialValues: {
            description: '',
            expiresAt: '',
            scopes: [] as ServiceAccountScope[],
        },
        transformValues: (values) => {
            return {
                ...values,
                expiresAt:
                    values.expiresAt === '' ? null : Number(values.expiresAt),
            };
        },
        validate: {
            scopes: (value) => {
                if (value.length === 0) {
                    return t(
                        'features_service_accounts_create_modal.at_least_one_scope_required',
                    );
                }
                return null;
            },
        },
    });

    const closeModal = () => {
        form.reset();
        onClose();
    };

    const handleOnSubmit = form.onSubmit(({ expiresAt, ...values }) => {
        onSave({
            ...values,
            expiresAt: expiresAt ? addDays(new Date(), expiresAt) : expiresAt,
        });
    });

    return (
        <Modal
            opened={isOpen}
            onClose={closeModal}
            title={t(
                'features_service_accounts_create_modal.new_service_account',
            )}
            styles={(theme) => ({
                title: { fontWeight: 'bold', fontSize: theme.fontSizes.lg },
            })}
        >
            {!token ? (
                <form onSubmit={handleOnSubmit}>
                    <Stack spacing="md">
                        <TextInput
                            label={t(
                                'features_service_accounts_create_modal.form.description.label',
                            )}
                            placeholder={t(
                                'features_service_accounts_create_modal.form.description.placeholder',
                            )}
                            required
                            disabled={isWorking}
                            {...form.getInputProps('description')}
                        />
                        <Select
                            withinPortal
                            defaultValue={expireOptions[0].value}
                            label={t(
                                'features_service_accounts_create_modal.form.expires_at.label',
                            )}
                            data={expireOptions}
                            disabled={isWorking}
                            {...form.getInputProps('expiresAt')}
                        ></Select>
                        <MultiSelect
                            label={t(
                                'features_service_accounts_create_modal.form.scopes.label',
                            )}
                            placeholder={t(
                                'features_service_accounts_create_modal.form.scopes.placeholder',
                            )}
                            data={AVAILABLE_SCOPES}
                            required
                            searchable
                            maxDropdownHeight={140}
                            disabled={isWorking}
                            {...form.getInputProps('scopes')}
                        />

                        <Button type="submit" ml="auto" loading={isWorking}>
                            {t(
                                'features_service_accounts_create_modal.create_service_account',
                            )}
                        </Button>
                    </Stack>
                </form>
            ) : (
                <Stack spacing="md">
                    <TextInput
                        label={t(
                            'features_service_accounts_create_modal.token',
                        )}
                        readOnly
                        className="sentry-block ph-no-capture"
                        value={token}
                        rightSection={
                            <CopyButton value={token}>
                                {({ copied, copy }) => (
                                    <Tooltip
                                        label={
                                            copied
                                                ? t(
                                                      'features_service_accounts_create_modal.copied',
                                                  )
                                                : t(
                                                      'features_service_accounts_create_modal.copy',
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
                        {t(
                            'features_service_accounts_create_modal.make_sure_to_copy_token',
                        )}
                    </Alert>
                    <Button onClick={closeModal} ml="auto">
                        {t('features_service_accounts_create_modal.done')}
                    </Button>
                </Stack>
            )}
        </Modal>
    );
};
