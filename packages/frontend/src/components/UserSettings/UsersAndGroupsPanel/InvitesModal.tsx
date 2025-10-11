import {
    OrganizationMemberRole,
    getEmailSchema,
    type CreateInviteLink,
} from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Select,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconUser } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import useApp from '../../../providers/App/useApp';
import { TrackPage } from '../../../providers/Tracking/TrackingProvider';
import useTracking from '../../../providers/Tracking/useTracking';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
} from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import InviteSuccess from './InviteSuccess';

type SendInviteFormProps = Omit<CreateInviteLink, 'expiresAt'>;

const InvitesModal: FC<{
    opened: boolean;
    onClose: () => void;
}> = ({ opened, onClose }) => {
    const { t } = useTranslation();

    const RoleLabels = {
        member: t(
            'components_user_settings_groups_panel_invites.roles_labels.member',
        ),
        viewer: t(
            'components_user_settings_groups_panel_invites.roles_labels.viewer',
        ),
        interactive_viewer: t(
            'components_user_settings_groups_panel_invites.roles_labels.interactive_viewer',
        ),
        editor: t(
            'components_user_settings_groups_panel_invites.roles_labels.editor',
        ),
        developer: t(
            'components_user_settings_groups_panel_invites.roles_labels.developer',
        ),
        admin: t(
            'components_user_settings_groups_panel_invites.roles_labels.admin',
        ),
    };

    const form = useForm<SendInviteFormProps>({
        initialValues: {
            email: '',
            role: OrganizationMemberRole.EDITOR,
        },
        validate: zodResolver(
            z.object({
                email: getEmailSchema(),
            }),
        ),
    });
    const { track } = useTracking();
    const { health, user } = useApp();
    const {
        data: inviteLink,
        mutateAsync,
        isLoading,
    } = useCreateInviteLinkMutation();

    const handleSubmit = async (data: SendInviteFormProps) => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        await mutateAsync(data);
        form.reset();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <MantineIcon size="lg" icon={IconUser} />
                    <Title order={4}>Add user</Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.INVITE_MANAGEMENT_SETTINGS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    name="invite_user"
                    onSubmit={form.onSubmit((values: SendInviteFormProps) =>
                        handleSubmit(values),
                    )}
                >
                    <Group gap="xs" align="start" wrap="nowrap">
                        <TextInput
                            name="email"
                            label={t(
                                'components_user_settings_groups_panel_invites.form.email.label',
                            )}
                            placeholder={t(
                                'components_user_settings_groups_panel_invites.form.email.placeholder',
                            )}
                            required
                            disabled={isLoading}
                            style={{ flex: 1 }}
                            {...form.getInputProps('email')}
                        />
                        {user.data?.ability?.can('manage', 'Organization') && (
                            <Select
                                data={Object.values(OrganizationMemberRole).map(
                                    (orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: orgMemberRole.replace('_', ' '),
                                    }),
                                )}
                                disabled={isLoading}
                                required
                                placeholder={t(
                                    'components_user_settings_groups_panel_invites.form.select.placeholder',
                                )}
                                comboboxProps={{
                                    position: 'bottom',
                                    withinPortal: true,
                                }}
                                style={{ marginTop: 20, width: 180 }}
                                {...form.getInputProps('role')}
                            />
                        )}
                        <Button
                            disabled={isLoading}
                            type="submit"
                            style={{ marginTop: 20 }}
                        >
                            {health.data?.hasEmailClient
                                ? t(
                                      'components_user_settings_groups_panel_invites.form.send_invite',
                                  )
                                : t(
                                      'components_user_settings_groups_panel_invites.form.generate_invite',
                                  )}
                        </Button>
                    </Group>
                </form>
                {inviteLink && (
                    <InviteSuccess invite={inviteLink} hasMarginTop />
                )}
            </TrackPage>
        </Modal>
    );
};

export default InvitesModal;
