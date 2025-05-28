import { SearchItemType } from '@lightdash/common';
import { Anchor } from '@mantine/core';
import { IconAlertTriangleFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import {
    IconBox,
    ResourceIndicator,
} from '../../../components/common/ResourceIcon';
import { type SearchItem } from '../types/searchItem';
import { useSearchItemErrorLabel } from '../utils/getSearchItemLabel';
import { getOmnibarItemColor, getOmnibarItemIcon } from './utils';

type Props = {
    item: SearchItem;
};

export const OmnibarItemIcon: FC<Props> = ({ item }) => {
    return (
        <IconBox
            color={getOmnibarItemColor(item.type)}
            icon={getOmnibarItemIcon(item)}
            {...(item.type === SearchItemType.SPACE && {
                bg: 'violet.0',
            })}
        />
    );
};

type OmnibarItemIconWithIndicatorProps = {
    item: SearchItem;
    projectUuid: string;
    canUserManageValidation: boolean;
};

export const OmnibarItemIconWithIndicator: FC<
    OmnibarItemIconWithIndicatorProps
> = ({ item, projectUuid, canUserManageValidation }) => {
    const { t } = useTranslation();
    const getSearchItemErrorLabel = useSearchItemErrorLabel();

    return item.item && 'validationErrors' in item.item ? (
        <ResourceIndicator
            iconProps={{
                color: 'red',
                icon: IconAlertTriangleFilled,
            }}
            tooltipProps={{
                maw: 300,
                withinPortal: true,
                multiline: true,
                offset: -2,
                position: 'bottom',
            }}
            tooltipLabel={
                canUserManageValidation ? (
                    <>
                        {t(
                            'features_omnibar_item_icon.tooltip_can_manage.part_1',
                        )}{' '}
                        <Anchor
                            component={Link}
                            fw={600}
                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                                e.stopPropagation()
                            }
                            to={{
                                pathname: `/generalSettings/projectManagement/${projectUuid}/validator`,
                                search: `?validationId=${item.item.validationErrors[0].validationId}`,
                            }}
                            color="blue.4"
                        >
                            {t(
                                'features_omnibar_item_icon.tooltip_can_manage.part_2',
                            )}
                        </Anchor>
                        {t(
                            'features_omnibar_item_icon.tooltip_can_manage.part_3',
                        )}
                    </>
                ) : (
                    t('features_omnibar_item_icon.tooltip_error', {
                        type: getSearchItemErrorLabel(item.type),
                    })
                )
            }
        >
            <OmnibarItemIcon item={item} />
        </ResourceIndicator>
    ) : null;
};
