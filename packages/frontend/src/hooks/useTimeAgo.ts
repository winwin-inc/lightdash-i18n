import { parseISO } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from 'react-use';

import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const useFromNow = () => {
    const { i18n } = useTranslation();

    return (timeStamp: Date) => {
        switch (i18n.language) {
            case 'zh':
                return dayjs(timeStamp).locale('zh-cn').fromNow();
            default:
                return dayjs(timeStamp).fromNow();
        }
    };
};

export const useTimeAgo = (
    dateOrString: Date | string,
    interval: number = 10000,
) => {
    const fromNow = useFromNow();

    const parsed = useMemo(() => {
        return typeof dateOrString === 'string'
            ? parseISO(dateOrString)
            : dateOrString;
    }, [dateOrString]);

    const [timeAgo, setTimeAgo] = useState<string>(fromNow(parsed));

    useInterval(() => {
        setTimeAgo(fromNow(parsed));
    }, interval);

    useEffect(() => {
        setTimeAgo(fromNow(parsed));
    }, [parsed, fromNow]);

    return timeAgo;
};
