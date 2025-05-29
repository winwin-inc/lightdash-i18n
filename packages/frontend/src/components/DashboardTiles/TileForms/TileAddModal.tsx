import {
    DashboardTileTypes,
    assertUnreachable,
    defaultTileSize,
    type Dashboard,
    type DashboardLoomTileProperties,
    type DashboardMarkdownTile,
    type DashboardMarkdownTileProperties,
} from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconMarkdown, IconVideo } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuid4 } from 'uuid';

import MantineIcon from '../../common/MantineIcon';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';
import { getLoomId, markdownTileContentTransform } from './utils';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

type AddProps = ModalProps & {
    type: DashboardTileTypes.LOOM | DashboardTileTypes.MARKDOWN;
    onConfirm: (tile: Tile) => void;
};

export const TileAddModal: FC<AddProps> = ({
    type,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();
    const [errorMessage, setErrorMessage] = useState<string>();

    const getValidators = () => {
        const urlValidator = {
            url: (value: string | undefined) =>
                getLoomId(value)
                    ? null
                    : t(
                          'components_dashboard_tiles_forms_add_tile.validator.url',
                      ),
        };
        const titleValidator = {
            title: (value: string | undefined) =>
                !value || !value.length
                    ? t(
                          'components_dashboard_tiles_forms_add_tile.validator.title',
                      )
                    : null,
        };
        if (type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
    };

    const form = useForm<TileProperties>({
        validate: getValidators(),
        validateInputOnChange: ['title', 'url', 'content'],
        transformValues(values) {
            if (type === DashboardTileTypes.MARKDOWN) {
                return markdownTileContentTransform(
                    values as DashboardMarkdownTile['properties'],
                );
            }

            return values;
        },
    });

    if (!type) return null;

    const handleConfirm = form.onSubmit(({ ...properties }) => {
        if (type === DashboardTileTypes.MARKDOWN) {
            const markdownForm = properties as any;
            if (!markdownForm.title && !markdownForm.content) {
                setErrorMessage(
                    t('components_dashboard_tiles_forms_add_tile.error_tip'),
                );
                return;
            }
        }

        onConfirm({
            uuid: uuid4(),
            properties: properties as any,
            type,
            tabUuid: undefined,
            ...defaultTileSize,
        });
        form.reset();
        setErrorMessage('');
    });

    const handleClose = () => {
        form.reset();
        setErrorMessage('');
        onClose?.();
    };

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon
                        size="lg"
                        color="blue.6"
                        icon={
                            type === DashboardTileTypes.MARKDOWN
                                ? IconMarkdown
                                : IconVideo
                        }
                    />
                    <Title order={4}>
                        {t(
                            'components_dashboard_tiles_forms_add_tile.add_tile',
                            {
                                type,
                            },
                        )}
                    </Title>
                </Group>
            }
            {...modalProps}
            size="xl"
            onClose={handleClose}
        >
            <form onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    {type === DashboardTileTypes.MARKDOWN ? (
                        <MarkdownTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardMarkdownTileProperties['properties']
                                >
                            }
                        />
                    ) : type === DashboardTileTypes.LOOM ? (
                        <LoomTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardLoomTileProperties['properties']
                                >
                            }
                            withHideTitle={false}
                        />
                    ) : (
                        assertUnreachable(type, 'Tile type not supported')
                    )}

                    {errorMessage}

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={handleClose}>
                            {t(
                                'components_dashboard_tiles_forms_add_tile.cancel',
                            )}
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            {t('components_dashboard_tiles_forms_add_tile.add')}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
