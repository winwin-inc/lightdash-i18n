#!/bin/bash
# 将前端静态资源（assets、locales 等）上传到 CDN/OSS。
# 注意：index.html 不上传，必须由后端动态返回（注入 <base> 等），否则页面会拿到未注入的 HTML，资源路径错误。
# 若域名解析到 CDN，需在 CDN 配置中将页面请求（/ 及 SPA 路径）回源到后端，仅静态路径（如 /msy-x/static/*）从 OSS 取。

set -e

# Check required environment variables
if [ -z "$VERSION" ]; then
    echo "Error: VERSION environment variable is required"
    exit 1
fi

if [ -z "$CDN_PROVIDER" ]; then
    echo "Error: CDN_PROVIDER environment variable is required (aliyun or aws)"
    exit 1
fi

# Build upload path using CDN_PATH_PREFIX (default: msy-x), strip leading slash for OSS
CDN_PREFIX="${CDN_PATH_PREFIX:-msy-x}"
CDN_PREFIX="${CDN_PREFIX#/}"
UPLOAD_PATH="${CDN_PREFIX}/static/${VERSION}/"
UPLOAD_PATH="${UPLOAD_PATH#/}"

echo "Uploading static files to CDN..."
echo "Provider: $CDN_PROVIDER"
echo "Version: $VERSION"
echo "Upload path: $UPLOAD_PATH"

# 支持从环境变量覆盖（如 CI 从镜像提取的目录）
FRONTEND_BUILD_DIR="${FRONTEND_BUILD_DIR:-packages/frontend/build}"

if [ ! -d "$FRONTEND_BUILD_DIR" ]; then
    echo "Error: Frontend build directory not found: $FRONTEND_BUILD_DIR"
    echo "Please build the frontend first: pnpm -F frontend build"
    exit 1
fi

if [ "$CDN_PROVIDER" = "aliyun" ]; then
    # Aliyun OSS upload using ossutil
    if [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
        echo "Error: S3_ACCESS_KEY and S3_SECRET_KEY are required for Aliyun OSS"
        exit 1
    fi
    
    if [ -z "$S3_BUCKET" ]; then
        echo "Error: S3_BUCKET environment variable is required"
        exit 1
    fi
    
    # Install ossutil if not present
    if ! command -v ossutil64 &> /dev/null && ! command -v ossutil &> /dev/null; then
        echo "Installing ossutil..."
        OSSUTIL_VERSION="1.7.14"
        OSSUTIL_URL="https://gosspublic.alicdn.com/ossutil/${OSSUTIL_VERSION}/ossutil64"
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            OSSUTIL_URL="https://gosspublic.alicdn.com/ossutil/${OSSUTIL_VERSION}/ossutilmac64"
        fi
        
        curl -o /tmp/ossutil "$OSSUTIL_URL"
        chmod +x /tmp/ossutil
        export PATH="/tmp:$PATH"
    fi
    
    OSSUTIL_CMD=$(command -v ossutil64 || command -v ossutil || echo "/tmp/ossutil")
    
    # Use S3_ENDPOINT with compatibility fix for domain name
    OSS_ENDPOINT="${S3_ENDPOINT:-oss-cn-hangzhou.aliyuncs.com}"
    
    # Compatibility: Replace aliyun.com with aliyuncs.com (for compatibility with some configurations)
    # Official endpoint uses aliyuncs.com, but some configurations may use aliyun.com
    if [[ "$OSS_ENDPOINT" == *"aliyun.com"* ]] && [[ "$OSS_ENDPOINT" != *"aliyuncs.com"* ]]; then
        OSS_ENDPOINT="${OSS_ENDPOINT//aliyun.com/aliyuncs.com}"
        echo "⚠️  Compatibility: Replaced aliyun.com with aliyuncs.com in endpoint"
    fi
    
    echo "Using OSS endpoint: $OSS_ENDPOINT"
    echo "Using OSS bucket: $S3_BUCKET"
    
    # Configure ossutil
    $OSSUTIL_CMD config \
        --endpoint="$OSS_ENDPOINT" \
        --access-key-id="$S3_ACCESS_KEY" \
        --access-key-secret="$S3_SECRET_KEY"
    
    # Upload files with appropriate cache headers
    echo "Uploading files to Aliyun OSS..."
    
    # Check if assets directory exists
    if [ ! -d "$FRONTEND_BUILD_DIR/assets" ]; then
        echo "Warning: Assets directory not found: $FRONTEND_BUILD_DIR/assets"
    else
        ASSET_COUNT=$(find "$FRONTEND_BUILD_DIR/assets" -type f | wc -l)
        echo "Found $ASSET_COUNT files in assets directory"
    fi
    
    # Upload assets with long-term cache and correct Content-Type
    # Loop per file so we can fail fast and verify each upload
    UPLOAD_PATH_NO_SLASH="${UPLOAD_PATH%/}"
    EXPECTED_ASSET_COUNT=0
    echo "Uploading assets files..."
    while IFS= read -r -d '' FILE_PATH; do
        FILENAME=$(basename "$FILE_PATH")
        EXTENSION="${FILENAME##*.}"
        case "$EXTENSION" in
            js|mjs) CONTENT_TYPE="application/javascript" ;;
            css)    CONTENT_TYPE="text/css" ;;
            json)   CONTENT_TYPE="application/json" ;;
            woff2)  CONTENT_TYPE="font/woff2" ;;
            *)      CONTENT_TYPE="application/octet-stream" ;;
        esac
        if ! $OSSUTIL_CMD cp "$FILE_PATH" "oss://$S3_BUCKET/${UPLOAD_PATH_NO_SLASH}/assets/$FILENAME" \
            --meta "Cache-Control:public, max-age=31536000, immutable" \
            --meta "Content-Type:$CONTENT_TYPE"; then
            echo "Error: Failed to upload $FILENAME"
            exit 1
        fi
        EXPECTED_ASSET_COUNT=$((EXPECTED_ASSET_COUNT + 1))
    done < <(find "$FRONTEND_BUILD_DIR/assets" -type f -print0)

    echo "Uploaded $EXPECTED_ASSET_COUNT asset files to OSS"

    # 注意：不将 index.html 上传到 CDN。页面 HTML 必须由后端提供，以便注入 <base> 等 CDN 配置；
    # 若 CDN 提供 index.html，用户会拿到未注入的版本，导致静态资源路径错误。
    
    # Upload locales directory (translation files) - same path pattern as assets, no leading slash
    if [ -d "$FRONTEND_BUILD_DIR/locales" ]; then
        echo "Uploading locales files..."
        while IFS= read -r -d '' FILE_PATH; do
            RELATIVE_PATH="${FILE_PATH#$FRONTEND_BUILD_DIR/}"
            if ! $OSSUTIL_CMD cp "$FILE_PATH" "oss://$S3_BUCKET/${UPLOAD_PATH_NO_SLASH}/${RELATIVE_PATH}" --meta "Cache-Control:public, max-age=86400"; then
                echo "Error: Failed to upload $RELATIVE_PATH"
                exit 1
            fi
        done < <(find "$FRONTEND_BUILD_DIR/locales" -type f -print0)
    else
        echo "Warning: Locales directory not found: $FRONTEND_BUILD_DIR/locales"
    fi

    # Upload fonts directory with long-term cache (font files are immutable)
    if [ -d "$FRONTEND_BUILD_DIR/fonts" ]; then
        echo "Uploading fonts files..."
        while IFS= read -r -d '' FILE_PATH; do
            RELATIVE_PATH="${FILE_PATH#$FRONTEND_BUILD_DIR/}"
            if ! $OSSUTIL_CMD cp "$FILE_PATH" "oss://$S3_BUCKET/${UPLOAD_PATH_NO_SLASH}/${RELATIVE_PATH}" --meta "Cache-Control:public, max-age=31536000, immutable"; then
                echo "Error: Failed to upload $RELATIVE_PATH"
                exit 1
            fi
        done < <(find "$FRONTEND_BUILD_DIR/fonts" -type f -print0)
    else
        echo "Warning: Fonts directory not found: $FRONTEND_BUILD_DIR/fonts"
    fi

    # Upload other files with short-term cache (excluding assets, locales, fonts, and index.html)
    while IFS= read -r -d '' FILE_PATH; do
        RELATIVE_PATH="${FILE_PATH#$FRONTEND_BUILD_DIR/}"
        if ! $OSSUTIL_CMD cp "$FILE_PATH" "oss://$S3_BUCKET/${UPLOAD_PATH_NO_SLASH}/${RELATIVE_PATH}" --meta "Cache-Control:public, max-age=86400"; then
            echo "Error: Failed to upload $RELATIVE_PATH"
            exit 1
        fi
    done < <(find "$FRONTEND_BUILD_DIR" -type f \
        ! -path "*/assets/*" \
        ! -path "*/locales/*" \
        ! -path "*/fonts/*" \
        ! -name "index.html" \
        -print0)
    
    echo "Upload completed to Aliyun OSS"
    
elif [ "$CDN_PROVIDER" = "aws" ]; then
    # AWS S3 upload using AWS CLI
    if ! command -v aws &> /dev/null; then
        echo "Error: AWS CLI is required but not installed"
        exit 1
    fi
    
    if [ -z "$S3_BUCKET" ]; then
        echo "Error: S3_BUCKET environment variable is required"
        exit 1
    fi
    
    # Set AWS credentials from S3_* environment variables
    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
    if [ -n "$S3_REGION" ]; then
        export AWS_DEFAULT_REGION="$S3_REGION"
    fi
    
    echo "Uploading files to AWS S3..."
    
    # Upload assets with long-term cache and correct Content-Type
    # Upload JS files with application/javascript Content-Type
    aws s3 sync "$FRONTEND_BUILD_DIR/assets" "s3://${S3_BUCKET}/${UPLOAD_PATH}assets/" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "application/javascript" \
        --exclude "*" --include "*.js" --include "*.mjs"
    
    # Upload CSS files with text/css Content-Type
    aws s3 sync "$FRONTEND_BUILD_DIR/assets" "s3://${S3_BUCKET}/${UPLOAD_PATH}assets/" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "text/css" \
        --exclude "*" --include "*.css"
    
    # Upload source map files
    aws s3 sync "$FRONTEND_BUILD_DIR/assets" "s3://${S3_BUCKET}/${UPLOAD_PATH}assets/" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "application/json" \
        --exclude "*" --include "*.map"
    
    # 注意：不将 index.html 上传到 CDN。页面 HTML 必须由后端提供，以便注入 <base> 等 CDN 配置。
    
    # Upload locales directory (translation files)
    if [ -d "$FRONTEND_BUILD_DIR/locales" ]; then
        echo "Uploading locales files..."
        aws s3 sync "$FRONTEND_BUILD_DIR/locales" "s3://${S3_BUCKET}/${UPLOAD_PATH}locales/" \
            --cache-control "public, max-age=86400"
    else
        echo "Warning: Locales directory not found: $FRONTEND_BUILD_DIR/locales"
    fi
    
    # Upload fonts directory with long-term cache
    if [ -d "$FRONTEND_BUILD_DIR/fonts" ]; then
        echo "Uploading fonts files..."
        aws s3 sync "$FRONTEND_BUILD_DIR/fonts" "s3://${S3_BUCKET}/${UPLOAD_PATH}fonts/" \
            --cache-control "public, max-age=31536000, immutable"
    else
        echo "Warning: Fonts directory not found: $FRONTEND_BUILD_DIR/fonts"
    fi
    
    # Upload other files with short-term cache
    aws s3 sync "$FRONTEND_BUILD_DIR" "s3://${S3_BUCKET}/${UPLOAD_PATH}" \
        --cache-control "public, max-age=86400" \
        --exclude "assets/*" \
        --exclude "locales/*" \
        --exclude "fonts/*" \
        --exclude "index.html"
    
    echo "Upload completed to AWS S3"
    
else
    echo "Error: Unsupported CDN_PROVIDER: $CDN_PROVIDER"
    echo "Supported providers: aliyun, aws"
    exit 1
fi

echo "Static files uploaded successfully to ${UPLOAD_PATH}"
