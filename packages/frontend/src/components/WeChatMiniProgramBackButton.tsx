import { ActionIcon, Box } from '@mantine/core';
import { IconArrowLeft, IconLoader2 } from '@tabler/icons-react';
import { type FC } from 'react';
import useToaster from '../hooks/toaster/useToaster';
import { log, useWeChatMiniProgram } from '../hooks/useWeChatMiniProgram';
import MantineIcon from './common/MantineIcon';

/**
 * 微信小程序悬浮返回按钮
 * 在微信小程序嵌套场景下，显示在右下角的固定按钮，点击可快速返回小程序
 */
const WeChatMiniProgramBackButton: FC = () => {
    const { isMiniProgram, isReady, navigateBack } = useWeChatMiniProgram();
    const { showToastInfo } = useToaster();

    // 只在微信小程序环境下显示
    if (!isMiniProgram || !isReady) {
        log.info('isMiniProgram or isReady is false', {
            isMiniProgram,
            isReady,
        });
        return null;
    }

    const handleClick = () => {
        log.info('handleClick', { isMiniProgram, isReady });

        // 显示 toast 提示
        showToastInfo({
            icon: (
                <MantineIcon
                    icon={IconLoader2}
                    size="lg"
                    style={{
                        animation: 'spin 1s linear infinite',
                    }}
                />
            ),
            title: '返回中...',
            autoClose: 2000,
        });

        // 延迟执行回退操作，确保 toast 有时间渲染（200ms）
        setTimeout(() => {
            navigateBack(1);
        }, 200);
    };

    return (
        <>
            <style>
                {`
                    @keyframes spin {
                        from {
                            transform: rotate(0deg);
                        }
                        to {
                            transform: rotate(360deg);
                        }
                    }
                `}
            </style>
            <Box
                style={{
                    position: 'fixed',
                    bottom: 'calc(220px + env(safe-area-inset-bottom, 0px))',
                    right: 'calc(20px + env(safe-area-inset-right, 0px))',
                    zIndex: 1000,
                }}
            >
                <ActionIcon
                    size="xl"
                    radius="xl"
                    variant="filled"
                    color="blue"
                    onClick={handleClick}
                    aria-label="返回小程序"
                >
                    <MantineIcon icon={IconArrowLeft} size="lg" />
                </ActionIcon>
            </Box>
        </>
    );
};

export default WeChatMiniProgramBackButton;
