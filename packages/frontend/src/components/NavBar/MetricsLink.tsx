import { Button } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useProject } from '../../hooks/useProject';
import useTracking from '../../providers/Tracking/useTracking';
import { Hash } from '../../svgs/metricsCatalog';
import { EventName } from '../../types/Events';

interface Props {
    projectUuid: string;
}

export const MetricsLink: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { data: project } = useProject(projectUuid);
    const { track } = useTracking();

    const handleMetricsCatalogClick = useCallback(() => {
        if (project) {
            track({
                name: EventName.METRICS_CATALOG_CLICKED,
                properties: {
                    organizationId: project.organizationUuid,
                    projectId: projectUuid,
                },
            });
        }
        void navigate(`/projects/${projectUuid}/metrics`);
    }, [project, projectUuid, track, navigate]);

    return (
        <Button
            variant="default"
            size="xs"
            fz="sm"
            leftIcon={<Hash />}
            onClick={handleMetricsCatalogClick}
        >
            {t('component_navbar_metrics_link.metrics')}
        </Button>
    );
};
