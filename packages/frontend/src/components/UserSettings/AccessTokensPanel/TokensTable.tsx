import {
    formatDate,
    formatTimestamp,
    type PersonalAccessToken,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    CopyButton,
    Flex,
    Group,
    Menu,
    Modal,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconCheck,
    IconCopy,
    IconDots,
    IconInfoCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useAccessToken,
    useDeleteAccessToken,
    useRotateAccessToken,
} from '../../../hooks/useAccessToken';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import MantineIcon from '../../common/MantineIcon';
import { useExpireOptions } from './useExpireOptions';

const TokenItem: FC<{
    token: PersonalAccessToken;
    setTokenToDelete: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
    setTokenToCopy: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
    setTokenToRotate: Dispatch<SetStateAction<PersonalAccessToken | undefined>>;
}> = ({ token, setTokenToDelete, setTokenToCopy, setTokenToRotate }) => {
    const { description, expiresAt, rotatedAt, lastUsedAt } = token;
    const { t } = useTranslation();

    return (
        <>
            <tr>
                <Text component="td" fw={500}>
                    {description}
                </Text>
                <td>
                    <Group align="center" position="left" spacing="xs">
                        <span>
                            {expiresAt
                                ? formatDate(expiresAt)
                                : t(
                                      'components_user_settings_access_tokens_panel_tokens_table.no_expiration_date',
                                  )}
                        </span>
                        {rotatedAt && (
                            <Tooltip
                                withinPortal
                                position="top"
                                maw={350}
                                label={`${t(
                                    'components_user_settings_access_tokens_panel_tokens_table.last_rotated_at',
                                )} ${formatTimestamp(rotatedAt)}`}
                            >
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="gray.6"
                                    size="md"
                                />
                            </Tooltip>
                        )}
                    </Group>
                </td>
                <td>
                    {lastUsedAt && (
                        <Tooltip
                            withinPortal
                            position="top"
                            maw={350}
                            label={formatTimestamp(lastUsedAt)}
                        >
                            <Text>{formatDate(lastUsedAt)}</Text>
                        </Tooltip>
                    )}
                </td>
                <td width="1%">
                    <Menu withinPortal position="bottom-end">
                        <Menu.Target>
                            <ActionIcon
                                variant="transparent"
                                size="sm"
                                color="gray.6"
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                icon={<MantineIcon icon={IconCopy} />}
                                onClick={() => setTokenToCopy(token)}
                            >
                                {t(
                                    'components_user_settings_access_tokens_panel_tokens_table.copy_token_uuid',
                                )}
                            </Menu.Item>
                            {token.expiresAt && (
                                <Menu.Item
                                    icon={<MantineIcon icon={IconRefresh} />}
                                    onClick={() => setTokenToRotate(token)}
                                >
                                    {t(
                                        'components_user_settings_access_tokens_panel_tokens_table.rotate_token',
                                    )}
                                </Menu.Item>
                            )}
                            <Menu.Item
                                icon={<MantineIcon icon={IconTrash} />}
                                color="red"
                                onClick={() => setTokenToDelete(token)}
                            >
                                {t(
                                    'components_user_settings_access_tokens_panel_tokens_table.delete',
                                )}
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </td>
            </tr>
        </>
    );
};

const RotateTokenForm: FC<{
    token: PersonalAccessToken | undefined;
    onCancel: () => void;
}> = ({ token, onCancel }) => {
    const { t } = useTranslation();

    const {
        mutate: rotateToken,
        isLoading,
        isSuccess,
        data: rotatedTokenData,
    } = useRotateAccessToken();

    const onRotate = useCallback(
        (expiresAt: string) => {
            if (token) {
                rotateToken({
                    tokenUuid: token.uuid,
                    expiresAt,
                });
            }
        },
        [token, rotateToken],
    );

    const expireOptions = useExpireOptions();

    const form = useForm({
        initialValues: {
            expiresAt: expireOptions[0]?.value || '30',
        },
    });

    const handleOnSubmit = form.onSubmit(({ expiresAt }) => {
        const currentDate = new Date();
        const dateWhenExpires = new Date(
            currentDate.setDate(currentDate.getDate() + Number(expiresAt)),
        );
        onRotate(dateWhenExpires.toISOString());
    });

    if (isSuccess && rotatedTokenData) {
        return (
            <Stack spacing="md">
                <Alert icon={<MantineIcon icon={IconCheck} />} color="green">
                    {t(
                        'components_user_settings_access_tokens_panel_tokens_table.token_rotated_successfully',
                    )}
                </Alert>

                <TextInput
                    label={t(
                        'components_user_settings_access_tokens_panel_tokens_table.new_token',
                    )}
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={rotatedTokenData.token}
                    rightSection={
                        <CopyButton value={rotatedTokenData.token}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={
                                        copied
                                            ? t(
                                                  'components_user_settings_access_tokens_panel_tokens_table.copied',
                                              )
                                            : t(
                                                  'components_user_settings_access_tokens_panel_tokens_table.copy',
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
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    }
                />

                <Alert icon={<MantineIcon icon={IconInfoCircle} />}>
                    {t(
                        'components_user_settings_access_tokens_panel_tokens_table.mark_sure_to_copy',
                    )}
                </Alert>

                <Flex gap="sm" justify="flex-end">
                    <Button onClick={onCancel}>
                        {t(
                            'components_user_settings_access_tokens_panel_tokens_table.done',
                        )}
                    </Button>
                </Flex>
            </Stack>
        );
    }

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack spacing="md">
                <Alert
                    icon={<MantineIcon icon={IconInfoCircle} />}
                    color="blue"
                    variant="light"
                >
                    <Stack spacing="xs">
                        <Text fw={500}>
                            {t(
                                'components_user_settings_access_tokens_panel_tokens_table.rotating_token',
                                {
                                    description: token?.description,
                                },
                            )}
                        </Text>
                        <Text size="sm">
                            {t(
                                'components_user_settings_access_tokens_panel_tokens_table.rotating_token_description',
                            )}
                        </Text>
                    </Stack>
                </Alert>

                <Select
                    withinPortal
                    label={t(
                        'components_user_settings_access_tokens_panel_tokens_table.new_expiration',
                    )}
                    data={expireOptions}
                    required
                    disabled={isLoading}
                    {...form.getInputProps('expiresAt')}
                />

                <Flex gap="sm" justify="flex-end">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        {t(
                            'components_user_settings_access_tokens_panel_tokens_table.cancel',
                        )}
                    </Button>
                    <Button type="submit" loading={isLoading} color="blue">
                        {t(
                            'components_user_settings_access_tokens_panel_tokens_table.rotate_token',
                        )}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export const TokensTable = () => {
    const { data } = useAccessToken();
    const { t } = useTranslation();

    const { cx, classes } = useTableStyles();

    const [tokenToDelete, setTokenToDelete] = useState<
        PersonalAccessToken | undefined
    >();
    const [tokenToCopy, setTokenToCopy] = useState<
        PersonalAccessToken | undefined
    >();
    const [tokenToRotate, setTokenToRotate] = useState<
        PersonalAccessToken | undefined
    >();

    const { mutate, isLoading: isDeleting, isSuccess } = useDeleteAccessToken();

    useEffect(() => {
        if (isSuccess) {
            setTokenToDelete(undefined);
        }
    }, [isSuccess]);

    return (
        <>
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th>{t(
                                'components_user_settings_access_tokens_panel_tokens_table.table_columns.description',
                            )}</th>
                            <th>{t(
                                'components_user_settings_access_tokens_panel_tokens_table.table_columns.expiration_date',
                            )}</th>
                            <th>{t(
                                'components_user_settings_access_tokens_panel_tokens_table.table_columns.last_used_at',
                            )}</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.map((token) => (
                            <TokenItem
                                key={token.uuid}
                                token={token}
                                setTokenToDelete={setTokenToDelete}
                                setTokenToCopy={setTokenToCopy}
                                setTokenToRotate={setTokenToRotate}
                            />
                        ))}
                    </tbody>
                </Table>
            </Paper>

            <Modal
                opened={!!tokenToDelete}
                onClose={() => !isDeleting && setTokenToDelete(undefined)}
                title={
                    <Title order={4}>
                        {t(
                            'components_user_settings_access_tokens_panel_tokens_table.modal.delete_token',
                        )}{' '}
                        {tokenToDelete?.description}
                    </Title>
                }
            >
                <Stack spacing="xl">
                    <Text>
                        {t(
                            'components_user_settings_access_tokens_panel_tokens_table.modal.content.part_1',
                        )}
                        <Text fw={600} component="span">
                            {' '}
                            {tokenToDelete?.description}{' '}
                        </Text>
                        {t(
                            'components_user_settings_access_tokens_panel_tokens_table.modal.content.part_2',
                        )}
                    </Text>

                    <Flex gap="sm" justify="flex-end">
                        <Button
                            color="dark"
                            variant="outline"
                            disabled={isDeleting}
                            onClick={() => setTokenToDelete(undefined)}
                        >
                            {t(
                                'components_user_settings_access_tokens_panel_tokens_table.modal.cancel',
                            )}
                        </Button>
                        <Button
                            color="red"
                            disabled={isDeleting}
                            onClick={() => {
                                mutate(tokenToDelete?.uuid ?? '');
                            }}
                        >
                            {t(
                                'components_user_settings_access_tokens_panel_tokens_table.modal.delete',
                            )}
                        </Button>
                    </Flex>
                </Stack>
            </Modal>

            <Modal
                opened={!!tokenToCopy}
                onClose={() => setTokenToCopy(undefined)}
                title={
                    <Title order={4}>
                        {t(
                            'components_user_settings_access_tokens_panel_tokens_table.token_modal.token_uuid.part_1',
                        )}{' '}
                        {tokenToCopy?.description
                            ? t(
                                  'components_user_settings_access_tokens_panel_tokens_table.token_modal.token_uuid.part_2',
                                  {
                                      description: tokenToCopy.description,
                                  },
                              )
                            : ''}
                    </Title>
                }
                size="md"
            >
                <Stack spacing="lg">
                    <Alert
                        icon={<MantineIcon icon={IconInfoCircle} />}
                        color="blue"
                        variant="light"
                    >
                        <Stack spacing="xs">
                            <Text fw={500}>{t(
                                'components_user_settings_access_tokens_panel_tokens_table.token_modal.content.part_1',
                            )}</Text>
                            <Text size="sm">
                                {t(
                                    'components_user_settings_access_tokens_panel_tokens_table.token_modal.content.part_2.part_1',
                                )}{' '}
                                <DocumentationHelpButton
                                    href="https://docs.lightdash.com/references/personal_tokens#rotating-a-personal-access-token"
                                    tooltipProps={{
                                        label: 'Learn about token rotation',
                                    }}
                                />
                                . {t(
                                    'components_user_settings_access_tokens_panel_tokens_table.token_modal.content.part_2.part_2',
                                )}
                            </Text>
                        </Stack>
                    </Alert>

                    <Group spacing="sm">
                        <Text
                            family="monospace"
                            size="sm"
                            bg="white"
                            p="xs"
                            style={{
                                borderRadius: 4,
                                border: '1px solid #e9ecef',
                            }}
                        >
                            {tokenToCopy?.uuid}
                        </Text>
                        <CopyButton value={tokenToCopy?.uuid ?? ''}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? t(
                                        'components_user_settings_access_tokens_panel_tokens_table.token_modal.copied',
                                    ) : t(
                                        'components_user_settings_access_tokens_panel_tokens_table.token_modal.copy_uuid',
                                    )}
                                    withArrow
                                    position="top"
                                >
                                    <ActionIcon
                                        size="sm"
                                        onClick={copy}
                                        variant={copied ? 'filled' : 'light'}
                                        color={copied ? 'teal' : 'blue'}
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    </Group>

                    <Flex gap="sm" justify="flex-end">
                        <Button
                            variant="light"
                            onClick={() => setTokenToCopy(undefined)}
                        >
                            {t(
                                'components_user_settings_access_tokens_panel_tokens_table.token_modal.done',
                            )}
                        </Button>
                    </Flex>
                </Stack>
            </Modal>

            <Modal
                opened={!!tokenToRotate}
                onClose={() => setTokenToRotate(undefined)}
                title={<Title order={4}>{t(
                    'components_user_settings_access_tokens_panel_tokens_table.rotate_token',
                )}</Title>}
                size="md"
            >
                {!!tokenToRotate ? (
                    <RotateTokenForm
                        key={tokenToRotate?.uuid}
                        token={tokenToRotate}
                        onCancel={() => setTokenToRotate(undefined)}
                    />
                ) : null}
            </Modal>
        </>
    );
};
