import { subject } from '@casl/ability';
import {
    Comment,
    DashboardDAO,
    FeatureFlags,
    ForbiddenError,
    isUserWithOrg,
    LightdashUser,
    SessionUser,
    SpaceShare,
    SpaceSummary,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { CommentModel } from '../../models/CommentModel/CommentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserModel } from '../../models/UserModel';
import { isFeatureFlagEnabled } from '../../postHog';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

// Method interface only: importing DashboardService would create a cycle.
type DashboardAllowListService = {
    getAllowedDashboardUuidsForViewer: (
        user: SessionUser,
        projectUuid: string,
    ) => Promise<Set<string> | undefined>;
};

type CommentServiceArguments = {
    analytics: LightdashAnalytics;
    dashboardModel: DashboardModel;
    dashboardService: DashboardAllowListService;
    spaceModel: SpaceModel;
    commentModel: CommentModel;
    notificationsModel: NotificationsModel;
    userModel: UserModel;
};

export class CommentService extends BaseService {
    analytics: LightdashAnalytics;

    dashboardModel: DashboardModel;

    dashboardService: DashboardAllowListService;

    spaceModel: SpaceModel;

    commentModel: CommentModel;

    notificationsModel: NotificationsModel;

    userModel: UserModel;

    constructor({
        analytics,
        dashboardModel,
        dashboardService,
        spaceModel,
        commentModel,
        notificationsModel,
        userModel,
    }: CommentServiceArguments) {
        super();
        this.analytics = analytics;
        this.dashboardModel = dashboardModel;
        this.dashboardService = dashboardService;
        this.spaceModel = spaceModel;
        this.commentModel = commentModel;
        this.notificationsModel = notificationsModel;
        this.userModel = userModel;
    }

    async hasDashboardSpaceAccess(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<boolean> {
        let space: Omit<SpaceSummary, 'userAccess'>;
        let spaceAccess: SpaceShare[];

        try {
            space = await this.spaceModel.getSpaceSummary(spaceUuid);
            spaceAccess = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                spaceUuid,
            );
        } catch (e) {
            Sentry.captureException(e);
            console.error(e);
            return false;
        }

        return hasViewAccessToSpace(user, space, spaceAccess);
    }

    private static async isFeatureEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ) {
        const isEnabled = await isFeatureFlagEnabled(
            FeatureFlags.DashboardComments,
            user,
            { throwOnTimeout: false },
            true, // default value
        );
        if (!isEnabled) throw new ForbiddenError('Feature not enabled');
    }

    private async createCommentNotification({
        userUuid,
        comment,
        dashboard,
        dashboardTileUuid,
    }: {
        userUuid: string;
        comment: Comment;
        dashboard: DashboardDAO;
        dashboardTileUuid: string;
    }) {
        const commentingUsersInTile =
            await this.commentModel.findUsersThatCommentedInDashboardTile(
                dashboardTileUuid,
            );

        const taggedUsers = comment.mentions.map((mention) => ({
            userUuid: mention,
            tagged: true,
        }));

        const commentingUsers = commentingUsersInTile
            // Filter out users that have just been tagged to avoid duplicate notifications
            .filter((u) => !taggedUsers.some((t) => t.userUuid === u.userUuid))
            .map((user) => ({
                userUuid: user.userUuid,
                tagged: false,
            }));

        const usersToNotify = [...taggedUsers, ...commentingUsers];

        if (usersToNotify.length === 0) return;

        const dashboardTile = dashboard.tiles.find(
            (t) => t.uuid === dashboardTileUuid,
        );

        if (!dashboardTile) return;

        const commentAuthor = await this.userModel.getUserDetailsByUuid(
            userUuid,
        );

        await this.notificationsModel.createDashboardCommentNotification({
            userUuid,
            commentAuthor,
            comment,
            usersToNotify,
            dashboard,
            dashboardTile,
        });
    }

    /**
     * Client-use: a restricted user must not read or write the comments of a
     * dashboard that is not in their allow-list.
     */
    private async assertDashboardIsVisibleToUser(
        user: SessionUser,
        dashboard: { uuid: string; projectUuid: string },
    ): Promise<void> {
        const allowedDashboardUuids =
            await this.dashboardService.getAllowedDashboardUuidsForViewer(
                user,
                dashboard.projectUuid,
            );
        if (allowedDashboardUuids === undefined || !isUserWithOrg(user)) {
            return;
        }
        if (!allowedDashboardUuids.has(dashboard.uuid)) {
            throw new ForbiddenError("You don't have access to this dashboard");
        }
    }

    async createComment(
        user: SessionUser,
        dashboardUuid: string,
        dashboardTileUuid: string,
        text: string,
        unsafeTextHtml: string,
        replyTo: string | null,
        mentions: string[],
    ): Promise<string> {
        await CommentService.isFeatureEnabled(user);

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );

        if (
            user.ability.cannot(
                'create',
                subject('DashboardComments', {
                    projectUuid: dashboard.projectUuid,
                    organizationUuid: dashboard.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.assertDashboardIsVisibleToUser(user, dashboard);

        this.analytics.track({
            event: 'comment.created',
            userId: user.userUuid,
            properties: {
                dashboardUuid,
                dashboardTileUuid,
                isReply: !!replyTo,
                hasMention: mentions.length > 0,
            },
        });

        const comment = await this.commentModel.createComment(
            dashboardUuid,
            dashboardTileUuid,
            text,
            unsafeTextHtml,
            replyTo,
            user,
            mentions,
        );

        if (!comment) {
            throw new Error('Failed to create comment');
        }

        await this.createCommentNotification({
            userUuid: user.userUuid,
            comment,
            dashboard,
            dashboardTileUuid,
        });

        return comment.commentId;
    }

    async findCommentsForDashboard(
        user: SessionUser,
        dashboardUuidOrSlug: string,
    ): Promise<Record<string, Comment[]>> {
        await CommentService.isFeatureEnabled(user);

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
        );

        if (
            user.ability.cannot(
                'view',
                subject('DashboardComments', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.assertDashboardIsVisibleToUser(user, dashboard);

        const canUserRemoveAnyComment = user.ability.can(
            'manage',
            subject('DashboardComments', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            }),
        );

        return this.commentModel.findCommentsForDashboard(
            dashboard.uuid,
            user.userUuid,
            canUserRemoveAnyComment,
        );
    }

    async resolveComment(
        user: SessionUser,
        dashboardUuid: string,
        commentId: string,
    ): Promise<void> {
        await CommentService.isFeatureEnabled(user);

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('DashboardComments', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.assertDashboardIsVisibleToUser(user, dashboard);

        const comment = await this.commentModel.getComment(commentId);

        this.analytics.track({
            event: 'comment.resolved',
            userId: user.userUuid,
            properties: {
                isReply: !!comment.replyTo,
                dashboardTileUuid: comment.dashboardTileUuid,
                dashboardUuid,
                isOwner: comment.userUuid === user.userUuid,
                hasMention: comment.mentions.length > 0,
            },
        });

        return this.commentModel.resolveComment(commentId);
    }

    async deleteComment(
        user: SessionUser,
        dashboardUuid: string,
        commentId: string,
    ): Promise<void> {
        await CommentService.isFeatureEnabled(user);

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.assertDashboardIsVisibleToUser(user, dashboard);

        const canRemoveAnyComment = user.ability.can(
            'manage',
            subject('DashboardComments', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            }),
        );

        const comment = await this.commentModel.getComment(commentId);

        if (canRemoveAnyComment) {
            await this.commentModel.deleteComment(commentId);
        } else {
            const isOwner = comment.userUuid === user.userUuid;

            if (isOwner) {
                await this.commentModel.deleteComment(commentId);
            }

            throw new ForbiddenError();
        }

        this.analytics.track({
            event: 'comment.deleted',
            userId: user.userUuid,
            properties: {
                isReply: !!comment.replyTo,
                dashboardTileUuid: comment.dashboardTileUuid,
                dashboardUuid,
                isOwner: comment.userUuid === user.userUuid,
                hasMention: comment.mentions.length > 0,
            },
        });
    }
}
