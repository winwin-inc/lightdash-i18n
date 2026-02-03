import { type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import useUser from '../../hooks/user/useUser';
import AppProviderContext from './context';

const AppProvider: FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const health = useHealth();
    // Note: CDN base URL is already set in HTML by backend via <base> tag injection
    // No need to fetch CDN config via API - the base tag handles resource loading

    const user = useUser(!!health?.data?.isAuthenticated);

    const value = {
        health,
        user,
    };

    return (
        <AppProviderContext.Provider value={value}>
            {children}
        </AppProviderContext.Provider>
    );
};

export default AppProvider;
