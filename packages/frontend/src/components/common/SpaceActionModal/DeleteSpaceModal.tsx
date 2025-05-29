import { Alert, Button, Flex, Text, TextInput } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type DeleteSpaceModalBody } from '.';
import MantineModal from '../MantineModal';

const DeleteSpaceTextInputConfirmation: FC<{
    data: DeleteSpaceModalBody['data'];
    setCanDelete: (canDelete: boolean) => void;
}> = ({ data, setCanDelete }) => {
    const [value, setValue] = useState('');
    const { t } = useTranslation();

    return (
        <TextInput
            label={t('components_common_space_action_modal.type_to_delete')}
            placeholder={t('components_common_space_action_modal.space_name')}
            value={value}
            onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value === data?.name) {
                    setCanDelete(true);
                } else {
                    setCanDelete(false);
                }
            }}
        />
    );
};

const DeleteSpaceModalContent: FC<Pick<DeleteSpaceModalBody, 'data'>> = ({
    data,
}) => {
    const { t } = useTranslation();

    if (
        !data ||
        !(
            data.queries.length > 0 ||
            data.dashboards.length > 0 ||
            data.childSpaces.length > 0
        )
    ) {
        return (
            <p>
                {t('components_common_space_action_modal.delete.part_1')}
                <b>"{data?.name}"</b>
                {t('components_common_space_action_modal.delete.part_2')}
            </p>
        );
    }

    return (
        <>
            <p>
                {t('components_common_space_action_modal.delete.part_1')}
                <b>"{data?.name}"</b>
                {t('components_common_space_action_modal.delete.part_2')}
            </p>

            <Alert color="red">
                <Text size="sm" color="gray.9">
                    <strong>
                        {t(
                            'components_common_space_action_modal.delete.part_3',
                        )}
                    </strong>
                </Text>
                <ul style={{ paddingLeft: '1rem' }}>
                    {data.queries.length > 0 ? (
                        <li>
                            {data?.queries?.length}{' '}
                            {t(
                                'components_common_space_action_modal.delete.part_4',
                                {
                                    suffix:
                                        data?.queries?.length === 1 ? '' : 's',
                                },
                            )}
                        </li>
                    ) : null}
                    {data.dashboards.length > 0 && (
                        <li>
                            {data?.dashboards?.length}{' '}
                            {t(
                                'components_common_space_action_modal.delete.part_5',
                                {
                                    suffix:
                                        data?.dashboards?.length === 1
                                            ? ''
                                            : 's',
                                },
                            )}
                        </li>
                    )}
                    {data.childSpaces.length > 0 && (
                        <li>
                            {data?.childSpaces?.length}{' '}
                            {t(
                                'components_common_space_action_modal.delete.part_6',
                                {
                                    suffix:
                                        data?.childSpaces?.length === 1
                                            ? ''
                                            : 's',
                                },
                            )}
                            {t(
                                'components_common_space_action_modal.delete.part_7',
                            )}
                        </li>
                    )}
                </ul>
            </Alert>
        </>
    );
};

export const DeleteSpaceModal: FC<DeleteSpaceModalBody> = ({
    data,
    title,
    onClose,
    icon,
    form,
    handleSubmit,
    isLoading,
}) => {
    const { t } = useTranslation();
    const [canDelete, setCanDelete] = useState(false);

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={title}
            icon={icon}
            size="lg"
            actions={
                <form name={title} onSubmit={form.onSubmit(handleSubmit)}>
                    <Flex gap="sm">
                        <Button variant="default" h={32} onClick={onClose}>
                            {t('components_common_space_action_modal.cancel')}
                        </Button>
                        <Button
                            h={32}
                            type="submit"
                            color="red"
                            disabled={!canDelete || isLoading}
                            loading={isLoading}
                        >
                            {t(
                                'components_common_space_action_modal.delete_space',
                            )}
                        </Button>
                    </Flex>
                </form>
            }
        >
            <DeleteSpaceModalContent data={data} />
            <DeleteSpaceTextInputConfirmation
                data={data}
                setCanDelete={setCanDelete}
            />
        </MantineModal>
    );
};
