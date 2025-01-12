import { isField, type ResultValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { type CellContextMenuProps } from '../common/Table/types';
import UrlMenuItems from '../Explorer/ResultsCard/UrlMenuItems';

const MinimalCellContextMenu: FC<Pick<CellContextMenuProps, 'cell'>> = ({
    cell,
}) => {
    const { t } = useTranslation();

    const { showToastSuccess } = useToaster();
    const meta = cell.column.columnDef.meta;
    const item = meta?.item;

    const value: ResultValue = useMemo(
        () => cell.getValue()?.value || {},
        [cell],
    );

    const clipboard = useClipboard({ timeout: 200 });

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(value.formatted);
        showToastSuccess({
            title: t('components_simple_table.cell_context.copied'),
        });
    }, [clipboard, showToastSuccess, value.formatted, t]);

    return (
        <>
            {item && value.raw && isField(item) ? (
                <UrlMenuItems urls={item.urls} cell={cell} showErrors={false} />
            ) : null}

            {isField(item) && (item.urls || []).length > 0 && <Menu.Divider />}

            <Menu.Item
                icon={<MantineIcon icon={IconCopy} size="md" fillOpacity={0} />}
                onClick={handleCopyToClipboard}
            >
                {t('components_simple_table.cell_context.copy_value')}
            </Menu.Item>
        </>
    );
};

export default MinimalCellContextMenu;
