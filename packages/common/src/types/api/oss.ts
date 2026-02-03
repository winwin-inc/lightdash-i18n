export type ApiOssUploadUrlRequest = {
    fileName: string;
    contentType: string;
    fileSize?: number;
};

export type ApiOssUploadUrlResponse = {
    status: 'ok';
    results: {
        uploadUrl: string;
        fileId: string;
    };
};
