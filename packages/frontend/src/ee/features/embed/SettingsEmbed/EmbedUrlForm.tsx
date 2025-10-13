import {
    FilterInteractivityValues,
    type ApiError,
    type CreateEmbedJwt,
    type DashboardBasicDetails,
    type DashboardFilterInteractivityOptions,
    type EmbedUrl,
    type IntrinsicUserAttributes,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Input,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconEye, IconLink, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';

import { lightdashApi } from '../../../../api';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useAsyncClipboard } from '../../../../hooks/useAsyncClipboard';
import useUser from '../../../../hooks/user/useUser';
import EmbedCodeSnippet from './EmbedCodeSnippet';
import EmbedFiltersInteractivity from './EmbedFiltersInteractivity';

const useEmbedUrlCreateMutation = (projectUuid: string) => {
    const { showToastError } = useToaster();
    const { t } = useTranslation();
    return useMutation<EmbedUrl, ApiError, CreateEmbedJwt>(
        (data: CreateEmbedJwt) =>
            lightdashApi<EmbedUrl>({
                url: `/embed/${projectUuid}/get-embed-url`,
                method: 'POST',
                body: JSON.stringify(data),
            }),
        {
            mutationKey: ['create-embed-url'],
            onError: (error) => {
                showToastError({
                    title: t(
                        'ai_embed_url_form.error_tips.could_not_create_embed_url',
                    ),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

type FormValues = {
    dashboardUuid: string | undefined;
    expiresIn: string;
    userAttributes: Array<{
        uuid: string;
        key: string;
        value: string;
    }>;
    dashboardFiltersInteractivity: DashboardFilterInteractivityOptions;
    canExportCsv?: boolean;
    canExportImages?: boolean;
    externalId?: string;
    canExportPagePdf?: boolean;
    canDateZoom?: boolean;
    canExplore?: boolean;
    canViewUnderlyingData?: boolean;
} & IntrinsicUserAttributes;

const EmbedUrlForm: FC<{
    projectUuid: string;
    siteUrl: string;
    dashboards: DashboardBasicDetails[];
}> = ({ projectUuid, siteUrl, dashboards }) => {
    const { t } = useTranslation();

    const { mutateAsync: createEmbedUrl } =
        useEmbedUrlCreateMutation(projectUuid);
    const { data: user } = useUser(true);

    const form = useForm<FormValues>({
        initialValues: {
            dashboardUuid: undefined,
            expiresIn: '1 hour',
            userAttributes: [{ uuid: uuidv4(), key: '', value: '' }] as Array<{
                uuid: string;
                key: string;
                value: string;
            }>,
            email: user?.email,
            dashboardFiltersInteractivity: {
                enabled: FilterInteractivityValues.none,
            },
            canExportCsv: false,
            canExportImages: false,
            canDateZoom: false,
            canExportPagePdf: true,
            canExplore: false,
            canViewUnderlyingData: false,
        },
        validate: {
            dashboardUuid: (value: undefined | string) => {
                return value && value.length > 0
                    ? null
                    : t('ai_embed_url_form.error_tips.dashboard_is_required');
            },
        },
    });
    const { onSubmit, validate, values: formValues } = form;

    const convertFormValuesToCreateEmbedJwt = useCallback(
        (values: FormValues, isPreview: boolean = false): CreateEmbedJwt => {
            return {
                expiresIn: values.expiresIn,
                content: {
                    type: 'dashboard',
                    projectUuid,
                    dashboardUuid: values.dashboardUuid!,
                    dashboardFiltersInteractivity: {
                        enabled: values.dashboardFiltersInteractivity?.enabled,
                        ...(values.dashboardFiltersInteractivity?.enabled ===
                        FilterInteractivityValues.some
                            ? {
                                  allowedFilters:
                                      values.dashboardFiltersInteractivity
                                          .allowedFilters,
                              }
                            : {}),
                    },
                    canExportCsv: values.canExportCsv,
                    canExportImages: values.canExportImages,
                    isPreview,
                    canDateZoom: values.canDateZoom,
                    canExportPagePdf: values.canExportPagePdf ?? true,
                    canExplore: values.canExplore,
                    canViewUnderlyingData: values.canViewUnderlyingData,
                },
                userAttributes: values.userAttributes.reduce(
                    (acc, item) => ({
                        ...acc,
                        [item.key]: item.value,
                    }),
                    {},
                ),
                user: {
                    externalId: values.externalId,
                    email: values.email,
                },
            };
        },
        [projectUuid],
    );

    const handlePreview = useCallback(async () => {
        const state = validate();
        if (state.hasErrors) {
            return;
        }

        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(formValues, true),
        );
        //Open data.url on new tab
        window.open(data.url, '_blank');
    }, [
        formValues,
        validate,
        convertFormValuesToCreateEmbedJwt,
        createEmbedUrl,
    ]);

    const generateUrl = useCallback(async () => {
        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(form.values),
        );
        return data.url;
    }, [convertFormValuesToCreateEmbedJwt, createEmbedUrl, form.values]);

    const { handleCopy } = useAsyncClipboard(generateUrl);
    const handleCopySubmit = onSubmit(handleCopy);

    return (
        <form id="generate-embed-url" onSubmit={handleCopySubmit}>
            <Stack mb={'md'}>
                <Stack spacing="xs">
                    <Title order={5}>{t('ai_embed_url_form.preview')}</Title>
                    <Text color="dimmed">
                        {t('ai_embed_url_form.preview_description')}
                    </Text>
                </Stack>
                <Select
                    required
                    label={t('ai_embed_url_form.dashboard')}
                    data={dashboards.map((dashboard) => ({
                        value: dashboard.uuid,
                        label: dashboard.name,
                    }))}
                    placeholder={t('ai_embed_url_form.select_a_dashboard')}
                    searchable
                    withinPortal
                    {...form.getInputProps('dashboardUuid')}
                />
                <Select
                    required
                    label={t('ai_embed_url_form.expires_in')}
                    data={['1 hour', '1 day', '1 week', '30 days', '1 year']}
                    withinPortal
                    {...form.getInputProps('expiresIn')}
                />
                <Input.Wrapper label={t('ai_embed_url_form.user_identifier')}>
                    <TextInput
                        size={'xs'}
                        placeholder="1234"
                        {...form.getInputProps(`externalId`)}
                    />
                </Input.Wrapper>
                <Input.Wrapper label={t('ai_embed_url_form.user_email')}>
                    <TextInput
                        size={'xs'}
                        placeholder={t(
                            'ai_embed_url_form.user_email_placeholder',
                        )}
                        {...form.getInputProps('email')}
                    />
                </Input.Wrapper>
                <Input.Wrapper label={t('ai_embed_url_form.user_attributes')}>
                    {form.values.userAttributes.map((item, index) => (
                        <Group key={item.uuid} mt="xs">
                            <TextInput
                                size={'xs'}
                                placeholder={t(
                                    'ai_embed_url_form.user_attributes_placeholder.part_1',
                                )}
                                {...form.getInputProps(
                                    `userAttributes.${index}.key`,
                                )}
                            />
                            <TextInput
                                size={'xs'}
                                placeholder={t(
                                    'ai_embed_url_form.user_attributes_placeholder.part_2',
                                )}
                                {...form.getInputProps(
                                    `userAttributes.${index}.value`,
                                )}
                            />
                            <ActionIcon
                                variant="light"
                                onClick={() =>
                                    form.removeListItem('userAttributes', index)
                                }
                            >
                                <MantineIcon color="red" icon={IconTrash} />
                            </ActionIcon>
                        </Group>
                    ))}
                    <Group>
                        <Button
                            size="xs"
                            mr="xxs"
                            variant="default"
                            mt="xs"
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={() =>
                                form.insertListItem('userAttributes', {
                                    key: '',
                                    value: '',
                                    uuid: uuidv4(),
                                })
                            }
                        >
                            {t('ai_embed_url_form.add_attribute')}
                        </Button>
                    </Group>
                </Input.Wrapper>
                <Input.Wrapper label={t('ai_embed_url_form.interactivity')}>
                    <EmbedFiltersInteractivity
                        dashboardUuid={
                            form.getInputProps('dashboardUuid').value
                        }
                        onInteractivityOptionsChange={(
                            interactivityOptions,
                        ) => {
                            form.setFieldValue(
                                'dashboardFiltersInteractivity',
                                interactivityOptions,
                            );
                        }}
                        interactivityOptions={
                            form.getInputProps('dashboardFiltersInteractivity')
                                .value
                        }
                    />
                </Input.Wrapper>

                <Switch
                    {...form.getInputProps(`canExportCsv`)}
                    labelPosition="left"
                    label={t('ai_embed_url_form.can_export_csv')}
                />
                <Switch
                    {...form.getInputProps(`canExportImages`)}
                    labelPosition="left"
                    label={t('ai_embed_url_form.can_export_images')}
                />
                <Switch
                    {...form.getInputProps(`canExportPagePdf`)}
                    labelPosition="left"
                    label={t('ai_embed_url_form.can_export_page_pdf')}
                    defaultChecked={true}
                />
                <Switch
                    {...form.getInputProps(`canDateZoom`)}
                    labelPosition="left"
                    label={t('ai_embed_url_form.can_date_zoom')}
                />
                <Switch
                    {...form.getInputProps(`canExplore`)}
                    labelPosition="left"
                    label={`Can explore charts`}
                />
                <Switch
                    {...form.getInputProps(`canViewUnderlyingData`)}
                    labelPosition="left"
                    label={`Can view underlying data`}
                />
                <Flex justify="flex-end" gap="sm">
                    <Button
                        variant={'light'}
                        leftIcon={<MantineIcon icon={IconEye} />}
                        onClick={handlePreview}
                    >
                        {t('ai_embed_url_form.preview')}
                    </Button>
                    <Button
                        variant={'outline'}
                        type="submit"
                        leftIcon={<MantineIcon icon={IconLink} />}
                    >
                        {t('ai_embed_url_form.generate_and_copy_url')}
                    </Button>
                </Flex>
            </Stack>
            <Stack mb="md">
                <Stack spacing="xs">
                    <Title order={5}>
                        {t('ai_embed_url_form.code_snippet')}
                    </Title>
                    <Text color="dimmed">
                        {t('ai_embed_url_form.copy_to_clipboard_description')}
                    </Text>
                </Stack>
                <EmbedCodeSnippet
                    projectUuid={projectUuid}
                    siteUrl={siteUrl}
                    data={convertFormValuesToCreateEmbedJwt(formValues)}
                />
            </Stack>
        </form>
    );
};

export default EmbedUrlForm;
