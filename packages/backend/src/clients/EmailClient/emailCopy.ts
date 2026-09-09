export type EmailLocale = 'zh' | 'en';

export const normalizeEmailLocale = (
    value: string | null | undefined,
): EmailLocale => {
    if (!value) return 'zh';
    return value.toLowerCase().startsWith('zh') ? 'zh' : 'en';
};

type EmailCopy = {
    logoPath: string;
    brandName: string;
    privacyPolicy: string;
    joinCommunity: string;
    // invitation
    inviteSubject: string;
    inviteTitle: string;
    inviteBody: (orgName: string) => string;
    inviteCtaHint: string;
    inviteCta: string;
    inviteText: (orgName: string, inviteUrl: string) => string;
    // password
    resetSubject: string;
    resetTitle: string;
    resetBody: string;
    resetCta: string;
    resetText: (url: string) => string;
    // project access
    projectInviteSubject: (
        inviterName: string,
        projectName: string,
    ) => string;
    projectInviteTitle: (projectName: string) => string;
    projectInviteBody: (inviterName: string, roleAction: string) => string;
    projectOpenCta: string;
    projectInviteText: (
        inviterName: string,
        roleAction: string,
        projectUrl: string,
    ) => string;
    roleAction: Record<'view' | 'explore' | 'edit' | 'manage' | '', string>;
    // OTP
    otpSubject: string;
    otpIntro: string;
    otpHint: string;
    otpValid: string;
    otpQuestions: string;
    otpGlad: string;
    otpText: (passcode: string) => string;
    // gsheets
    gsheetsSubject: (name: string) => string;
    gsheetsTitle: string;
    gsheetsDescription: (name: string) => string;
    gsheetsText: (name: string) => string;
    gsheetsViewSettings: string;
    // delivery failure
    deliveryFailSubject: (name: string) => string;
    deliveryFailTitle: string;
    deliveryFailMessage: (
        name: string,
        errorMessage: string,
        schedulerUrl: string,
    ) => string;
    deliveryFailText: (
        name: string,
        errorMessage: string,
        schedulerUrl: string,
    ) => string;
    // scheduled delivery templates
    dashboardReady: string;
    chartReady: string;
    downloadCsv: string;
    truncatedTitle: string;
    truncatedDashboardBody: string;
    truncatedChartBody: string;
    truncatedHint: string;
    noResultsTitle: string;
    noResultsBody: string;
    viewDashboard: string;
    viewChart: string;
    viewInApp: string;
    scheduledDelivery: string;
    deliveredExpire: string;
    learnMore: string;
    dataAlertSubject: string;
    dataAlertDeliveryType: string;
};

const COPY: Record<EmailLocale, EmailCopy> = {
    zh: {
        logoPath: '/lightdash-logo.png',
        brandName: '马上赢X',
        privacyPolicy: '隐私政策',
        joinCommunity: '加入社区',
        inviteSubject: '邀请你加入马上赢X',
        inviteTitle: '邀请你加入马上赢X',
        inviteBody: (orgName) =>
            `你的同事邀请你加入「${orgName}」，一起在马上赢X发现并分享数据洞察。`,
        inviteCtaHint: '请在 72 小时内点击下方链接加入团队并开始探索数据。',
        inviteCta: '加入团队',
        inviteText: (orgName, inviteUrl) =>
            `你的同事邀请你加入「${orgName}」。请在 72 小时内点击链接加入马上赢X：${inviteUrl}`,
        resetSubject: '重置密码',
        resetTitle: '忘记密码了？',
        resetBody: '没关系，请在 24 小时内点击下方链接设置新密码：',
        resetCta: '重置密码',
        resetText: (url) =>
            `忘记密码了？没关系，请在 24 小时内点击链接设置新密码：${url}`,
        projectInviteSubject: (inviterName, projectName) =>
            `${inviterName} 邀请你加入项目「${projectName}」`,
        projectInviteTitle: (projectName) => `邀请你加入「${projectName}」`,
        projectInviteBody: (inviterName, roleAction) =>
            `${inviterName} 邀请你${roleAction}该项目。`,
        projectOpenCta: '打开项目',
        projectInviteText: (inviterName, roleAction, projectUrl) =>
            `${inviterName} 邀请你${roleAction}该项目：${projectUrl}`,
        roleAction: {
            view: '查看',
            explore: '探索',
            edit: '编辑',
            manage: '管理',
            '': '',
        },
        otpSubject: '验证你的邮箱',
        otpIntro: '你的一次性验证码是：',
        otpHint: '请在马上赢X中输入该验证码以完成邮箱验证。',
        otpValid: '验证码 15 分钟内有效。',
        otpQuestions: '如有问题，请联系管理员。',
        otpGlad: '欢迎加入马上赢X！',
        otpText: (passcode) =>
            `请在马上赢X中输入以下验证码以验证邮箱：${passcode}`,
        gsheetsSubject: (name) => `Google 表格同步「${name}」因错误已停用`,
        gsheetsTitle: 'Google 表格同步已停用',
        gsheetsDescription: (name) =>
            `你的 Google 表格同步「${name}」出现错误，已停用以避免继续失败。`,
        gsheetsText: (name) => `你的 Google 表格同步「${name}」因错误已停用`,
        gsheetsViewSettings: '查看 Google 表格同步设置',
        deliveryFailSubject: (name) => `定时推送发送失败 -「${name}」`,
        deliveryFailTitle: '定时推送失败',
        deliveryFailMessage: (name, errorMessage, schedulerUrl) => `
            <p>你的定时推送 <strong>「${name}」</strong> 发送失败。</p>
            <br />
            <p><strong>错误：</strong> ${errorMessage}</p>
            <br />
            <p>请检查 <a href="${schedulerUrl}">定时推送设置</a> 后重试。</p>
        `,
        deliveryFailText: (name, errorMessage, schedulerUrl) =>
            `警告：定时推送「${name}」发送失败。错误：${errorMessage}。请检查设置：${schedulerUrl}`,
        dashboardReady: '看板中的图表最新结果已可下载！',
        chartReady: '该图表的最新结果已可下载！',
        downloadCsv: '下载 CSV',
        truncatedTitle: '⚠️ 以下导出结果已被截断。',
        truncatedDashboardBody:
            '单个文件导出上限为 {{maxCells}} 个单元格，下列文件超出了限制。',
        truncatedChartBody:
            '导出上限为 {{maxCells}} 个单元格，你的文件超出了限制。',
        truncatedHint: '建议调整定时推送，减少导出结果数量。',
        noResultsTitle: '⚠️ 没有可导出的结果。',
        noResultsBody: '本次定时推送返回了空数据集。',
        viewDashboard: '在马上赢X中查看看板',
        viewChart: '在马上赢X中查看图表',
        viewInApp: '在马上赢X中查看',
        scheduledDelivery: '定时推送',
        deliveredExpire:
            '发送于 {{date}}。出于安全考虑，文件将在 {{expirationDays}} 天后过期。',
        learnMore: '了解更多',
        dataAlertSubject: '马上赢X 数据告警',
        dataAlertDeliveryType: '这是一条马上赢X数据告警通知',
    },
    en: {
        logoPath: '/lightdash-logo.png',
        brandName: 'MSYX',
        privacyPolicy: 'Privacy policy',
        joinCommunity: 'Join our community',
        inviteSubject: `You've been invited to join MSYX`,
        inviteTitle: `You've been invited to join MSYX!`,
        inviteBody: (orgName) =>
            `Your teammates at ${orgName} are using MSYX to discover and share data insights.`,
        inviteCtaHint:
            'Click on the link below within the next 72 hours to join your team and start exploring your data!',
        inviteCta: 'Join your team!',
        inviteText: (orgName, inviteUrl) =>
            `Your teammates at ${orgName} are using MSYX to discover and share data insights. Click on the link below within the next 72 hours to join your team and start exploring your data! ${inviteUrl}`,
        resetSubject: 'Reset your password',
        resetTitle: 'Forgotten your password?',
        resetBody:
            'No worries! Just click on the link below within the next 24 hours to create a new one:',
        resetCta: 'Reset your password',
        resetText: (url) =>
            `Forgotten your password? No worries! Just click on the link below within the next 24 hours to create a new one: ${url}`,
        projectInviteSubject: (inviterName, projectName) =>
            `${inviterName} invited you to ${projectName}`,
        projectInviteTitle: (projectName) =>
            `You've been invited to ${projectName}`,
        projectInviteBody: (inviterName, roleAction) =>
            `${inviterName} has invited you to ${roleAction} this project.`,
        projectOpenCta: 'Open project',
        projectInviteText: (inviterName, roleAction, projectUrl) =>
            `${inviterName} has invited you to ${roleAction} this project: ${projectUrl}`,
        roleAction: {
            view: 'view',
            explore: 'explore',
            edit: 'edit',
            manage: 'manage',
            '': '',
        },
        otpSubject: 'Verify your email address',
        otpIntro: 'Your one time password is:',
        otpHint: 'Enter this code in MSYX so we can verify your email address.',
        otpValid: 'This code is valid for 15 minutes.',
        otpQuestions: 'If you have any questions, send us an email.',
        otpGlad: "We're glad you're here!",
        otpText: (passcode) =>
            `Verify your email address by entering the following passcode in MSYX: ${passcode}`,
        gsheetsSubject: (name) =>
            `Google Sheets sync: "${name}" disabled due to error`,
        gsheetsTitle: 'Google Sheets Sync disabled',
        gsheetsDescription: (name) =>
            `There's an error with your Google Sheets "${name}" sync. We've disabled it to prevent further errors.`,
        gsheetsText: (name) =>
            `Your Google Sheets ${name} sync has been disabled due to an error`,
        gsheetsViewSettings: 'View Google Sheets Sync settings',
        deliveryFailSubject: (name) =>
            `Failed to send scheduled delivery - "${name}"`,
        deliveryFailTitle: 'Scheduled delivery failure',
        deliveryFailMessage: (name, errorMessage, schedulerUrl) => `
            <p>Your scheduled delivery <strong>"${name}"</strong> failed to send.</p>
            <br />
            <p><strong>Error:</strong> ${errorMessage}</p>
            <br />
            <p>Please check your <a href="${schedulerUrl}">scheduled delivery settings</a> and try again.</p>
        `,
        deliveryFailText: (name, errorMessage, schedulerUrl) =>
            `Warning: Your scheduled delivery "${name}" failed to send. Error: ${errorMessage}. Please check your settings at ${schedulerUrl}`,
        dashboardReady:
            'The latest results for the charts in this dashboard are ready to download!',
        chartReady: 'The latest results for this chart are ready to download!',
        downloadCsv: 'Download .csv',
        truncatedTitle: '⚠️ The results in the exports below have been limited.',
        truncatedDashboardBody:
            'The export limit for a file is {{maxCells}} cells, but the files below exceeded that limit.',
        truncatedChartBody:
            'The export limit is {{maxCells}} cells, but your file exceeded that limit.',
        truncatedHint:
            'You should update your scheduled delivery to include fewer results.',
        noResultsTitle: '⚠️ There were no results to export.',
        noResultsBody: 'This scheduled delivery returned an empty dataset.',
        viewDashboard: 'View dashboard in MSYX',
        viewChart: 'View chart in MSYX',
        viewInApp: 'View in MSYX',
        scheduledDelivery: 'Scheduled delivery',
        deliveredExpire:
            'Delivered {{date}}. For security reasons, delivered files expire after {{expirationDays}} days.',
        learnMore: 'Learn more.',
        dataAlertSubject: 'MSYX Data Alert',
        dataAlertDeliveryType: 'This is a data alert sent by MSYX',
    },
};

export const getEmailCopy = (locale?: string | null): EmailCopy =>
    COPY[normalizeEmailLocale(locale)];

export const emailTemplateStrings = (
    locale?: string | null,
): Record<string, string> => {
    const c = getEmailCopy(locale);
    return {
        logoUrl: c.logoPath,
        brandName: c.brandName,
        privacyPolicy: c.privacyPolicy,
        joinCommunity: c.joinCommunity,
        inviteTitle: c.inviteTitle,
        inviteCtaHint: c.inviteCtaHint,
        inviteCta: c.inviteCta,
        resetTitle: c.resetTitle,
        resetBody: c.resetBody,
        resetCta: c.resetCta,
        projectOpenCta: c.projectOpenCta,
        otpIntro: c.otpIntro,
        otpHint: c.otpHint,
        otpValid: c.otpValid,
        otpQuestions: c.otpQuestions,
        otpGlad: c.otpGlad,
        gsheetsViewSettings: c.gsheetsViewSettings,
        dashboardReady: c.dashboardReady,
        chartReady: c.chartReady,
        downloadCsv: c.downloadCsv,
        truncatedTitle: c.truncatedTitle,
        truncatedDashboardBody: c.truncatedDashboardBody,
        truncatedChartBody: c.truncatedChartBody,
        truncatedHint: c.truncatedHint,
        noResultsTitle: c.noResultsTitle,
        noResultsBody: c.noResultsBody,
        viewDashboard: c.viewDashboard,
        viewChart: c.viewChart,
        viewInApp: c.viewInApp,
        scheduledDeliveryLabel: c.scheduledDelivery,
        deliveredExpire: c.deliveredExpire,
        learnMore: c.learnMore,
    };
};
