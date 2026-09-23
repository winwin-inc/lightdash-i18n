import {
    splitDataAppUploadFiles,
    type DataAppCodeFile,
    type DataAppManifest,
    type DataAppTemplate,
    type ImportAppCodeRequestBody,
} from '@lightdash/common';
import { load } from 'js-yaml';

const MANIFEST_NAME = 'lightdash-app.yml';

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('Failed to read file'));
                return;
            }
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
        reader.readAsDataURL(file);
    });

const normalizeRelPath = (rawPath: string): string =>
    rawPath.replace(/\\/g, '/').replace(/^\.?\//, '');

const stripRootFolder = (relPath: string): string => {
    const parts = relPath.split('/').filter(Boolean);
    if (parts.length <= 1) return relPath;
    return parts.slice(1).join('/');
};

const isAllowedUploadPath = (path: string): boolean =>
    path.startsWith('src/') || path.startsWith('dist/') || path === MANIFEST_NAME;

export const parseDataAppUploadFiles = async (
    fileList: FileList,
    targetAppUuid?: string,
): Promise<ImportAppCodeRequestBody> => {
    const files = Array.from(fileList);
    if (files.length === 0) {
        throw new Error('请选择包含 src/、dist/ 与 lightdash-app.yml 的应用目录');
    }

    const entries = files
        .map((file) => {
            const raw =
                file.webkitRelativePath ||
                (file as File & { path?: string }).path ||
                file.name;
            return {
                file,
                path: stripRootFolder(normalizeRelPath(raw)),
            };
        })
        .filter(({ path }) => isAllowedUploadPath(path));

    const manifestEntry = entries.find((entry) => entry.path === MANIFEST_NAME);
    if (!manifestEntry) {
        throw new Error('目录中缺少 lightdash-app.yml');
    }

    const manifestText = await manifestEntry.file.text();
    // YAML may still carry `template: custom`; DataAppManifest stores that as null.
    const parsed = load(manifestText) as
        | (Partial<Omit<DataAppManifest, 'template'>> & {
              template?: DataAppTemplate | null;
          })
        | undefined;
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('lightdash-app.yml 无法解析');
    }

    const template: Exclude<DataAppTemplate, 'custom'> =
        parsed.template === 'custom' || parsed.template == null
            ? 'dashboard'
            : parsed.template;
    const manifest: DataAppManifest = {
        codeVersion: 1,
        slug: parsed.slug,
        version: parsed.version ?? 1,
        name: parsed.name ?? 'Untitled app',
        description: parsed.description ?? '',
        template,
        downloadedAt: parsed.downloadedAt ?? new Date().toISOString(),
        spaceSlug: parsed.spaceSlug,
    };

    const codeFiles: DataAppCodeFile[] = await Promise.all(
        entries
            .filter((entry) => entry.path !== MANIFEST_NAME)
            .map(async ({ file, path }) => ({
                path,
                contentBase64: await fileToBase64(file),
            })),
    );

    splitDataAppUploadFiles(codeFiles);

    return {
        code: {
            manifest,
            files: codeFiles,
        },
        ...(targetAppUuid ? { targetAppUuid } : {}),
    };
};
