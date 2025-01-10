import { ActionIcon } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../hooks/toaster/useToaster';
import { COLLAPSABLE_CARD_ACTION_ICON_PROPS } from '../common/CollapsableCard/constants';
import MantineIcon from '../common/MantineIcon';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<string>;
};

const DownloadCsvButton: FC<Props> = memo(({ disabled, getCsvLink }) => {
    const { showToastError } = useToaster();
    const { t } = useTranslation();

    return (
        <ActionIcon
            data-testid="export-csv-button"
            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
            disabled={disabled}
            onClick={() => {
                getCsvLink()
                    .then((url) => {
                        window.location.href = url;
                    })
                    .catch((error) => {
                        showToastError({
                            title: t('components_download_sql_csv.toast_error'),
                            subtitle: error?.error?.message,
                        });
                    });
            }}
        >
            <MantineIcon icon={IconShare2} color="gray" />
        </ActionIcon>
    );
});

export default DownloadCsvButton;
