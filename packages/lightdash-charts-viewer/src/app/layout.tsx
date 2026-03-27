import type { Metadata } from 'next';
import { ChartsMantineProvider } from './MantineProvider';
import './globals.css';

import '@mantine/core/styles.css';

export const metadata: Metadata = {
    title: '图表查看器',
    description: '查询组合 + ECharts 图表展示',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN">
            <body style={{ margin: 0 }}>
                <ChartsMantineProvider>{children}</ChartsMantineProvider>
            </body>
        </html>
    );
}
