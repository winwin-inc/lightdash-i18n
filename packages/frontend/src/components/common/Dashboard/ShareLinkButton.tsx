import { ActionIcon } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../MantineIcon';

const ShareLinkButton: FC<{ url: string }> = ({ url }) => {
    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();
    const { t } = useTranslation();

    const handleCopyClick = async () => {
        clipboard.copy(url || '');
        showToastSuccess({
            title: t('components_common_dashboard_share.toast_copied'),
        });
    };

    return (
        <ActionIcon variant="default" onClick={handleCopyClick} color="gray">
            <MantineIcon
                icon={clipboard.copied ? IconCheck : IconLink}
                color={clipboard.copied ? 'green' : undefined}
            />
        </ActionIcon>
    );
};

export default ShareLinkButton;
