import { IconLoader2 } from '@tabler/icons-react';
import { useCallback, type FC, type PropsWithChildren } from 'react';
import useToaster from '../hooks/toaster/useToaster';
import { useWeChatMiniProgramBackHandler } from '../hooks/useWeChatMiniProgram';
import WeChatMiniProgramBackButton from './WeChatMiniProgramBackButton';
import MantineIcon from './common/MantineIcon';

/**
 * 移动端布局组件
 * 用于包装所有移动端路由，确保微信小程序回退处理在所有移动端页面生效
 * 包括 PUBLIC_ROUTES（如登录页）和 PRIVATE_ROUTES
 */
const MobileLayout: FC<PropsWithChildren> = ({ children }) => {
    const { showToastInfo } = useToaster();

    // 回退操作的回调函数，显示 toast 提示
    const handleNavigateBack = useCallback(() => {
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
    }, [showToastInfo]);

    // 处理微信小程序回退（在所有移动端页面生效，包括登录页等公开路由）
    useWeChatMiniProgramBackHandler(handleNavigateBack);

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
            {children}
            <WeChatMiniProgramBackButton />
        </>
    );
};

export default MobileLayout;
