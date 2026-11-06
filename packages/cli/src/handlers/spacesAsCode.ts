/* eslint-disable no-await-in-loop */
import {
    ApiSpaceAsCodeListResponse,
    ApiSpaceAsCodeUpsertResponse,
    LightdashError,
    SpaceAsCode,
    SpaceAsCodeAction,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

const getDownloadRoot = (customPath?: string) => {
    if (!customPath) {
        return path.join(process.cwd(), 'lightdash');
    }
    if (path.isAbsolute(customPath)) {
        return customPath;
    }
    return path.join(process.cwd(), customPath);
};

const getSpacesFolder = (customPath?: string) =>
    path.join(getDownloadRoot(customPath), 'spaces');

export const isSpaceAsCodeFetchError = (error: unknown): boolean =>
    error instanceof LightdashError && [403, 404].includes(error.statusCode);

export const downloadSpaces = async (
    projectId: string,
    customPath?: string,
): Promise<number> => {
    const results = (await lightdashApi({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/code/spaces`,
        body: undefined,
    })) as unknown as ApiSpaceAsCodeListResponse['results'];

    const outputDir = getSpacesFolder(customPath);
    await fs.mkdir(outputDir, { recursive: true });

    for (const space of results.spaces) {
        const fileName = `${space.slug.replace(/[/\\]/g, '__')}.space.yml`;
        await fs.writeFile(
            path.join(outputDir, fileName),
            yaml.dump(space, { quotingType: '"' }),
        );
    }

    results.skipped.forEach(({ slug, reason }) =>
        GlobalState.log(styles.warning(`Skipped space "${slug}": ${reason}`)),
    );

    return results.spaces.length;
};

export const writeEmbeddedSpaces = async (
    spaces: SpaceAsCode[] | undefined,
    customPath?: string,
): Promise<void> => {
    if (!spaces || spaces.length === 0) return;
    const outputDir = getSpacesFolder(customPath);
    await fs.mkdir(outputDir, { recursive: true });
    const unique = new Map(spaces.map((space) => [space.slug, space]));
    for (const space of unique.values()) {
        const fileName = `${space.slug.replace(/[/\\]/g, '__')}.space.yml`;
        await fs.writeFile(
            path.join(outputDir, fileName),
            yaml.dump(space, { quotingType: '"' }),
        );
    }
};

export const uploadSpaces = async (
    projectId: string,
    skipSpaceCreate?: boolean,
    customPath?: string,
): Promise<number> => {
    const inputDir = getSpacesFolder(customPath);
    let files: string[] = [];
    try {
        files = (await fs.readdir(inputDir)).filter((file) =>
            file.endsWith('.space.yml'),
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return 0;
        }
        throw error;
    }

    let uploaded = 0;
    for (const file of files) {
        const space = yaml.load(
            await fs.readFile(path.join(inputDir, file), 'utf-8'),
        ) as SpaceAsCode;
        const query = new URLSearchParams({
            skipSpaceCreate: String(Boolean(skipSpaceCreate)),
            publicSpaceCreate: 'false',
        }).toString();
        const result = (await lightdashApi({
            method: 'POST',
            url: `/api/v1/projects/${projectId}/code/spaces?${query}`,
            body: JSON.stringify(space),
        })) as unknown as ApiSpaceAsCodeUpsertResponse['results'];
        if (result.action !== SpaceAsCodeAction.NO_CHANGES) {
            uploaded += 1;
        }
        (result.warnings ?? []).forEach((warning) =>
            GlobalState.log(styles.warning(warning)),
        );
    }
    return uploaded;
};
