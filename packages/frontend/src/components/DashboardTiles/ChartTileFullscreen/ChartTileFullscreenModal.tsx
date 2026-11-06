import { Box, Modal, Text } from '@mantine/core';
import { useEffect, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type ChartTileFullscreenModalProps = {
    opened: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
};

/**
 * Near-fullscreen Mantine Modal that hosts a remounted chart visualization.
 * Uses in-app modal (not browser Fullscreen API / page-level FullscreenProvider).
 * Dispatches window resize after open so ECharts recalculates layout; Vega uses ResizeObserver.
 */
const ChartTileFullscreenModal: FC<ChartTileFullscreenModalProps> = ({
    opened,
    onClose,
    title,
    children,
}) => {
    const { t } = useTranslation();

    useEffect(() => {
        if (!opened) {
            return;
        }

        // Allow modal layout to settle, then force ECharts resize (listens to window resize).
        const frameId = window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
        const timeoutId = window.setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 150);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
        };
    }, [opened]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Text fw={600} lineClamp={1}>
                    {title}
                </Text>
            }
            fullScreen
            withinPortal
            zIndex={400}
            closeButtonProps={{
                'aria-label': t(
                    'components_dashboard_tiles_chart_fullscreen.exit_fullscreen',
                ),
            }}
            styles={{
                content: {
                    display: 'flex',
                    flexDirection: 'column',
                },
                body: {
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minHeight: 0,
                    paddingTop: 0,
                },
            }}
        >
            {opened ? (
                <Box
                    h="100%"
                    w="100%"
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {children}
                </Box>
            ) : null}
        </Modal>
    );
};

export default ChartTileFullscreenModal;
