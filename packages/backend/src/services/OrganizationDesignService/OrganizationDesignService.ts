// STUB: Organization designs service — helpers shaped for AppGenerateService compile
import type { ApiOrganizationDesignFile } from '@lightdash/common';

export type OrganizationDesignPackage = any;

export class OrganizationDesignService {
    constructor(_args?: unknown) {}
}

export function designS3Key(..._args: unknown[]): string {
    return '';
}

/** Sync Map of effective design files keyed by package path (matches upstream). */
export function getEffectiveOrganizationDesignFiles(
    files: ApiOrganizationDesignFile[] | unknown[] = [],
): Map<string, ApiOrganizationDesignFile> {
    const effectiveFiles = new Map<string, ApiOrganizationDesignFile>();
    for (const file of files as ApiOrganizationDesignFile[]) {
        if (file && typeof file === 'object' && 'filename' in file) {
            effectiveFiles.set(
                `${file.kind}/${file.filename}`.toLowerCase(),
                file,
            );
        }
    }
    return effectiveFiles;
}

export async function buildOrganizationDesignPackage(
    ..._args: unknown[]
): Promise<any> {
    return null;
}
