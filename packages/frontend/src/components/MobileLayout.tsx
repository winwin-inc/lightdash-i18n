import { type FC, type PropsWithChildren } from 'react';
import { useWeChatMiniProgramBackHandler } from '../hooks/useWeChatMiniProgram';
import WeChatMiniProgramBackButton from './WeChatMiniProgramBackButton';

/**
 * 移动端布局组件
 * 用于包装所有移动端路由，确保微信小程序回退处理在所有移动端页面生效
 * 包括 PUBLIC_ROUTES（如登录页）和 PRIVATE_ROUTES
 */
const MobileLayout: FC<PropsWithChildren> = ({ children }) => {
    useWeChatMiniProgramBackHandler();

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
