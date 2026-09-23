#!/bin/bash
# 把独立 CLI tgz 传到 OSS，路径与前端 static 分开：
#   {CDN_PATH_PREFIX}/cli/{VERSION}/lightdash-cli-{VERSION}.tgz
# 同版本已存在则失败，不覆盖。
#
# 环境变量：
#   VERSION            必填，与文件名里的版本一致（如 2.1.6）
#   CDN_PROVIDER       必填，aliyun 或 aws
#   S3_BUCKET          必填
#   S3_ACCESS_KEY / S3_SECRET_KEY  必填
#   S3_ENDPOINT        aliyun 可选，默认 oss-cn-hangzhou.aliyuncs.com
#   S3_REGION          aws 可选
#   CDN_PATH_PREFIX    可选，默认 msy-x
#   CLI_TGZ            可选，默认 packages/cli/release/lightdash-cli-${VERSION}.tgz
#   CDN_BASE_URL       可选，仅用于打印公开安装地址

set -euo pipefail

if [ -z "${VERSION:-}" ]; then
    echo "Error: VERSION environment variable is required"
    exit 1
fi

if [ -z "${CDN_PROVIDER:-}" ]; then
    echo "Error: CDN_PROVIDER environment variable is required (aliyun or aws)"
    exit 1
fi

if [ -z "${S3_BUCKET:-}" ]; then
    echo "Error: S3_BUCKET environment variable is required"
    exit 1
fi

if [ -z "${S3_ACCESS_KEY:-}" ] || [ -z "${S3_SECRET_KEY:-}" ]; then
    echo "Error: S3_ACCESS_KEY and S3_SECRET_KEY are required"
    exit 1
fi

CDN_PREFIX="${CDN_PATH_PREFIX:-msy-x}"
CDN_PREFIX="${CDN_PREFIX#/}"
UPLOAD_PATH="${CDN_PREFIX}/cli/${VERSION}"
TGZ_NAME="lightdash-cli-${VERSION}.tgz"
TGZ_PATH="${CLI_TGZ:-packages/cli/release/${TGZ_NAME}}"

if [ ! -f "$TGZ_PATH" ]; then
    echo "Error: tgz not found: $TGZ_PATH"
    echo "先 pnpm -F cli pack:standalone，或设置 CLI_TGZ"
    exit 1
fi

EXPECTED_BASENAME="$(basename "$TGZ_PATH")"
if [ "$EXPECTED_BASENAME" != "$TGZ_NAME" ]; then
    echo "Error: file name ${EXPECTED_BASENAME} != ${TGZ_NAME}（VERSION=${VERSION}）"
    exit 1
fi

SHA_PATH="${TGZ_PATH}.sha256"
if command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "$TGZ_PATH")" && sha256sum "$TGZ_NAME" > "$(basename "$SHA_PATH")")
elif command -v shasum >/dev/null 2>&1; then
    (cd "$(dirname "$TGZ_PATH")" && shasum -a 256 "$TGZ_NAME" > "$(basename "$SHA_PATH")")
else
    echo "Error: sha256sum or shasum is required"
    exit 1
fi

OSS_OBJECT="${UPLOAD_PATH}/${TGZ_NAME}"
SHA_OBJECT="${UPLOAD_PATH}/${TGZ_NAME}.sha256"
CACHE_META="Cache-Control:public, max-age=31536000, immutable"

echo "Uploading CLI tgz to CDN..."
echo "Provider: $CDN_PROVIDER"
echo "Version: $VERSION"
echo "Source: $TGZ_PATH"
echo "Object: $OSS_OBJECT"

ensure_ossutil() {
    if command -v ossutil64 >/dev/null 2>&1 || command -v ossutil >/dev/null 2>&1; then
        return
    fi
    echo "Installing ossutil..."
    OSSUTIL_VERSION="1.7.14"
    OSSUTIL_URL="https://gosspublic.alicdn.com/ossutil/${OSSUTIL_VERSION}/ossutil64"
    if [[ "${OSTYPE:-}" == darwin* ]]; then
        OSSUTIL_URL="https://gosspublic.alicdn.com/ossutil/${OSSUTIL_VERSION}/ossutilmac64"
    fi
    curl -fsSL -o /tmp/ossutil "$OSSUTIL_URL"
    chmod +x /tmp/ossutil
    export PATH="/tmp:$PATH"
}

if [ "$CDN_PROVIDER" = "aliyun" ]; then
    ensure_ossutil
    OSSUTIL_CMD="$(command -v ossutil64 || command -v ossutil || echo /tmp/ossutil)"

    OSS_ENDPOINT="${S3_ENDPOINT:-oss-cn-hangzhou.aliyuncs.com}"
    if [[ "$OSS_ENDPOINT" == *aliyun.com* ]] && [[ "$OSS_ENDPOINT" != *aliyuncs.com* ]]; then
        OSS_ENDPOINT="${OSS_ENDPOINT//aliyun.com/aliyuncs.com}"
        echo "Compatibility: replaced aliyun.com with aliyuncs.com in endpoint"
    fi

    echo "Using OSS endpoint: $OSS_ENDPOINT"
    echo "Using OSS bucket: $S3_BUCKET"

    "$OSSUTIL_CMD" config \
        --endpoint="$OSS_ENDPOINT" \
        --access-key-id="$S3_ACCESS_KEY" \
        --access-key-secret="$S3_SECRET_KEY"

    if "$OSSUTIL_CMD" stat "oss://${S3_BUCKET}/${OSS_OBJECT}" >/dev/null 2>&1; then
        echo "Error: oss://${S3_BUCKET}/${OSS_OBJECT} already exists; do not overwrite. bump-cli a new version."
        exit 1
    fi

    if ! "$OSSUTIL_CMD" cp "$TGZ_PATH" "oss://${S3_BUCKET}/${OSS_OBJECT}" \
        --meta "$CACHE_META" \
        --meta "Content-Type:application/gzip"; then
        echo "Error: Failed to upload $TGZ_NAME"
        exit 1
    fi

    if ! "$OSSUTIL_CMD" cp "$SHA_PATH" "oss://${S3_BUCKET}/${SHA_OBJECT}" \
        --meta "$CACHE_META" \
        --meta "Content-Type:text/plain"; then
        echo "Error: Failed to upload ${TGZ_NAME}.sha256"
        exit 1
    fi

    echo "Upload completed to Aliyun OSS"
elif [ "$CDN_PROVIDER" = "aws" ]; then
    if ! command -v aws >/dev/null 2>&1; then
        echo "Error: AWS CLI is required but not installed"
        exit 1
    fi

    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
    if [ -n "${S3_REGION:-}" ]; then
        export AWS_DEFAULT_REGION="$S3_REGION"
    fi

    if aws s3 ls "s3://${S3_BUCKET}/${OSS_OBJECT}" >/dev/null 2>&1; then
        echo "Error: s3://${S3_BUCKET}/${OSS_OBJECT} already exists; do not overwrite. bump-cli a new version."
        exit 1
    fi

    aws s3 cp "$TGZ_PATH" "s3://${S3_BUCKET}/${OSS_OBJECT}" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "application/gzip"
    aws s3 cp "$SHA_PATH" "s3://${S3_BUCKET}/${SHA_OBJECT}" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "text/plain"

    echo "Upload completed to AWS S3"
else
    echo "Error: Unsupported CDN_PROVIDER: $CDN_PROVIDER"
    echo "Supported providers: aliyun, aws"
    exit 1
fi

PUBLIC_HOST="${CDN_BASE_URL:-https://img0.banmahui.cn}"
PUBLIC_HOST="${PUBLIC_HOST%/}"
echo "Public install URL: ${PUBLIC_HOST}/${OSS_OBJECT}"
echo "CLI tgz uploaded successfully to ${OSS_OBJECT}"
