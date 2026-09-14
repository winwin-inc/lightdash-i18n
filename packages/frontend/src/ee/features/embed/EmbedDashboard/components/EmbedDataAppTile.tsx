import { type DashboardDataAppTile } from '@lightdash/common';
import { Box, Loader, Stack } from '@mantine-8/core';
import { IconAppsOff } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
import AppIframePreview from '../../../../../features/apps/AppIframePreview';
import { getVisiblePreviewTokenError } from '../../../../../features/apps/hooks/previewTokenQueryOptions';
import { useEmbedAppPreviewToken } from '../../../../../features/apps/hooks/useEmbedAppPreviewToken';
import { usePreviewOrigin } from '../../../../../features/apps/previewOrigin';
import useDashboardFiltersForTile from '../../../../../hooks/dashboard/useDashboardFiltersForTile';
import useDashboardTileStatusContext from '../../../../../providers/Dashboard/useDashboardTileStatusContext';
import { convertDateDashboardFilters } from '../../../../../utils/dateFilter';

// STUB: hashStringToBase36 not exported from common in this fork.
const hashStringToBase36 = (input: string): string => {
    const MODULUS = 2_147_483_647;
    const BASE = 31;
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * BASE + input.charCodeAt(i)) % MODULUS;
    }
    return hash.toString(36).padStart(6, '0');
};

type Props = {
    tile: DashboardDataAppTile;
    projectUuid: string;
};

/**
 * Embed-mode counterpart to `DashboardDataAppTile`.
 */
const EmbedDataAppTile: FC<Props> = ({ tile, projectUuid }) => {
    const {
        properties: { title, appUuid, appDeletedAt },
        uuid,
    } = tile;

    const tileDashboardFilters = useDashboardFiltersForTile(uuid);
    const dashboardFiltersForApp = useMemo(
        () => convertDateDashboardFilters(tileDashboardFilters),
        [tileDashboardFilters],
    );

    const previewOrigin = usePreviewOrigin();
    const shouldFetch = !!projectUuid && !!appUuid && !appDeletedAt;
    const tokenQuery = useEmbedAppPreviewToken(
        shouldFetch ? projectUuid : undefined,
        shouldFetch ? appUuid : undefined,
    );

    const filtersKey = useMemo(
        () => hashStringToBase36(JSON.stringify(dashboardFiltersForApp)),
        [dashboardFiltersForApp],
    );

    const previewUrl = tokenQuery.data
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${tokenQuery.data.version}/t/${tokenQuery.data.token}/?f=${filtersKey}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    const visibleTokenError = getVisiblePreviewTokenError(
        tokenQuery.error,
        !!tokenQuery.data,
    );
    const statusCode = visibleTokenError?.error?.statusCode;
    const isNotFound = !!appDeletedAt || statusCode === 404;
    const isForbidden = statusCode === 403;
    const hasLoadError = isNotFound || isForbidden || !!visibleTokenError;
    const markEmbedTileComplete = useDashboardTileStatusContext(
        (c) => c.markEmbedTileComplete,
    );
    const handleIframeLoad = useCallback(
        () => markEmbedTileComplete(uuid),
        [markEmbedTileComplete, uuid],
    );

    useEffect(() => {
        if (hasLoadError) markEmbedTileComplete(uuid);
    }, [hasLoadError, markEmbedTileComplete, uuid]);

    return (
        <TileBase
            tile={tile}
            title={title}
            isEditMode={false}
            onDelete={() => {}}
            onEdit={() => {}}
        >
            <Box className="non-draggable" style={{ flex: 1, minHeight: 0 }}>
                {isNotFound ? (
                    <SuboptimalState
                        icon={IconAppsOff}
                        title="Data app not available"
                        description="This data app no longer exists or hasn't finished building yet."
                    />
                ) : isForbidden ? (
                    <SuboptimalState
                        icon={IconAppsOff}
                        title="No access"
                        description="This data app isn't authorized for this embed."
                    />
                ) : tokenQuery.isLoading || !previewUrl || !tokenQuery.data ? (
                    <Stack align="center" justify="center" h="100%">
                        <Loader size="sm" />
                    </Stack>
                ) : (
                    <AppIframePreview
                        src={previewUrl}
                        previewToken={tokenQuery.data.token}
                        expectedPreviewOrigin={previewOrigin}
                        projectUuid={projectUuid}
                        appUuid={appUuid}
                        identityKey={`${appUuid}:${tokenQuery.data.version}`}
                        dashboardFilters={dashboardFiltersForApp}
                        onIframeLoad={handleIframeLoad}
                    />
                )}
            </Box>
        </TileBase>
    );
};

export default EmbedDataAppTile;
