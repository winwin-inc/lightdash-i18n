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

# Build upload path using CDN_PATH_PREFIX (default: msy-x)
CDN_PREFIX="${CDN_PATH_PREFIX:-msy-x}"
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
    
    # Upload assets with long-term cache
    # Use find with -exec sh -c to properly extract filename and upload to correct path
    # Export variables to make them available in sh -c
    export OSSUTIL_CMD S3_BUCKET UPLOAD_PATH
    # Remove trailing slash from UPLOAD_PATH if present, then add /assets/
    echo "Uploading assets files..."
    find "$FRONTEND_BUILD_DIR/assets" -type f -exec sh -c "UPLOAD_PATH_NO_SLASH=\${UPLOAD_PATH%/}; $OSSUTIL_CMD cp \"\$1\" \"oss://\$S3_BUCKET/\${UPLOAD_PATH_NO_SLASH}/assets/\$(basename \"\$1\")\" --meta \"Cache-Control:public, max-age=31536000, immutable\"" _ {} \; || {
        echo "Error uploading assets files"
        exit 1
    }
    
    # Upload index.html with no-cache
    if [ -f "$FRONTEND_BUILD_DIR/index.html" ]; then
        $OSSUTIL_CMD cp "$FRONTEND_BUILD_DIR/index.html" "oss://${S3_BUCKET}/${UPLOAD_PATH}index.html" \
            --meta "Cache-Control:no-cache, must-revalidate"
    fi
    
    # Upload locales directory (translation files)
    if [ -d "$FRONTEND_BUILD_DIR/locales" ]; then
        echo "Uploading locales files..."
        find "$FRONTEND_BUILD_DIR/locales" -type f -exec sh -c "UPLOAD_PATH_NO_SLASH=\${UPLOAD_PATH%/}; RELATIVE_PATH=\${1#$FRONTEND_BUILD_DIR/}; $OSSUTIL_CMD cp \"\$1\" \"oss://\$S3_BUCKET/\${UPLOAD_PATH_NO_SLASH}/\${RELATIVE_PATH}\" --meta \"Cache-Control:public, max-age=86400\"" _ {} \; || {
            echo "Error uploading locales files"
            exit 1
        }
    else
        echo "Warning: Locales directory not found: $FRONTEND_BUILD_DIR/locales"
    fi
    
    # Upload other files with short-term cache (excluding assets, index.html, and locales)
    # Use find with -exec sh -c to properly handle basename
    find "$FRONTEND_BUILD_DIR" -type f \
        ! -path "*/assets/*" \
        ! -path "*/locales/*" \
        ! -name "index.html" \
        -exec sh -c "$OSSUTIL_CMD cp \"\$1\" \"oss://\$S3_BUCKET/\$UPLOAD_PATH\$(basename \"\$1\")\" --meta \"Cache-Control:public, max-age=86400\"" _ {} \; 2>/dev/null || true
    
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
    
    # Upload locales directory (translation files)
    if [ -d "$FRONTEND_BUILD_DIR/locales" ]; then
        echo "Uploading locales files..."
        aws s3 sync "$FRONTEND_BUILD_DIR/locales" "s3://${S3_BUCKET}/${UPLOAD_PATH}locales/" \
            --cache-control "public, max-age=86400"
    else
        echo "Warning: Locales directory not found: $FRONTEND_BUILD_DIR/locales"
    fi
    
    # Upload other files with short-term cache
    aws s3 sync "$FRONTEND_BUILD_DIR" "s3://${S3_BUCKET}/${UPLOAD_PATH}" \
        --cache-control "public, max-age=86400" \
        --exclude "assets/*" \
        --exclude "locales/*" \
        --exclude "index.html"
    
    echo "Upload completed to AWS S3"
    
else
    echo "Error: Unsupported CDN_PROVIDER: $CDN_PROVIDER"
    echo "Supported providers: aliyun, aws"
    exit 1
fi

echo "Static files uploaded successfully to ${UPLOAD_PATH}"
