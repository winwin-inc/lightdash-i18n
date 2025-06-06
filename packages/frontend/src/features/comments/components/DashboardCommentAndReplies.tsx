import { type Comment } from '@lightdash/common';
import { Box, Button, Collapse, Divider, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useApp from '../../../providers/App/useApp';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useCreateComment, useRemoveComment } from '../hooks/useComments';
import { CommentDetail } from './CommentDetail';
import { CommentForm } from './CommentForm';

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    comment: Comment;
    targetRef: React.RefObject<HTMLDivElement | null> | null;
};

export const DashboardCommentAndReplies: FC<Props> = ({
    comment,
    projectUuid,
    dashboardTileUuid,
    dashboardUuid,
    targetRef,
}) => {
    const { t } = useTranslation();
    const { user } = useApp();
    const canCreateDashboardComments = !!useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canCreateDashboardComments,
    );

    const [isRepliesOpen, { toggle: toggleReplies }] = useDisclosure(false);
    const [isReplyingTo, setIsReplyingTo] = useState<string | undefined>(
        undefined,
    );

    const { mutateAsync: createReply, isLoading: isCreatingReply } =
        useCreateComment();
    const { mutateAsync: removeComment } = useRemoveComment();

    const handleRemove = useCallback(
        async (commentId: string) => {
            await removeComment({
                dashboardUuid,
                commentId,
            });
        },
        [dashboardUuid, removeComment],
    );

    const handleReply = useCallback(() => {
        setIsReplyingTo((prev) =>
            prev === comment.commentId ? undefined : comment.commentId,
        );
        if (!isRepliesOpen) {
            toggleReplies();
        }
    }, [isRepliesOpen, comment.commentId, toggleReplies]);

    return (
        <Stack spacing="two" ref={targetRef}>
            <CommentDetail
                comment={comment}
                canReply={canCreateDashboardComments}
                onReply={() => handleReply()}
                // can remove any comment or the comment is created by the current user
                canRemove={comment.canRemove}
                onRemove={() => handleRemove(comment.commentId)}
            />

            {comment.replies && comment.replies.length > 0 && (
                <Box ml="xl">
                    <Divider
                        size="xs"
                        labelPosition="right"
                        label={
                            <Button
                                compact
                                size="xs"
                                variant="subtle"
                                fz="xs"
                                onClick={toggleReplies}
                            >
                                {comment.replies.length}{' '}
                                {comment.replies.length === 1
                                    ? t(
                                          'features_comments_components_comment_dashboard_replies.reply',
                                      )
                                    : t(
                                          'features_comments_components_comment_dashboard_replies.replies',
                                      )}
                            </Button>
                        }
                    />

                    <Collapse in={isRepliesOpen}>
                        <Stack spacing="xs">
                            {comment.replies.map((reply) => (
                                <CommentDetail
                                    key={reply.commentId}
                                    comment={reply}
                                    // Can't reply to a reply
                                    canReply={false}
                                    // can remove any comment or the comment is created by the current user
                                    canRemove={reply.canRemove}
                                    onRemove={() =>
                                        handleRemove(reply.commentId)
                                    }
                                />
                            ))}
                        </Stack>
                    </Collapse>
                </Box>
            )}

            <Collapse in={!!isReplyingTo} ml="lg">
                <CommentForm
                    userName={user.data?.firstName + ' ' + user.data?.lastName}
                    onSubmit={(
                        text: string,
                        textHtml: string,
                        mentions: string[],
                    ) =>
                        createReply({
                            projectUuid,
                            dashboardUuid,
                            dashboardTileUuid,
                            text,
                            textHtml,
                            replyTo: comment.commentId,
                            mentions,
                        })
                    }
                    onCancel={() => {
                        toggleReplies();
                        setIsReplyingTo(undefined);
                    }}
                    isSubmitting={isCreatingReply}
                    mode="reply"
                />
            </Collapse>
        </Stack>
    );
};
