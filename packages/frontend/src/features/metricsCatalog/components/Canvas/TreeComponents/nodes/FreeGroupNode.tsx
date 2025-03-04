import { Paper, Text } from '@mantine/core';
import type { Node, NodeProps } from '@xyflow/react';
import { useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';

export type FreeGroupNodeData = Node;

const FreeGroupNode: FC<NodeProps<FreeGroupNodeData>> = ({ height, width }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    return (
        <Paper p="xs" h={height} w={width} bg="gray.0" padding="sm">
            <Text fz="xs" fw={500} c="gray.6" ref={ref}>
                {t('features_metrics_catalog_canvas.free_group_node.content')}
            </Text>
        </Paper>
    );
};

export default FreeGroupNode;
