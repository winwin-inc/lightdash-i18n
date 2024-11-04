import {
    type DashboardBasicDetails,
    type SpaceSummary,
} from '@lightdash/common';
import { Loader, Select } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

export const saveToDashboardSchema = z.object({
    dashboardUuid: z.string().nullable(),
});

type FormType = z.infer<typeof saveToDashboardSchema>;

type Props<T extends FormType> = {
    form: UseFormReturnType<T>;
    spaces: SpaceSummary[] | undefined;
    dashboards: DashboardBasicDetails[] | undefined;
    isLoading: boolean;
};

const SaveToDashboardForm = <T extends FormType>({
    form,
    spaces = [],
    dashboards = [],
    isLoading,
}: Props<T>) => {
    const { t } = useTranslation();

    return (
        <Select
            description={t(
                'components_common_modal_chart_create.save_dashboard.form.dashboard.description',
            )}
            id="select-dashboard"
            label={t(
                'components_common_modal_chart_create.save_dashboard.form.dashboard.label',
            )}
            size="xs"
            data={dashboards.map((d) => ({
                value: d.uuid,
                label: d.name,
                group: spaces.find((s) => s.uuid === d.spaceUuid)?.name,
            }))}
            rightSection={isLoading && <Loader size="xs" />}
            searchable
            nothingFound={t(
                'components_common_modal_chart_create.save_dashboard.form.dashboard.nothing_found',
            )}
            filter={(value, dashboard) =>
                !!dashboard.label
                    ?.toLowerCase()
                    .includes(value.toLowerCase().trim())
            }
            withinPortal
            required
            {...form.getInputProps('dashboardUuid')}
        />
    );
};

export default SaveToDashboardForm;
