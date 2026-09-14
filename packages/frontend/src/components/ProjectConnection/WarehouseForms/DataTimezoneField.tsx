import {
    FeatureFlags,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Button,
    Divider,
    Group,
    Stack,
    Text,
} from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDataTimezonePreviewMutation } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import TimeZonePicker from '../../common/TimeZonePicker';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';

const PipelineStep: FC<{ n: number; title: string; value: ReactNode }> = ({
    n,
    title,
    value,
}) => (
    <Group spacing="sm" noWrap align="flex-start">
        <Badge size="sm" radius="xl" variant="light">
            {n}
        </Badge>
        <Stack spacing={0}>
            <Text size="xs" weight={600}>
                {title}
            </Text>
            <Text size="xs" sx={{ fontFamily: 'monospace' }}>
                {value}
            </Text>
        </Stack>
    </Group>
);

const Connector: FC<{ children: ReactNode }> = ({ children }) => (
    <Text size="xs" color="dimmed" ml="md" pl={4}>
        ↓ {children}
    </Text>
);

const DataTimezoneField: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation();
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const preview = useDataTimezonePreviewMutation();

    if (!(timezoneSupportFlag?.enabled ?? false)) return null;

    const onPreview = () => {
        const warehouse = form.values.warehouse;
        if (savedProject) {
            preview.mutate({
                mode: 'edit',
                projectUuid: savedProject.projectUuid,
                warehouseType: warehouse.type,
                dataTimezone: warehouse.dataTimezone ?? null,
            });
            return;
        }
        const credentials: CreateWarehouseCredentials = warehouse.dataTimezone
            ? warehouse
            : {
                  ...warehouse,
                  dataTimezone: undefined,
              };
        preview.mutate({ mode: 'create', credentials });
    };

    const result = preview.data;
    const prefix = 'components_project_connection_warehouse_form.data_timezone';

    return (
        <Stack spacing="xs">
            <TimeZonePicker
                size="sm"
                maw="100%"
                label={t(`${prefix}.label`)}
                description={t(`${prefix}.description`)}
                searchable
                clearable
                placeholder={t(`${prefix}.placeholder`)}
                disabled={disabled}
                {...form.getInputProps('warehouse.dataTimezone')}
            />
            <Button
                variant="default"
                size="xs"
                onClick={onPreview}
                loading={preview.isLoading}
                disabled={disabled}
            >
                {t(`${prefix}.preview`)}
            </Button>

            {preview.isError && (
                <Alert color="red" title={t(`${prefix}.preview_failed`)}>
                    {preview.error?.error.message ??
                        t(`${prefix}.connection_failed`)}
                </Alert>
            )}

            {result && (
                <Stack spacing="xs">
                    <Text size="xs" color="dimmed">
                        {t(`${prefix}.pipeline_intro`)}
                    </Text>
                    {!result.dataTimezoneApplies && (
                        <Text size="xs" color="dimmed">
                            {t(`${prefix}.unset_hint`)}
                        </Text>
                    )}
                    <PipelineStep
                        n={1}
                        title={t(`${prefix}.step_from_warehouse`)}
                        value={t(`${prefix}.step_from_warehouse_value`, {
                            raw: result.naive.raw,
                        })}
                    />
                    <Connector>
                        {t(`${prefix}.read_as`, {
                            zone: result.naive.interpretedAs,
                        })}
                        {result.dataTimezoneApplies
                            ? t(`${prefix}.your_data_timezone`)
                            : ''}
                    </Connector>
                    <PipelineStep
                        n={2}
                        title={t(`${prefix}.step_exact_moment`)}
                        value={result.naive.readAs}
                    />
                    <Connector>
                        {t(`${prefix}.shown_in_project`, {
                            timezone: result.projectTimezone,
                        })}
                    </Connector>
                    <PipelineStep
                        n={3}
                        title={t(`${prefix}.step_users_see`)}
                        value={result.naive.rendered}
                    />
                    <Divider my={4} />
                    <Text size="xs" color="dimmed">
                        {t(`${prefix}.aware_note`, {
                            raw: result.aware.raw,
                            rendered: result.aware.rendered,
                        })}
                    </Text>
                </Stack>
            )}
        </Stack>
    );
};

export default DataTimezoneField;
