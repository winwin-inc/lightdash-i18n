import {
    type DashboardBasicDetails,
    type SpaceSummary,
} from '@lightdash/common';
import { Loader, Select } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { useTranslation } from 'react-i18next';

import { type SaveToDashboardFormType } from './types';

type Props<T extends SaveToDashboardFormType> = {
    form: UseFormReturnType<T>;
    spaces: SpaceSummary[] | undefined;
    dashboards: DashboardBasicDetails[] | undefined;
    isLoading: boolean;
};

const SaveToDashboardForm = <T extends SaveToDashboardFormType>({
    form,
    spaces = [],
    dashboards = [],
    isLoading,
}: Props<T>) => {
    const { t } = useTranslation();

    return (
        <Select
            id="select-dashboard"
            label={t(
                'components_common_modal_chart_create.save_dashboard.form.dashboard.label',
            )}
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
