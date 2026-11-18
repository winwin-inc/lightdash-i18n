import { compile } from 'handlebars';

export const oauthPageStyles = `
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Open Sans', 'Helvetica Neue', sans-serif;
        background-color: #f8fafc;
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1.4;
    }
    .container {
        background: white;
        border-radius: 4px;
        border: 1px solid #e9ecef;
        box-shadow: 0px 1px 2px 0px rgba(10, 13, 18, 0.05);
        padding: 24px;
        max-width: 400px;
        width: 90%;
        text-align: center;
    }
    h1 {
        color: #111418;
        margin: 0 0 16px 0;
        font-size: 20px;
        font-weight: 600;
        text-align: center;
    }
    p {
        color: #6c757d;
        margin: 0 0 12px 0;
        line-height: 1.4;
        font-size: 14px;
    }
    .success h1 {
        color: #10b981;
    }
    .error h1 {
        color: #ef4444;
    }
    .icon {
        width: 32px;
        height: 32px;
        margin: 0 auto 16px auto;
        display: block;
    }
    .success .icon {
        color: #10b981;
    }
    .error .icon {
        color: #ef4444;
    }
    .stack {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
`;

// OAuth response HTML template
const OAUTH_RESPONSE_TEMPLATE = `
<html>
    <head>
        <style>{{{styles}}}</style>
    </head>
    <body>
        <div class="stack">
            <div class="container {{status}}">
                <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {{{icon}}}
                </svg>
                <h1>{{title}}</h1>
                {{#each messages}}
                <p>{{this}}</p>
                {{/each}}
            </div>
        </div>
    </body>
</html>
`;

// OAuth authorization page template
const OAUTH_AUTHORIZE_TEMPLATE = `
<html>
    <head>
        <title>授权确认</title>
        <style>
            {{{styles}}}
            .container, .container p, .container strong, .container form { text-align: center; }
            .container p { margin-left: auto; margin-right: auto; }
            .oauth-desc { margin-bottom: 18px; color: #374151; font-size: 12px; }
            .oauth-btn-row { display: flex; justify-content: center; gap: 12px; margin-top: 18px; }
            .oauth-btn {
                padding: 8px 24px;
                border: none;
                border-radius: 4px;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                transition: background 0.15s;
            }
            .oauth-btn.approve {
                background: #00B26F;
                color: #fff;
            }
            .oauth-btn.approve:hover {
                background: #00975E;
            }
            .oauth-btn.deny {
                background: #E03131;
                color: #fff;
            }
            .oauth-btn.deny:hover {
                background: #B32525;
            }
        </style>
    </head>
    <body>
        <div class="stack">
            <form class="container" method="POST" action="{{action}}">
                <h1>授权确认</h1>
                <p class="oauth-desc">
                    该应用正在请求通过 OAuth 访问你的账号。<br/>
                    允许后，以下应用将按其申请的权限代表你执行操作，无需分享你的密码。
                </p>
                <p>应用： <b>{{client_id}}</b></p>
                <p>权限范围： <b>{{scope}}</b></p>
                
                {{#each hiddenInputs}}
                <input type="hidden" name="{{name}}" value="{{value}}" />
                {{/each}}
                
                <p>登录身份： <b>{{user.firstName}} {{user.lastName}}</b></p>
                <p>所属组织： <b>{{user.organizationName}}</b></p>

                <div class="oauth-btn-row">
                    <button type="submit" name="approve" value="true" class="oauth-btn approve">允许</button>
                    <button type="submit" name="approve" value="false" class="oauth-btn deny">拒绝</button>
                </div>
            </form>
        </div>
    </body>
</html>
`;

// SVG icons for different response types
const OAUTH_ICONS = {
    success:
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    error: '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    sessionExpired:
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

// OAuth redirect page template
const OAUTH_REDIRECT_TEMPLATE = `
<html>
    <head>
        <title>正在跳转…</title>
        <style>
            {{{styles}}}
            .spinner {
                width: 32px;
                height: 32px;
                margin: 0 auto 16px auto;
                border: 3px solid #e9ecef;
                border-top: 3px solid #00B26F;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .redirect-link {
                color: #00B26F;
                text-decoration: none;
                font-weight: 600;
            }
            .redirect-link:hover {
                text-decoration: underline;
            }
        </style>
        <script>
            setTimeout(function() {
                window.location.href = "{{{redirectUrl}}}";
            }, 2000);
        </script>
    </head>
    <body>
        <div class="stack">
            <div class="container">
                <div class="spinner"></div>
                <h1>正在跳转…</h1>
                <p>{{message}}</p>
                <p>若未自动跳转，请 <a href="{{{redirectUrl}}}" class="redirect-link">点击这里</a>。</p>
            </div>
        </div>
    </body>
</html>
`;

// OAuth device flow (RFC 8628) confirmation page template
const OAUTH_DEVICE_TEMPLATE = `
<html>
    <head>
        <title>终端登录确认</title>
        <style>
            {{{styles}}}
            .container, .container p, .container form { text-align: center; }
            .user-code {
                font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 28px;
                letter-spacing: 4px;
                color: #111418;
                background: #f1f5f9;
                border-radius: 4px;
                padding: 12px 8px;
                margin: 16px 0;
            }
            .oauth-btn-row { display: flex; justify-content: center; gap: 12px; margin-top: 18px; }
            .oauth-btn {
                padding: 8px 24px;
                border: none;
                border-radius: 4px;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                transition: background 0.15s;
            }
            .oauth-btn.approve {
                background: #00B26F;
                color: #fff;
            }
            .oauth-btn.approve:hover {
                background: #00975E;
            }
            .oauth-btn.deny {
                background: #E03131;
                color: #fff;
            }
            .oauth-btn.deny:hover {
                background: #B32525;
            }
            .login-hint {
                font-size: 13px;
                color: #6b7280;
                line-height: 1.5;
                margin: 14px 0 0;
            }
        </style>
    </head>
    <body>
        <div class="stack">
            <form class="container" method="POST" action="{{action}}">
                <h1>终端登录确认</h1>
                <p>一个 CLI 会话正在请求访问你的账号。</p>
                <p>请核对下方验证码与终端中显示的是否一致：</p>
                <div class="user-code">{{userCode}}</div>
                {{#if loginHint}}
                <p class="login-hint">{{loginHint}}</p>
                {{/if}}
                {{#each hiddenInputs}}
                <input type="hidden" name="{{name}}" value="{{value}}" />
                {{/each}}
                <p>登录身份： <b>{{user.firstName}} {{user.lastName}}</b></p>
                <p>所属组织： <b>{{user.organizationName}}</b></p>
                <div class="oauth-btn-row">
                    <button type="submit" name="approve" value="true" class="oauth-btn approve">允许</button>
                    <button type="submit" name="approve" value="false" class="oauth-btn deny">拒绝</button>
                </div>
            </form>
        </div>
    </body>
</html>
`;

// Compile the templates once with proper type safety
const compiledResponseTemplate = compile(OAUTH_RESPONSE_TEMPLATE);
const compiledAuthorizeTemplate = compile(OAUTH_AUTHORIZE_TEMPLATE);
const compiledRedirectTemplate = compile(OAUTH_REDIRECT_TEMPLATE);
const compiledDeviceTemplate = compile(OAUTH_DEVICE_TEMPLATE);

export type OAuthResponseStatus = 'success' | 'error';
export type OAuthIconType = keyof typeof OAUTH_ICONS;

// Types for OAuth authorization page
export interface OAuthHiddenInput {
    name: string;
    value: string;
}

export interface OAuthUser {
    firstName: string;
    lastName: string;
    organizationName: string;
}

export interface OAuthAuthorizeParams {
    action: string;
    client_id: string;
    scope: string;
    user: OAuthUser;
    hiddenInputs: OAuthHiddenInput[];
}

export interface OAuthRedirectParams {
    redirectUrl: string;
    message: string;
}

export interface OAuthDeviceParams {
    action: string;
    userCode: string;
    user: OAuthUser;
    hiddenInputs: OAuthHiddenInput[];
    /** 按站点域名生成的登录方式提示；空字符串则不渲染 */
    loginHint?: string;
}

/**
 * Generates an OAuth response HTML page using Handlebars templating
 * This prevents XSS issues by auto-escaping content while still allowing safe HTML in icons and styles
 */
export const generateOAuthResponseHtml = (
    status: OAuthResponseStatus,
    title: string,
    messages: string[],
    iconType: OAuthIconType = status === 'success' ? 'success' : 'error',
): string =>
    compiledResponseTemplate({
        styles: oauthPageStyles,
        status,
        title,
        messages,
        icon: OAUTH_ICONS[iconType],
    });

/**
 * Generates a success OAuth response
 */
export const generateOAuthSuccessResponse = (
    title: string = '登录成功！',
    messages: string[] = ['你已成功登录。', '你可以关闭此窗口并返回 CLI。'],
): string => generateOAuthResponseHtml('success', title, messages, 'success');

/**
 * Generates an error OAuth response
 */
export const generateOAuthErrorResponse = (
    title: string,
    messages: string[],
    iconType: OAuthIconType = 'error',
): string =>
    generateOAuthResponseHtml(
        'error',
        title,
        [...messages, '你可以关闭此窗口后重试。'],
        iconType,
    );

/**
 * Generates an OAuth authorization page HTML using Handlebars templating
 * This prevents XSS issues by auto-escaping all user content
 */
export const generateOAuthAuthorizePage = (
    params: OAuthAuthorizeParams,
): string =>
    compiledAuthorizeTemplate({
        styles: oauthPageStyles,
        ...params,
    });

/**
 * Generates an OAuth redirect page HTML using JavaScript redirect
 * This prevents CSP errors by using JavaScript-based redirection instead of HTTP redirects
 */
export const generateOAuthRedirectPage = (
    params: OAuthRedirectParams,
): string =>
    compiledRedirectTemplate({
        styles: oauthPageStyles,
        ...params,
    });

/**
 * Generates the device flow confirmation page (RFC 8628) shown after the
 * user scans the CLI QR code or opens the verification URL.
 */
export const generateOAuthDevicePage = (params: OAuthDeviceParams): string =>
    compiledDeviceTemplate({
        styles: oauthPageStyles,
        ...params,
    });

const WECHAT_LOGIN_HINT = '本平台使用微信扫码登录。';
const DINGTALK_LOGIN_HINT = '本平台使用钉钉扫码登录。';
const GENERIC_LOGIN_HINT = '本平台使用扫码方式登录。';

/** 按站点域名匹配登录方式提示的域名清单（支持精确或子域后缀匹配） */
export type DeviceLoginHintDomains = {
    wechat: string[];
    dingtalk: string[];
};

const hostnameMatchesAny = (hostname: string, domains: string[]): boolean =>
    domains.some((entry) => {
        const domain = entry.trim().toLowerCase();
        return (
            domain !== '' &&
            (hostname === domain || hostname.endsWith(`.${domain}`))
        );
    });

/**
 * 按站点域名解析设备码确认页的登录提示文案：
 * 微信登录平台、钉钉登录平台分别提示，都不命中时退到通用扫码提示。
 */
export const resolveDeviceLoginHint = (
    siteUrl: string,
    domains: DeviceLoginHintDomains,
): string => {
    let hostname: string;
    try {
        hostname = new URL(siteUrl).hostname.toLowerCase();
    } catch {
        return GENERIC_LOGIN_HINT;
    }
    if (hostnameMatchesAny(hostname, domains.wechat)) {
        return WECHAT_LOGIN_HINT;
    }
    if (hostnameMatchesAny(hostname, domains.dingtalk)) {
        return DINGTALK_LOGIN_HINT;
    }
    return GENERIC_LOGIN_HINT;
};
