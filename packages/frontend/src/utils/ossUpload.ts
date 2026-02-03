import {
    ApiOssUploadUrlRequest,
    ApiOssUploadUrlResponse,
} from '@lightdash/common';
import { lightdashApi } from '../api';

export interface UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

/**
 * Upload file to OSS using presigned URL
 * @param file File to upload
 * @param onProgress Optional progress callback
 * @returns Promise resolving to fileId
 */
export const uploadFileToOss = async (
    file: File,
    onProgress?: (progress: UploadProgress) => void,
): Promise<{ fileId: string }> => {
    // Step 1: Get presigned URL from backend
    const { uploadUrl, fileId } = await lightdashApi<
        ApiOssUploadUrlResponse['results']
    >({
        url: '/oss/upload-url',
        method: 'POST',
        body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            fileSize: file.size,
        } satisfies ApiOssUploadUrlRequest),
    });

    // Step 2: Upload file directly to OSS using presigned URL
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress) {
                onProgress({
                    loaded: event.loaded,
                    total: event.total,
                    percentage: Math.round((event.loaded / event.total) * 100),
                });
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ fileId });
            } else {
                reject(
                    new Error(
                        `Upload failed with status ${xhr.status}: ${xhr.statusText}`,
                    ),
                );
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            reject(new Error('Upload failed due to network error'));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error('Upload was aborted'));
        });

        // Start upload
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
    });
};
