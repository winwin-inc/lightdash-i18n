#!/bin/bash

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

# Build upload path using CDN_PATH_PREFIX (default: lightdash)
CDN_PREFIX="${CDN_PATH_PREFIX:-lightdash}"
UPLOAD_PATH="${CDN_PREFIX}/static/${VERSION}/"

echo "Uploading static files to CDN..."
echo "Provider: $CDN_PROVIDER"
echo "Version: $VERSION"
echo "Upload path: $UPLOAD_PATH"

FRONTEND_BUILD_DIR="packages/frontend/build"

if [ ! -d "$FRONTEND_BUILD_DIR" ]; then
    echo "Error: Frontend build directory not found: $FRONTEND_BUILD_DIR"
    echo "Please build the frontend first: pnpm -F frontend build"
    exit 1
fi

# Function to set cache headers based on file path
set_cache_headers() {
    local file_path=$1
    local cache_control=""
    
    if [[ "$file_path" == *"/assets/"* ]]; then
        # Long-term cache for JS/CSS assets
        cache_control="public, max-age=31536000, immutable"
    elif [[ "$file_path" == *"/index.html" ]]; then
        # No cache for HTML
        cache_control="no-cache, must-revalidate"
    else
        # Short-term cache for other files
        cache_control="public, max-age=86400"
    fi
    
    echo "$cache_control"
}

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
    
    # Configure ossutil
    $OSSUTIL_CMD config \
        --endpoint="${S3_ENDPOINT:-oss-cn-hangzhou.aliyuncs.com}" \
        --access-key-id="$S3_ACCESS_KEY" \
        --access-key-secret="$S3_SECRET_KEY"
    
    # Upload files with appropriate cache headers
    echo "Uploading files to Aliyun OSS..."
    
    # Upload assets with long-term cache
    find "$FRONTEND_BUILD_DIR/assets" -type f -exec $OSSUTIL_CMD cp {} "oss://${S3_BUCKET}/${UPLOAD_PATH}assets/$(basename {})" \
        --meta "Cache-Control:public, max-age=31536000, immutable" \; 2>/dev/null || true
    
    # Upload index.html with no-cache
    if [ -f "$FRONTEND_BUILD_DIR/index.html" ]; then
        $OSSUTIL_CMD cp "$FRONTEND_BUILD_DIR/index.html" "oss://${S3_BUCKET}/${UPLOAD_PATH}index.html" \
            --meta "Cache-Control:no-cache, must-revalidate"
    fi
    
    # Upload other files with short-term cache
    find "$FRONTEND_BUILD_DIR" -type f \
        ! -path "*/assets/*" \
        ! -name "index.html" \
        -exec $OSSUTIL_CMD cp {} "oss://${S3_BUCKET}/${UPLOAD_PATH}$(basename {})" \
        --meta "Cache-Control:public, max-age=86400" \; 2>/dev/null || true
    
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
    
    # Upload assets with long-term cache
    aws s3 sync "$FRONTEND_BUILD_DIR/assets" "s3://${S3_BUCKET}/${UPLOAD_PATH}assets/" \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "*" --include "*.js" --include "*.css" --include "*.map"
    
    # Upload index.html with no-cache
    if [ -f "$FRONTEND_BUILD_DIR/index.html" ]; then
        aws s3 cp "$FRONTEND_BUILD_DIR/index.html" "s3://${S3_BUCKET}/${UPLOAD_PATH}index.html" \
            --cache-control "no-cache, must-revalidate"
    fi
    
    # Upload other files with short-term cache
    aws s3 sync "$FRONTEND_BUILD_DIR" "s3://${S3_BUCKET}/${UPLOAD_PATH}" \
        --cache-control "public, max-age=86400" \
        --exclude "assets/*" \
        --exclude "index.html"
    
    echo "Upload completed to AWS S3"
    
else
    echo "Error: Unsupported CDN_PROVIDER: $CDN_PROVIDER"
    echo "Supported providers: aliyun, aws"
    exit 1
fi

echo "Static files uploaded successfully to ${UPLOAD_PATH}"
