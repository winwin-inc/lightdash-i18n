import { AnyType, formatRows, ItemsMap } from '@lightdash/common';
import { parentPort, workerData } from 'worker_threads';

type Args = {
    rows: Record<string, AnyType>[];
    itemMap: ItemsMap;
    displayTimezone?: string;
};

function run() {
    const { rows, itemMap, displayTimezone }: Args = workerData;
    const formattedRows = formatRows(rows, itemMap, undefined, {
        displayTimezone,
    });
    if (parentPort) parentPort.postMessage(formattedRows);
}

run();
