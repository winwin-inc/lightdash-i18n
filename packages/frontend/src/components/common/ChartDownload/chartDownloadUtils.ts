import JsPDF from 'jspdf';

const FILE_NAME = 'lightdash_chart';

export enum DownloadType {
    JPEG = 'JPEG',
    PNG = 'PNG',
    SVG = 'SVG',
    PDF = 'PDF',
    JSON = 'JSON',
}

/**
 * Target aspect ratio for image export. Determines the outer canvas size;
 * the source chart is letterboxed into that canvas without stretching.
 *
 * - ORIGINAL: keep the source's current dimensions.
 * - A16x9: 1920×1080 (PPT widescreen horizontal).
 * - A9x16: 1080×1920 (PPT vertical / portrait).
 */
export enum ExportAspectRatio {
    ORIGINAL = 'original',
    A16x9 = '16x9',
    A9x16 = '9x16',
    A4x3 = '4x3',
    A3x4 = '3x4',
}

const LONG_EDGE_PX = 1920;

export type ExportDimensions = {
    targetW: number;
    targetH: number;
    drawW: number;
    drawH: number;
    offsetX: number;
    offsetY: number;
};

const safeRatio = (w: number, h: number): number => {
    if (!w || !h) return 1;
    return w / h;
};

function getAspectRatioValue(ratio: ExportAspectRatio): number {
    switch (ratio) {
        case ExportAspectRatio.A16x9:
            return 16 / 9;
        case ExportAspectRatio.A9x16:
            return 9 / 16;
        case ExportAspectRatio.A4x3:
            return 4 / 3;
        case ExportAspectRatio.A3x4:
            return 3 / 4;
        case ExportAspectRatio.ORIGINAL:
        default:
            return 1;
    }
}

/**
 * Computes the target canvas dimensions and the letterboxed draw rectangle
 * for placing a source image into the target aspect ratio.
 *
 * Pure function (no DOM access) so it can be unit-tested directly.
 */
export const computeExportDimensions = (
    srcWidth: number,
    srcHeight: number,
    ratio: ExportAspectRatio,
): ExportDimensions => {
    const srcRatio = safeRatio(srcWidth, srcHeight);

    let targetW: number;
    let targetH: number;

    if (ratio === ExportAspectRatio.ORIGINAL) {
        targetW = Math.max(1, Math.round(srcWidth));
        targetH = Math.max(1, Math.round(targetW / srcRatio));
    } else {
        const targetRatio = getAspectRatioValue(ratio);
        if (targetRatio >= 1) {
            targetW = LONG_EDGE_PX;
            targetH = Math.round(LONG_EDGE_PX / targetRatio);
        } else {
            targetH = LONG_EDGE_PX;
            targetW = Math.round(LONG_EDGE_PX * targetRatio);
        }
    }

    // Letterbox: fit source into target without stretching.
    let drawW = targetW;
    let drawH = Math.round(targetW / srcRatio);
    if (drawH > targetH) {
        drawH = targetH;
        drawW = Math.round(targetH * srcRatio);
    }

    const offsetX = Math.round((targetW - drawW) / 2);
    const offsetY = Math.round((targetH - drawH) / 2);

    return { targetW, targetH, drawW, drawH, offsetX, offsetY };
};

/**
 * Letterboxes an arbitrary image (SVG base64 or raster base64) into a target
 * canvas of the requested aspect ratio. Returns a base64 PNG/JPEG data URL.
 */
export const letterboxImageToCanvas = (
    originalBase64: string,
    srcWidth: number,
    srcHeight: number,
    ratio: ExportAspectRatio,
    isBackgroundTransparent: boolean,
    type: 'jpeg' | 'png' = 'png',
): Promise<string> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const sourceW = img.naturalWidth || srcWidth || 1;
            const sourceH =
                img.naturalHeight || Math.round(sourceW * 0.75);

            const dims = computeExportDimensions(
                sourceW,
                sourceH,
                ratio,
            );

            const canvas = document.createElement('canvas');
            canvas.width = dims.targetW;
            canvas.height = dims.targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject();
                return;
            }

            const fillWhite =
                type === 'jpeg' || !isBackgroundTransparent;
            if (fillWhite) {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            ctx.drawImage(
                img,
                dims.offsetX,
                dims.offsetY,
                dims.drawW,
                dims.drawH,
            );

            try {
                const data = canvas.toDataURL(`image/${type}`);
                resolve(data);
            } catch {
                reject();
            }
        };
        img.onerror = () => reject();
        img.src = originalBase64;
    });

/**
 * Re-renders an SVG-as-base64 chart into a PNG/JPEG data URL, optionally
 * letterboxed into a target aspect ratio.
 *
 * The `aspectRatio` parameter is appended at the end so existing 4-argument
 * callers (e.g. the legacy DashboardExportImage path) keep working.
 */
export const base64SvgToBase64Image = async (
    originalBase64: string,
    width: number,
    type: 'jpeg' | 'png' = 'png',
    isBackgroundTransparent: boolean = false,
    aspectRatio: ExportAspectRatio = ExportAspectRatio.ORIGINAL,
): Promise<string> =>
    letterboxImageToCanvas(
        originalBase64,
        width,
        width,
        aspectRatio,
        isBackgroundTransparent,
        type,
    );

export function downloadImage(base64: string, name?: string) {
    const link = document.createElement('a');
    link.href = base64;
    link.download = name || FILE_NAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function downloadJson(object: Object) {
    const data = JSON.stringify(object);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${FILE_NAME}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function downloadPdf(base64: string, width: number, height: number) {
    const padding: number = 20;
    let doc: JsPDF;
    if (width > height) {
        doc = new JsPDF('l', 'mm', [width + padding * 2, height + padding * 2]);
    } else {
        doc = new JsPDF('p', 'mm', [height + padding * 2, width + padding * 2]);
    }
    doc.addImage({
        imageData: base64,
        x: padding,
        y: padding,
        width,
        height,
    });
    doc.save(FILE_NAME);
}

/**
 * Sanitizes a chart name for use in a file name (replaces characters that
 * are illegal on Windows / macOS / Linux).
 */
export const sanitizeFileName = (name: string): string =>
    name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'lightdash_chart';

const aspectRatioSuffix: Record<ExportAspectRatio, string> = {
    [ExportAspectRatio.ORIGINAL]: '',
    [ExportAspectRatio.A16x9]: '_16x9',
    [ExportAspectRatio.A9x16]: '_9x16',
    [ExportAspectRatio.A4x3]: '_4x3',
    [ExportAspectRatio.A3x4]: '_3x4',
};

/**
 * Returns a file name (without extension) for an exported chart.
 * The caller appends the extension (e.g. `.png`).
 */
export const getExportFileBaseName = (
    aspectRatio: ExportAspectRatio,
    chartName?: string,
    isBackgroundTransparent?: boolean,
): string => {
    const prefix = chartName ? sanitizeFileName(chartName) : FILE_NAME;
    const ratioSuffix = aspectRatioSuffix[aspectRatio] ?? '';
    const bgSuffix = isBackgroundTransparent ? '_透明色' : '_白色';
    return `${prefix}${ratioSuffix}${bgSuffix}`;
};

/**
 * Returns the output dimensions (px) for the given ratio assuming the source
 * chart has the supplied dimensions. Useful for showing the user the
 * resulting image size before they click Download.
 */
export const getExportOutputDimensions = (
    srcWidth: number,
    srcHeight: number,
    ratio: ExportAspectRatio,
): { w: number; h: number } => {
    const dims = computeExportDimensions(srcWidth, srcHeight, ratio);
    return { w: dims.targetW, h: dims.targetH };
};
