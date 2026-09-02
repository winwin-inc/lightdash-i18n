import { isRequestMethod, RequestMethod } from '../types/api';

export const LightdashRequestMethodHeader = 'Lightdash-Request-Method';
export const LightdashVersionHeader = 'Lightdash-Version';
export const LightdashAppUuidHeader = 'Lightdash-App-Uuid';
export const LightdashAppPreviewTokenHeader = 'Lightdash-App-Preview-Token';
export const LIGHTDASH_APP_PREVIEW_TOKEN_MAX_AGE_SECONDS = 60 * 60;
export const LightdashSignedDownloadHeader = 'Lightdash-Signed-Download';

export const getRequestMethod = (
    headerValue: string | undefined,
): RequestMethod =>
    isRequestMethod(headerValue) ? headerValue : RequestMethod.UNKNOWN;
