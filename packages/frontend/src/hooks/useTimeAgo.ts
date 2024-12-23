import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from 'react-use';

dayjs.extend(relativeTime);

const useFromNow = () => {
    const { i18n } = useTranslation();

    return (timeStamp: Date) => {
        switch (i18n.language) {
            case 'zh':
                return dayjs(timeStamp).locale('zh-cn').fromNow();
                break;
            default:
                return dayjs(timeStamp).fromNow();
        }
    };
};

export const useTimeAgo = (timeStamp: Date, interval: number = 10000) => {
    const fromNow = useFromNow();

    const [timeAgo, setTimeAgo] = useState<string>(fromNow(timeStamp));

    useInterval(() => {
        setTimeAgo(fromNow(timeStamp));
    }, interval);
    useEffect(() => {
        setTimeAgo(fromNow(timeStamp));
    }, [timeStamp, fromNow]);
    return timeAgo;
};
