import {
    SemanticLayerType,
    type DbtSemanticLayerConnection,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Flex,
    Group,
    HoverCard,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp, IconTrash } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import MantineIcon from '../common/MantineIcon';

export const dbtSemanticLayerFormSchema = z.object({
    type: z.literal(SemanticLayerType.DBT),
    token: z.string(),
    domain: z
        .string()
        .url({ message: 'Domain must be a valid URL' })
        .min(1, 'Domain is required'),
    environmentId: z.string().min(1, 'Environment ID is required'),
});

// pre defined domains come from: https://docs.getdbt.com/docs/dbt-cloud-apis/sl-graphql#dbt-semantic-layer-graphql-api
const PRE_DEFINED_DOMAINS = [
    'https://semantic-layer.cloud.getdbt.com/api/graphql',
    'https://semantic-layer.emea.dbt.com/api/graphql',
    'https://semantic-layer.au.dbt.com/api/graphql',
];

type Props = {
    isLoading: boolean;
    semanticLayerConnection?: DbtSemanticLayerConnection;
    onSubmit: (data: z.infer<typeof dbtSemanticLayerFormSchema>) => void;
    onDelete: () => Promise<void>;
};

const DbtSemanticLayerForm: FC<Props> = ({
    isLoading,
    semanticLayerConnection,
    onSubmit,
    onDelete,
}) => {
    const { t } = useTranslation();

    const theme = useMantineTheme();
    const form = useForm<z.infer<typeof dbtSemanticLayerFormSchema>>({
        validate: {
            ...zodResolver(dbtSemanticLayerFormSchema),
            // Custom validation for token since when there is no semanticLayerConnection it is required at the form level (there's also backend validation)
            token: (value) =>
                !semanticLayerConnection && value.length < 1
                    ? t('components_settings_semantic_layer.dbt.error.token')
                    : null,
        },
        initialValues: {
            type: SemanticLayerType.DBT,
            token: '',
            domain: semanticLayerConnection?.domain ?? '',
            environmentId: semanticLayerConnection?.environmentId ?? '',
        },
    });

    const [domainOptions, setDomainOptions] = useState(
        // Remove duplicate entries if current domain is already part of PRE_DEFINED_DOMAINS
        Array.from(
            new Set(
                PRE_DEFINED_DOMAINS.concat(
                    semanticLayerConnection?.domain ?? [],
                ),
            ),
        ),
    );

    const handleDelete = useCallback(async () => {
        await onDelete();
        form.setInitialValues({
            type: SemanticLayerType.DBT,
            token: '',
            domain: '',
            environmentId: '',
        });
        form.reset();
    }, [form, onDelete]);

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack>
                <PasswordInput
                    autoComplete="off"
                    {...form.getInputProps('token')}
                    placeholder={
                        semanticLayerConnection
                            ? '**************'
                            : t(
                                  'components_settings_semantic_layer.dbt.form.password',
                              )
                    }
                    label={
                        <Group display="inline-flex" spacing="xs">
                            {t(
                                'components_settings_semantic_layer.dbt.form.token',
                            )}
                            <HoverCard
                                width={400}
                                withinPortal
                                position="top"
                                withArrow
                            >
                                <HoverCard.Target>
                                    <MantineIcon
                                        icon={IconHelp}
                                        color="gray.6"
                                    />
                                </HoverCard.Target>
                                <HoverCard.Dropdown
                                    style={{
                                        backgroundColor: theme.colors.dark[6],
                                    }}
                                >
                                    <Text color="white">
                                        {t(
                                            'components_settings_semantic_layer.dbt.form.token_tooltip.part_1',
                                        )}{' '}
                                        <Anchor
                                            href="https://cloud.getdbt.com/next/settings"
                                            target="_blank"
                                        >
                                            {t(
                                                'components_settings_semantic_layer.dbt.form.token_tooltip.part_2',
                                            )}
                                        </Anchor>{' '}
                                        {'>'}{' '}
                                        {t(
                                            'components_settings_semantic_layer.dbt.form.token_tooltip.part_3',
                                        )}{' '}
                                        {'>'}{' '}
                                        {t(
                                            'components_settings_semantic_layer.dbt.form.token_tooltip.part_4',
                                        )}{' '}
                                        <Text span fw={500}>
                                            {t(
                                                'components_settings_semantic_layer.dbt.form.token_tooltip.part_5',
                                            )}
                                        </Text>{' '}
                                        {t(
                                            'components_settings_semantic_layer.dbt.form.token_tooltip.part_6',
                                        )}
                                        .
                                    </Text>
                                </HoverCard.Dropdown>
                            </HoverCard>
                        </Group>
                    }
                />

                <Select
                    label={t(
                        'components_settings_semantic_layer.dbt.form.domain.title',
                    )}
                    data={domainOptions}
                    {...form.getInputProps('domain')}
                    placeholder={t(
                        'components_settings_semantic_layer.dbt.form.domain.placeholder',
                    )}
                    searchable
                    creatable
                    getCreateLabel={(value) =>
                        `${t(
                            'components_settings_semantic_layer.dbt.form.domain.custom',
                        )}"${value}"`
                    }
                    onCreate={(item) => {
                        setDomainOptions([...domainOptions, item]);
                        return item;
                    }}
                />

                <TextInput
                    {...form.getInputProps('environmentId')}
                    placeholder={t(
                        'components_settings_semantic_layer.dbt.form.environment.placeholder',
                    )}
                    label={
                        <Group display="inline-flex" spacing="xs">
                            {t(
                                'components_settings_semantic_layer.dbt.form.environment.title',
                            )}
                            <Tooltip
                                maw={400}
                                label={
                                    <Text fw={400}>
                                        {t(
                                            'components_settings_semantic_layer.dbt.form.environment_tooltip',
                                        )}
                                    </Text>
                                }
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <Flex justify="end" align="center" gap="sm">
                    <Button
                        type="submit"
                        disabled={!form.isValid()}
                        loading={isLoading}
                    >
                        {t('components_settings_semantic_layer.dbt.save')}
                    </Button>
                    <ActionIcon
                        variant="transparent"
                        onClick={handleDelete}
                        disabled={!Boolean(semanticLayerConnection)}
                        c="red"
                    >
                        <MantineIcon icon={IconTrash} size="md" />
                    </ActionIcon>
                </Flex>
            </Stack>
        </form>
    );
};

export default DbtSemanticLayerForm;
