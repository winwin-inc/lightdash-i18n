import { ActionIcon, Box } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { useWeChatMiniProgram } from '../hooks/useWeChatMiniProgram';
import MantineIcon from './common/MantineIcon';

/**
 * 微信小程序悬浮返回按钮
 * 在微信小程序嵌套场景下，显示在右下角的固定按钮，点击可快速返回小程序
 */
const WeChatMiniProgramBackButton: FC = () => {
    const { isMiniProgram, isReady, navigateBack } = useWeChatMiniProgram();

    // 只在微信小程序环境下显示
    if (!isMiniProgram || !isReady) {
        return null;
    }

    const handleClick = () => {
        navigateBack(1);
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
                    bottom: 'calc(20vh + env(safe-area-inset-bottom, 0px))',
                    right: 'calc(16px + env(safe-area-inset-right, 0px))',
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
