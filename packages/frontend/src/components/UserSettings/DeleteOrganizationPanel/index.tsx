import { Button, Group } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import { OrganizationDeleteModal } from './DeleteOrganizationModal';

export const DeleteOrganizationPanel: FC = () => {
    const { t } = useTranslation();
    const { isInitialLoading: isOrganizationLoading, data: organization } =
        useOrganization();

    const [showDeleteOrganizationModal, setShowDeleteOrganizationModal] =
        useState(false);

    if (isOrganizationLoading || organization === undefined) return null;

    return (
        <Group position="right">
            <Button
                variant="outline"
                color="red"
                leftIcon={<MantineIcon icon={IconTrash} />}
                onClick={() => setShowDeleteOrganizationModal(true)}
            >
                {t('components_user_settings_delete_organization_modal.delete')}{' '}
                '{organization.name}'
            </Button>

            <OrganizationDeleteModal
                opened={showDeleteOrganizationModal}
                onClose={() => setShowDeleteOrganizationModal(false)}
            />
        </Group>
    );
};
