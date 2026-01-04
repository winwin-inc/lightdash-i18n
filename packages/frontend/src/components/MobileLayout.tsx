import { type FC, type PropsWithChildren } from 'react';
import { useWeChatMiniProgramBackHandler } from '../hooks/useWeChatMiniProgram';

/**
 * 移动端布局组件
 * 用于包装所有移动端路由，确保微信小程序回退处理在所有移动端页面生效
 * 包括 PUBLIC_ROUTES（如登录页）和 PRIVATE_ROUTES
 */
const MobileLayout: FC<PropsWithChildren> = ({ children }) => {
    // 处理微信小程序回退（在所有移动端页面生效，包括登录页等公开路由）
    useWeChatMiniProgramBackHandler();

    return <>{children}</>;
};

export default MobileLayout;

