import { randomUUID } from 'crypto';
import { S3Client } from '../clients/Aws/S3Client';
import { BaseService } from './BaseService';

type OssServiceArguments = {
    s3Client: S3Client;
};

export class OssService extends BaseService {
    private s3Client: S3Client;

    constructor({ s3Client }: OssServiceArguments) {
        super({ serviceName: 'OssService' });
        this.s3Client = s3Client;
    }

    async getUploadUrl(
        userUuid: string,
        fileName: string,
        contentType: string,
        fileSize?: number,
    ): Promise<{ uploadUrl: string; fileId: string }> {
        const fileId = `${userUuid}/${randomUUID()}/${fileName}`;
        const uploadUrl = await this.s3Client.getUploadPresignedUrl(
            fileId,
            contentType,
        );

        return {
            uploadUrl,
            fileId,
        };
    }
}
