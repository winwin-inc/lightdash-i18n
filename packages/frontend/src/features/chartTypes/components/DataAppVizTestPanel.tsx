// STUB: chartTypes / DataAppViz test panel not ported.
import {
    type DataAppVizContext,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Text } from '@mantine-8/core';
import { type FC } from 'react';

type Props = {
    projectUuid: string;
    schema: DataAppVizSchema;
    onContextChange: (ctx: DataAppVizContext | null) => void;
};

const DataAppVizTestPanel: FC<Props> = ({
    projectUuid: _projectUuid,
    schema: _schema,
    onContextChange: _onContextChange,
}) => (
    <Text size="sm" c="dimmed">
        {/* STUB */}
        Visualization test panel unavailable in this build.
    </Text>
);

export default DataAppVizTestPanel;
