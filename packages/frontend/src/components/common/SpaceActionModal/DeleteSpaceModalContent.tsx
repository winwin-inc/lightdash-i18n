import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type SpaceModalBody } from '.';

const DeleteSpaceModalContent: FC<SpaceModalBody> = ({ data }) => {
    const { t } = useTranslation();
    return (
        <>
            <p>
                {t('components_space_action_modal_delete.question')}{' '}
                <b>"{data?.name}"</b>?
            </p>

            {data && (data.queries.length > 0 || data.dashboards.length > 0) && (
                <p>
                    {t('components_space_action_modal_delete.perfix')}
                    {data.queries.length > 0 && (
                        <>
                            {' '}
                            {data.queries.length} chart
                            {data.queries.length === 1 ? '' : 's'}
                        </>
                    )}
                    {data.queries.length > 0 && data.dashboards.length > 0 && (
                        <> {t('components_space_action_modal_delete.and')}</>
                    )}
                    {data.dashboards.length > 0 && (
                        <>
                            {' '}
                            {data.dashboards.length}{' '}
                            {t(
                                'components_space_action_modal_delete.dashboard',
                            )}
                            {data.dashboards.length === 1 ? '' : 's'}
                        </>
                    )}
                </p>
            )}
        </>
    );
};

export default DeleteSpaceModalContent;
