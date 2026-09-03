import { type Ability } from '@casl/ability';
import { type Account, type SessionUser } from '@lightdash/common';
import type { AuditResource } from '../logging/auditLog';
import { CaslAuditWrapper } from '../logging/caslAuditWrapper';
import Logger from '../logging/logger';
import { logAuditEvent } from '../logging/winston';

/**
 * Minimal Account vs SessionUser discriminator.
 * Full `isAccount` lives upstream in common; keep local until auth types catch up.
 */
const isAccountLike = (
    accountOrUser: Account | SessionUser,
): accountOrUser is Account => 'authentication' in accountOrUser;

export abstract class BaseService {
    protected logger: typeof Logger;

    constructor({
        logger,
        serviceName,
        loggerParams,
    }: {
        logger?: typeof Logger;

        /** If provided, is used for things like instancing the child logger */
        serviceName?: string;

        /**
         * Arbitrary values passed to a child logger, if `logger` is not provided.
         */
        loggerParams?: Record<string, unknown>;
    } = {}) {
        /**
         * Logger can be overriden as part of the constructor, e.g to provide a scoped
         * logger instance.
         */
        this.logger =
            logger ??
            Logger.child({
                serviceName: serviceName ?? this.constructor.name,
                ...(loggerParams ?? {}),
            });
    }

    /**
     * Creates a CASL ability wrapper that logs audit events for permission checks.
     * STUB-compatible with i18n's simpler CaslAuditWrapper.
     */
    protected createAuditedAbility(
        accountOrUser: Account | SessionUser,
    ): CaslAuditWrapper<Ability> {
        if (isAccountLike(accountOrUser)) {
            const requestContext = (
                accountOrUser as Account & {
                    requestContext?: {
                        ip?: string;
                        userAgent?: string;
                        requestId?: string;
                    };
                }
            ).requestContext;
            return new CaslAuditWrapper(
                accountOrUser.user.ability,
                // AuditableUser is a Pick of SessionUser; cast for embed/anon accounts
                accountOrUser.user as any,
                {
                    auditLogger: logAuditEvent,
                    ip: requestContext?.ip,
                    userAgent: requestContext?.userAgent,
                    requestId: requestContext?.requestId,
                },
            );
        }

        const requestContext = (
            accountOrUser as SessionUser & {
                requestContext?: {
                    ip?: string;
                    userAgent?: string;
                    requestId?: string;
                };
            }
        ).requestContext;
        return new CaslAuditWrapper(accountOrUser.ability, accountOrUser, {
            auditLogger: logAuditEvent,
            ip: requestContext?.ip,
            userAgent: requestContext?.userAgent,
            requestId: requestContext?.requestId,
        });
    }

    /**
     * Logs an audit event for operations where permission checks are bypassed.
     * STUB: no-op until full audit status 'allowed-bypass' is ported.
     */
    protected logBypassEvent(
        _accountOrUser: Account | SessionUser,
        _action: string,
        _resource: AuditResource,
    ): void {
        // STUB: port from upstream later
    }
}
