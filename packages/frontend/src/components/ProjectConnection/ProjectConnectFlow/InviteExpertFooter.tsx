import { Anchor, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

const InviteExpertFooter: FC = () => {
    const { t } = useTranslation();

    return (
        <Text color="dimmed" w={420} mx="auto" ta="center">
            {t(
                'components_project_connection_flow.invite_expert_footer.part_1',
            )}{' '}
            <Anchor
                component={Link}
                to="/generalSettings/userManagement?to=invite"
            >
                {t(
                    'components_project_connection_flow.invite_expert_footer.part_2',
                )}
            </Anchor>
        </Text>
    );
};

export default InviteExpertFooter;
