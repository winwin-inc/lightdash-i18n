import {
    formatDate,
    type ApiPersonalAccessTokenResponse,
} from '@lightdash/common';
import {
    Button,
    Flex,
    Modal,
    Paper,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import {
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
} from '../../../hooks/useAccessToken';
import MantineIcon from '../../common/MantineIcon';

const TokenItem: FC<{
    token: ApiPersonalAccessTokenResponse;
    setTokenToDelete: Dispatch<
        SetStateAction<ApiPersonalAccessTokenResponse | undefined>
    >;
}> = ({ token, setTokenToDelete }) => {
    const { description, expiresAt } = token;
    const { t } = useTranslation();

    return (
        <>
            <tr>
                <Text component="td" fw={500}>
                    {description}
                </Text>

                <td>
                    {expiresAt
                        ? formatDate(expiresAt)
                        : t(
                              'components_user_settings_access_tokens_panel_tokens_table.no_expiration_date',
                          )}
                </td>
                <td width="1%">
                    <Button
                        px="xs"
                        variant="outline"
                        size="xs"
                        color="red"
                        onClick={() => setTokenToDelete(token)}
                    >
                        <MantineIcon icon={IconTrash} />
                    </Button>
                </td>
            </tr>
        </>
    );
};

export const TokensTable = () => {
    const { data } = useAccessToken();
    const { t } = useTranslation();

    const { cx, classes } = useTableStyles();

    const [tokenToDelete, setTokenToDelete] = useState<
        ApiPersonalAccessTokenResponse | undefined
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
                            <th>
                                {t(
                                    'components_user_settings_access_tokens_panel_tokens_table.table_columns.name',
                                )}
                            </th>
                            <th>
                                {t(
                                    'components_user_settings_access_tokens_panel_tokens_table.table_columns.expiration_date',
                                )}
                            </th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.map((token) => (
                            <TokenItem
                                key={token.uuid}
                                token={token}
                                setTokenToDelete={setTokenToDelete}
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
        </>
    );
};
