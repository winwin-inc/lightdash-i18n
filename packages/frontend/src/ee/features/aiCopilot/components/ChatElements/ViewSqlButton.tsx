import { ActionIcon, HoverCard, Tooltip } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconEye } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../components/common/MantineIcon';

interface ViewSqlButtonProps {
    sql?: string;
}

export const ViewSqlButton: FC<ViewSqlButtonProps> = memo(({ sql }) => {
    const { t } = useTranslation();

    if (!sql) return null;

    return (
        <HoverCard
            shadow="subtle"
            radius="md"
            position="bottom-start"
            withinPortal
        >
            <HoverCard.Target>
                <Tooltip
                    label={t(
                        'ai_copilot_chat_elements_view_sql_button.view_sql',
                    )}
                >
                    <ActionIcon size="sm" variant="subtle" color="gray">
                        <MantineIcon icon={IconEye} color="gray" />
                    </ActionIcon>
                </Tooltip>
            </HoverCard.Target>
            <HoverCard.Dropdown p={0} maw={500}>
                <Prism
                    language="sql"
                    withLineNumbers
                    noCopy
                    styles={{
                        lineContent: {
                            fontSize: 10,
                        },
                    }}
                >
                    {sql}
                </Prism>
            </HoverCard.Dropdown>
        </HoverCard>
    );
});
