import { type Metric } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

type Props = {
    item: Metric;
};

const FormatMenuOptions: FC<Props> = ({ item }) => {
    const { track } = useTracking();
    const { t } = useTranslation();

    const toggleFormatModal = useExplorerContext(
        (context) => context.actions.toggleFormatModal,
    );

    const onCreate = () => {
        toggleFormatModal({ metric: item });
        track({
            name: EventName.FORMAT_METRIC_BUTTON_CLICKED,
        });
    };

    return (
        <>
            <Menu.Label>{t("components_explorer_results_card.format")}</Menu.Label>
            <Menu.Item onClick={onCreate}>{t("components_explorer_results_card.edit_format")}</Menu.Item>
        </>
    );
};

export default FormatMenuOptions;
