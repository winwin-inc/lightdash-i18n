// STUB: chartTypes / DataAppViz UI not ported.
import { type DataAppVizSchema } from '@lightdash/common';
import { Text } from '@mantine-8/core';
import { type FC } from 'react';

type Props = {
    schema: DataAppVizSchema;
};

const DataAppVizResultCard: FC<Props> = ({ schema: _schema }) => (
    <Text size="sm" c="dimmed">
        {/* STUB */}
        Visualization summary unavailable in this build.
    </Text>
);

export default DataAppVizResultCard;
