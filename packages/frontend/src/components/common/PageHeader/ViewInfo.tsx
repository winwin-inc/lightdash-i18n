import { Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';

import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { formatViewsSinceDescription } from '../ResourceView/resourceUtils';
import InfoContainer from './InfoContainer';

interface ViewInfoProps {
    views?: number;
    firstViewedAt?: Date | string | null;
}

const ViewInfo: FC<ViewInfoProps> = ({ views, firstViewedAt }) => {
    const { t, i18n } = useTranslation();
    const isZh = i18n.language.toLowerCase().startsWith('zh');

    const label =
        firstViewedAt && views !== undefined
            ? formatViewsSinceDescription({
                  count: views,
                  firstViewedAt,
                  t,
                  isZh,
              })
            : undefined;

    return (
        <Tooltip
            position="top-start"
            label={label}
            disabled={!views || !firstViewedAt}
        >
            <InfoContainer icon={IconEye}>
                {views || '0'} {t('components_common_page_header.views')}
            </InfoContainer>
        </Tooltip>
    );
};

export default ViewInfo;
