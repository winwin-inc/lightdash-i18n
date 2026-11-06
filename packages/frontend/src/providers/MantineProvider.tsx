import {
    MantineProvider as MantineProviderBase,
    type MantineThemeOverride,
} from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import 'dayjs/locale/zh-cn';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { getMantineThemeOverride } from '../mantineTheme';

type Props = {
    withGlobalStyles?: boolean;
    withNormalizeCSS?: boolean;
    withCSSVariables?: boolean;
    theme?: MantineThemeOverride;
    themeOverride?: MantineThemeOverride;
    notificationsLimit?: number;
};

const MantineProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    withGlobalStyles = false,
    withNormalizeCSS = false,
    withCSSVariables = false,
    theme = getMantineThemeOverride(),
    themeOverride = {},
    notificationsLimit,
}) => {
    const { i18n } = useTranslation();
    // i18n 未初始化时（测试环境 / 资源加载前）i18n.language 可能是 undefined，
    // 这里兵底成 'en'，避免整个应用白屏。
    const normalizedLanguage = (i18n.language ?? 'en').toLowerCase();
    const locale = normalizedLanguage.startsWith('zh') ? 'zh-cn' : 'en';

    return (
        <MantineProviderBase
            withGlobalStyles={withGlobalStyles}
            withNormalizeCSS={withNormalizeCSS}
            withCSSVariables={withCSSVariables}
            theme={{ ...theme, ...themeOverride }}
        >
            <DatesProvider settings={{ locale }}>{children}</DatesProvider>

            <Notifications limit={notificationsLimit} />
        </MantineProviderBase>
    );
};

export default MantineProvider;
