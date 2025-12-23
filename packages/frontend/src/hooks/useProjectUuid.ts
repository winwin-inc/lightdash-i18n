import { useParams } from 'react-router';

import useEmbed from '../ee/providers/Embed/useEmbed';

/**
 * We have a couple ways to derive the projectUuid:
 * - From the URL when logging in via the MSY X app UI
 * - From the embed context when logging in via the MSY X SDK or embed URL
 *
 * We prioritize the URL over the embed context to facilitate the most use-cases.
 */
export function useProjectUuid() {
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const { projectUuid: embedProjectUuid } = useEmbed();

    return projectUuidFromParams || embedProjectUuid;
}
