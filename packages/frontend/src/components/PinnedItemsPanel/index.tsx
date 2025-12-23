import { ResourceViewItemType, type PinnedItems } from '@lightdash/common';
import { Card, Group, Text } from '@mantine/core';
import { IconPin } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import usePinnedItemsContext from '../../providers/PinnedItems/usePinnedItemsContext';
import MantineIcon from '../common/MantineIcon';
// import MantineLinkButton from '../common/MantineLinkButton';
import ResourceView from '../common/ResourceView';
import { ResourceViewType } from '../common/ResourceView/types';

interface Props {
    pinnedItems: PinnedItems;
    isEnabled: boolean;
}

const PinnedItemsPanel: FC<Props> = ({ pinnedItems, isEnabled }) => {
    const { userCanManage } = usePinnedItemsContext();
    const { t } = useTranslation();

    return pinnedItems && pinnedItems.length > 0 ? (
        <ResourceView
            items={pinnedItems}
            view={ResourceViewType.GRID}
            hasReorder={userCanManage}
            gridProps={{
                groups: [
                    [ResourceViewItemType.SPACE],
                    [
                        ResourceViewItemType.DASHBOARD,
                        ResourceViewItemType.CHART,
                    ],
                ],
            }}
            headerProps={{
                title: userCanManage
                    ? t('components_pinned_items_panel.header.manage.title')
                    : t(
                          'components_pinned_items_panel.header.cannot_manage.title',
                      ),
                description: userCanManage
                    ? t(
                          'components_pinned_items_panel.header.manage.description',
                      )
                    : t(
                          'components_pinned_items_panel.header.cannot_manage.description',
                      ),
            }}
        />
    ) : ((userCanManage && pinnedItems.length <= 0) || !pinnedItems) &&
      isEnabled ? (
        // FIXME: update width with Mantine widths
        <Card
            withBorder
            sx={(theme) => ({
                backgroundColor: theme.colors.gray[1],
            })}
        >
            <Group position="apart">
                <Group position="center" spacing="xxs" my="xs" ml="xs">
                    <MantineIcon
                        icon={IconPin}
                        size="lg"
                        color="gray.7"
                        fill="gray.1"
                    />
                    <Text fw={600} color="gray.7">
                        {t('components_pinned_items_panel.no_items.title')}
                    </Text>
                    <Text color="gray.7">
                        {t('components_pinned_items_panel.no_items.tip')}
                    </Text>
                </Group>
                {/* <MantineLinkButton
                    href="https://docs.lightdash.com/guides/pinning/"
                    target="_blank"
                    variant="subtle"
                    compact
                    color="gray.6"
                >
                    {t('components_pinned_items_panel.no_items.view')}
                </MantineLinkButton> */}
            </Group>
        </Card>
    ) : null;
};

export default PinnedItemsPanel;
