import {
    type DashboardBasicDetails,
    type DecodedEmbed,
    type UpdateEmbed,
} from '@lightdash/common';
import { Button, Flex, MultiSelect, Stack, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const EmbedDashboardsForm: FC<{
    disabled: boolean;
    embedConfig: DecodedEmbed;
    dashboards: DashboardBasicDetails[];
    onSave: (values: UpdateEmbed) => void;
}> = ({ disabled, embedConfig, dashboards, onSave }) => {
    const { t } = useTranslation();

    const form = useForm({
        initialValues: {
            allowAllDashboards: embedConfig.allowAllDashboards,
            dashboardUuids: embedConfig.dashboardUuids,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        onSave({
            dashboardUuids: values.dashboardUuids,
            allowAllDashboards: values.allowAllDashboards,
        });
    });

    return (
        <form id="add-dashboard-to-embed-config" onSubmit={handleSubmit}>
            <Stack>
                <Switch
                    name="allowAllDashboards"
                    label={t(
                        'features_embed_settings_embed_dashboards_form.allow_all_dashboards',
                    )}
                    {...form.getInputProps('allowAllDashboards', {
                        type: 'checkbox',
                    })}
                />
                {!form.values.allowAllDashboards && (
                    <MultiSelect
                        required={!form.values.allowAllDashboards}
                        label={t(
                            'features_embed_settings_embed_dashboards_form.dashboards',
                        )}
                        data={dashboards.map((dashboard) => ({
                            value: dashboard.uuid,
                            label: dashboard.name,
                        }))}
                        disabled={
                            disabled ||
                            dashboards.length === 0 ||
                            form.values.allowAllDashboards
                        }
                        defaultValue={[]}
                        placeholder={
                            dashboards.length === 0
                                ? t(
                                      'features_embed_settings_embed_dashboards_form.no_dashboards',
                                  )
                                : t(
                                      'features_embed_settings_embed_dashboards_form.select_dashboards',
                                  )
                        }
                        searchable
                        withinPortal
                        description={t(
                            'features_embed_settings_embed_dashboards_form.select_dashboards_description',
                        )}
                        {...form.getInputProps('dashboardUuids')}
                    />
                )}
                <Flex justify="flex-end" gap="sm">
                    <Button
                        type="submit"
                        disabled={disabled || dashboards.length === 0}
                    >
                        {t(
                            'features_embed_settings_embed_dashboards_form.save_changes',
                        )}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default EmbedDashboardsForm;
