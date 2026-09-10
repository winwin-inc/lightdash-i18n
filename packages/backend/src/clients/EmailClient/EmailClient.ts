import {
    CreateProjectMember,
    getErrorMessage,
    InviteLink,
    PasswordResetLink,
    ProjectMemberRole,
    sanitizeHtml,
    SchedulerFormat,
    SessionUser,
    SmptError,
} from '@lightdash/common';
import { marked } from 'marked';
import * as nodemailer from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import Mail from 'nodemailer/lib/mailer';
import { AuthenticationType } from 'nodemailer/lib/smtp-connection';
import SMTPPool from 'nodemailer/lib/smtp-pool';
import path from 'path';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { VERSION } from '../../version';
import {
    emailTemplateStrings,
    getEmailCopy,
} from './emailCopy';

// Timeout configurations based on Nodemailer defaults, adjusted for scheduler compatibility
export const SMTP_CONNECTION_CONFIG = {
    connectionTimeout: 120000, // 2 minutes - max time to establish connection (default)
    greetingTimeout: 30000, // 30 seconds - max time to wait for greeting (default)
    socketTimeout: 180000, // 3 minutes - reduced from default to allow retry logic within default scheduler timeout (10min)
} as const;

export type AttachmentUrl = {
    path: string;
    filename: string;
    localPath: string;
    truncated: boolean;
};
type EmailClientArguments = {
    lightdashConfig: Pick<LightdashConfig, 'smtp' | 'siteUrl' | 'query'>;
};

type EmailTemplate = {
    template: string;
    context: Record<
        string,
        string | boolean | number | AttachmentUrl[] | undefined
    >;
    attachments?: (Mail.Attachment | AttachmentUrl)[] | undefined;
};

export default class EmailClient {
    lightdashConfig: Pick<LightdashConfig, 'smtp' | 'siteUrl' | 'query'>;

    transporter: nodemailer.Transporter | undefined;

    constructor({ lightdashConfig }: EmailClientArguments) {
        this.lightdashConfig = lightdashConfig;

        if (this.lightdashConfig.smtp) {
            this.createTransporter();
        }
    }

    private static createFileAttachment(
        attachment: AttachmentUrl,
        format?: SchedulerFormat,
    ): Mail.Attachment {
        const contentType =
            format === SchedulerFormat.XLSX
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv; charset=utf-8';

        const fileExtension =
            format === SchedulerFormat.XLSX
                ? SchedulerFormat.XLSX
                : SchedulerFormat.CSV;

        const fileName = attachment.filename.endsWith(fileExtension)
            ? attachment.filename
            : `${attachment.filename}.${fileExtension}`;

        return {
            filename: fileName,
            path: attachment.localPath || attachment.path,
            contentType,
        };
    }

    private createTransporter(): void {
        if (!this.lightdashConfig.smtp) return;

        Logger.debug(`Create email transporter`);

        let auth: AuthenticationType | undefined;

        if (this.lightdashConfig.smtp.useAuth) {
            if (this.lightdashConfig.smtp.auth.accessToken) {
                auth = {
                    type: 'OAuth2',
                    user: this.lightdashConfig.smtp.auth.user,
                    accessToken: this.lightdashConfig.smtp.auth.accessToken,
                };
            } else {
                auth = {
                    user: this.lightdashConfig.smtp.auth.user,
                    pass: this.lightdashConfig.smtp.auth.pass,
                };
            }
        }

        const options: SMTPPool.Options = {
            host: this.lightdashConfig.smtp.host,
            port: this.lightdashConfig.smtp.port,
            secure: this.lightdashConfig.smtp.port === 465, // false for any port beside 465, other ports use STARTTLS instead.
            ...(auth ? { auth } : {}),
            requireTLS: this.lightdashConfig.smtp.secure, // Forces STARTTTLS. Recommended when port is not 465.
            tls: this.lightdashConfig.smtp.allowInvalidCertificate
                ? { rejectUnauthorized: false }
                : undefined,
            pool: true, // Enable pooled connections
            maxConnections: 5, // Maximum number of connections (default is 5)
            maxMessages: 100, // Maximum number of messages per connection (default is 100)
            connectionTimeout: SMTP_CONNECTION_CONFIG.connectionTimeout,
            greetingTimeout: SMTP_CONNECTION_CONFIG.greetingTimeout,
            socketTimeout: SMTP_CONNECTION_CONFIG.socketTimeout,
        };

        this.transporter = nodemailer.createTransport(options, {
            from: `"${this.lightdashConfig.smtp.sender.name}" <${this.lightdashConfig.smtp.sender.email}>`,
        });
        this.transporter.verify((error) => {
            if (error) {
                throw new SmptError(
                    `Failed to verify email transporter. ${error}`,
                    {
                        error,
                    },
                );
            } else {
                Logger.debug(`Email transporter verified with success`);
            }
        });

        this.transporter.use(
            'compile',
            hbs({
                viewEngine: {
                    partialsDir: path.join(__dirname, './templates/'),
                    defaultLayout: undefined,
                    extname: '.html',
                },
                viewPath: path.join(__dirname, './templates/'),
                extName: '.html',
            }),
        );
    }

    /** Shared template strings + host/logo. Default locale zh when missing. */
    private emailContext(
        locale: string | null | undefined,
        extra: EmailTemplate['context'] = {},
    ): EmailTemplate['context'] {
        const copy = getEmailCopy(locale);
        return {
            ...emailTemplateStrings(locale),
            host: this.lightdashConfig.siteUrl,
            // Keep historic public asset path (PNG); same as upstream email templates.
            logoSrc: `${this.lightdashConfig.siteUrl}${copy.logoPath}`,
            // Product version for email footer (not site URL).
            appVersion: VERSION,
            ...extra,
        };
    }

    private async sendEmail(
        options: Mail.Options & EmailTemplate,
    ): Promise<void> {
        if (this.transporter) {
            const maxRetries = 3;
            const baseDelay = 1000; // 1 second

            /* eslint-disable no-await-in-loop */
            for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
                try {
                    const info = await this.transporter.sendMail(options);
                    Logger.debug(`Email sent: ${info.messageId}`);
                    return; // Success, exit retry loop
                } catch (error) {
                    const isLastAttempt = attempt === maxRetries;
                    const isRetryableError =
                        error instanceof Error &&
                        (error.message.includes('ECONNRESET') ||
                            error.message.includes('ETIMEDOUT') ||
                            error.message.includes('ENOTFOUND') ||
                            error.message.includes('Connection timeout'));

                    if (isLastAttempt || !isRetryableError) {
                        const isFileError =
                            error instanceof Error &&
                            error.message.includes('ENOENT');
                        const errorMessage = isFileError
                            ? 'There was an unexpected error when processing the attached file. Please contact your admin or support team.'
                            : getErrorMessage(error);
                        throw new SmptError(
                            `Failed to send email after ${attempt} attempts. ${errorMessage}`,
                            {
                                error, // log the original error
                            },
                        );
                    }

                    // On the last retry attempt, try recreating the transporter to handle stale connections
                    if (
                        attempt === maxRetries - 1 &&
                        error instanceof Error &&
                        error.message.includes('ECONNRESET')
                    ) {
                        Logger.warn(
                            'Recreating email transporter due to connection reset',
                        );
                        try {
                            await this.recreateTransporter();
                        } catch (recreateError) {
                            Logger.error(
                                `Failed to recreate transporter: ${recreateError}`,
                            );
                        }
                    }

                    // Calculate exponential backoff delay
                    const delay = baseDelay * 2 ** (attempt - 1);
                    Logger.warn(
                        `Email sending failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${error}`,
                    );

                    await new Promise((resolve) => {
                        setTimeout(resolve, delay);
                    });
                }
            }
        }
    }

    public canSendEmail() {
        return !!this.transporter;
    }

    public async closeConnections(): Promise<void> {
        if (this.transporter) {
            try {
                this.transporter.close();
                Logger.debug('Email transporter connections closed');
            } catch (error) {
                Logger.warn(`Error closing email transporter: ${error}`);
            }
        }
    }

    public async recreateTransporter(): Promise<void> {
        await this.closeConnections();

        if (this.lightdashConfig.smtp) {
            Logger.debug('Recreating email transporter');
            this.createTransporter();
        }
    }

    public async sendPasswordRecoveryEmail(link: PasswordResetLink) {
        const copy = getEmailCopy('zh');
        return this.sendEmail({
            to: link.email,
            subject: copy.resetSubject,
            template: 'recoverPassword',
            context: this.emailContext('zh', {
                url: link.url,
                resetTitle: copy.resetTitle,
                resetBody: copy.resetBody,
                resetCta: copy.resetCta,
            }),
            text: copy.resetText(link.url),
        });
    }

    public async sendGoogleSheetsErrorNotificationEmail(
        recipient: string,
        schedulerName: string,
        schedulerUrl: string,
        locale?: string | null,
    ) {
        const copy = getEmailCopy(locale);
        return this.sendEmail({
            to: recipient,
            subject: copy.gsheetsSubject(schedulerName),
            template: 'googleSheetsSyncDisabledNotification',
            context: this.emailContext(locale, {
                subject: copy.gsheetsTitle,
                description: copy.gsheetsDescription(schedulerName),
                schedulerUrl,
            }),
            text: copy.gsheetsText(schedulerName),
        });
    }

    public async sendScheduledDeliveryFailureEmail(
        recipient: string,
        schedulerName: string,
        schedulerUrl: string,
        errorMessage: string,
        locale?: string | null,
    ) {
        if (!this.canSendEmail()) {
            Logger.error(
                'Cannot send scheduled delivery failure email - email transporter not configured',
                {
                    recipient: recipient ? '***@***' : undefined,
                    schedulerName,
                },
            );
            throw new Error('Email transporter not configured');
        }

        const copy = getEmailCopy(locale);
        const message = copy.deliveryFailMessage(
            schedulerName,
            sanitizeHtml(errorMessage),
            schedulerUrl,
        );

        return this.sendEmail({
            to: recipient,
            subject: copy.deliveryFailSubject(schedulerName),
            template: 'genericNotification',
            context: this.emailContext(locale, {
                title: copy.deliveryFailTitle,
                message,
            }),
            text: copy.deliveryFailText(
                schedulerName,
                errorMessage,
                schedulerUrl,
            ),
        });
    }

    public async sendInviteEmail(
        userThatInvited: Pick<
            SessionUser,
            'firstName' | 'lastName' | 'organizationName'
        >,
        invite: InviteLink,
    ) {
        const copy = getEmailCopy('zh');
        const inviteUrl = `${invite.inviteUrl}?from=email`;
        const orgName = userThatInvited.organizationName || '';
        return this.sendEmail({
            to: invite.email,
            subject: copy.inviteSubject,
            template: 'invitation',
            context: this.emailContext('zh', {
                orgName,
                inviteUrl,
                inviteTitle: copy.inviteTitle,
                inviteBody: copy.inviteBody(orgName),
                inviteCtaHint: copy.inviteCtaHint,
                inviteCta: copy.inviteCta,
            }),
            text: copy.inviteText(orgName, inviteUrl),
        });
    }

    public async sendProjectAccessEmail(
        userThatInvited: Pick<SessionUser, 'firstName' | 'lastName'>,
        projectMember:
            | CreateProjectMember
            | { email: string; customRoleName: string },
        projectName: string,
        projectUrl: string,
    ) {
        const copy = getEmailCopy('zh');
        let roleKey: '' | 'view' | 'explore' | 'edit' | 'manage' = '';
        if (!('customRoleName' in projectMember)) {
            switch (projectMember.role) {
                case ProjectMemberRole.VIEWER:
                    roleKey = 'view';
                    break;
                case ProjectMemberRole.INTERACTIVE_VIEWER:
                    roleKey = 'explore';
                    break;
                case ProjectMemberRole.EDITOR:
                case ProjectMemberRole.DEVELOPER:
                    roleKey = 'edit';
                    break;
                case ProjectMemberRole.ADMIN:
                    roleKey = 'manage';
                    break;
                default:
                    const nope: never = projectMember.role;
                    throw new Error(`Unknown project member role: ${nope}`);
            }
        }
        const roleAction = copy.roleAction[roleKey];
        const inviterName = `${userThatInvited.firstName} ${userThatInvited.lastName}`;

        return this.sendEmail({
            to: projectMember.email,
            subject: copy.projectInviteSubject(inviterName, projectName),
            template: 'projectAccess',
            context: this.emailContext('zh', {
                inviterName,
                projectUrl,
                projectName,
                roleAction,
                projectInviteTitle: copy.projectInviteTitle(projectName),
                projectInviteBody: copy.projectInviteBody(
                    inviterName,
                    roleAction,
                ),
                projectOpenCta: copy.projectOpenCta,
            }),
            text: copy.projectInviteText(inviterName, roleAction, projectUrl),
        });
    }

    public async sendImageNotificationEmail(
        recipient: string,
        subject: string,
        title: string,
        description: string,
        message: string | undefined,
        date: string,
        frequency: string,
        imageUrl: string,
        url: string,
        schedulerUrl: string,
        includeLinks: boolean,
        pdfFile?: string,
        expirationDays?: number,
        deliveryType?: string,
        locale?: string | null,
    ) {
        const copy = getEmailCopy(locale);
        const resolvedDeliveryType =
            deliveryType ?? copy.scheduledDelivery;
        const deliveredExpireText = copy.deliveredExpire
            .replace('{{date}}', date)
            .replace(
                '{{expirationDays}}',
                String(expirationDays ?? ''),
            );

        return this.sendEmail({
            to: recipient,
            subject,
            template: 'imageNotification',
            context: this.emailContext(locale, {
                title,
                hasMessage: !!message,
                message: message && marked(message),
                imageUrl,
                description,
                date,
                frequency,
                url,
                schedulerUrl,
                expirationDays,
                deliveryType: resolvedDeliveryType,
                includeLinks,
                deliveredExpireText,
                learnMore: copy.learnMore,
                viewInApp: copy.viewInApp,
            }),
            text: title,
            attachments: pdfFile
                ? [
                      {
                          filename: `${title}.pdf`,
                          path: pdfFile,
                          contentType: 'application/pdf',
                      },
                  ]
                : undefined,
        });
    }

    public async sendChartCsvNotificationEmail(
        recipient: string,
        subject: string,
        title: string,
        description: string,
        message: string | undefined,
        date: string,
        frequency: string,
        attachment: AttachmentUrl,
        url: string,
        schedulerUrl: string,
        includeLinks: boolean,
        expirationDays?: number,
        asAttachment?: boolean,
        format?: SchedulerFormat,
        locale?: string | null,
    ) {
        const copy = getEmailCopy(locale);
        const maxCells = this.lightdashConfig.query.csvCellsLimit;
        const csvUrl = attachment.path;
        const attachments =
            asAttachment &&
            (attachment.localPath || attachment.path) &&
            attachment.path !== '#no-results'
                ? [EmailClient.createFileAttachment(attachment, format)]
                : undefined;

        return this.sendEmail({
            to: recipient,
            subject,
            template: 'chartCsvNotification',
            context: this.emailContext(locale, {
                title,
                description,
                hasMessage: !!message,
                message: message && marked(message),
                date,
                frequency,
                url,
                csvUrl,
                truncated: attachment.truncated,
                noResults: attachment.path === '#no-results',
                maxCells,
                schedulerUrl,
                expirationDays,
                includeLinks,
                hasAttachment: attachments && attachments.length > 0,
                attachmentCount: attachments?.length || 0,
                chartReady: copy.chartReady,
                downloadCsv: copy.downloadCsv,
                truncatedTitle: copy.truncatedTitle,
                truncatedChartBody: copy.truncatedChartBody.replace(
                    '{{maxCells}}',
                    String(maxCells),
                ),
                truncatedHint: copy.truncatedHint,
                noResultsTitle: copy.noResultsTitle,
                noResultsBody: copy.noResultsBody,
                viewChart: copy.viewChart,
                scheduledDeliveryLabel: copy.scheduledDelivery,
            }),
            text: title,
            attachments,
        });
    }

    public async sendDashboardCsvNotificationEmail(
        recipient: string,
        subject: string,
        title: string,
        description: string,
        message: string | undefined,
        date: string,
        frequency: string,
        attachments: AttachmentUrl[],
        url: string,
        schedulerUrl: string,
        includeLinks: boolean,
        expirationDays?: number,
        asAttachment?: boolean,
        format?: SchedulerFormat,
        locale?: string | null,
    ) {
        const copy = getEmailCopy(locale);
        const maxCells = this.lightdashConfig.query.csvCellsLimit;
        const csvUrls = attachments.filter(
            (attachment) => !attachment.truncated,
        );

        const truncatedCsvUrls = attachments.filter(
            (attachment) => attachment.truncated,
        );

        const emailAttachments = asAttachment
            ? csvUrls
                  .filter(
                      (attachment) =>
                          (attachment.localPath || attachment.path) &&
                          attachment.path !== '#no-results',
                  )
                  .map((attachment) =>
                      EmailClient.createFileAttachment(attachment, format),
                  )
            : undefined;

        return this.sendEmail({
            to: recipient,
            subject,
            template: 'dashboardCsvNotification',
            context: this.emailContext(locale, {
                title,
                description,
                hasMessage: !!message,
                message: message && marked(message),
                date,
                frequency,
                csvUrls,
                truncatedCsvUrls,
                truncated: truncatedCsvUrls.length > 0,
                maxCells,
                url,
                schedulerUrl,
                expirationDays,
                includeLinks,
                hasAttachments: emailAttachments && emailAttachments.length > 0,
                attachmentCount: emailAttachments?.length || 0,
                dashboardReady: copy.dashboardReady,
                truncatedTitle: copy.truncatedTitle,
                truncatedDashboardBody: copy.truncatedDashboardBody.replace(
                    '{{maxCells}}',
                    String(maxCells),
                ),
                truncatedHint: copy.truncatedHint,
                viewDashboard: copy.viewDashboard,
                scheduledDeliveryLabel: copy.scheduledDelivery,
            }),
            text: title,
            attachments: emailAttachments,
        });
    }

    async sendOneTimePasscodeEmail({
        recipient,
        passcode,
    }: {
        recipient: string;
        passcode: string;
    }): Promise<void> {
        const copy = getEmailCopy('zh');
        return this.sendEmail({
            to: recipient,
            subject: copy.otpSubject,
            template: 'oneTimePasscode',
            context: this.emailContext('zh', {
                passcode,
                title: copy.otpSubject,
                otpIntro: copy.otpIntro,
                otpHint: copy.otpHint,
                otpValid: copy.otpValid,
                otpQuestions: copy.otpQuestions,
                otpGlad: copy.otpGlad,
            }),
            text: copy.otpText(passcode),
        });
    }

    public async sendGenericNotificationEmail(
        to: string[],
        subject: string,
        title: string,
        message: string,
        attachments?: Mail.Attachment[],
    ) {
        return this.sendEmail({
            to,
            subject,
            template: 'genericNotification',
            context: this.emailContext('zh', {
                title,
                message: marked(message),
            }),
            text: `${title}\n\n${message}`,
            attachments,
        });
    }
}
