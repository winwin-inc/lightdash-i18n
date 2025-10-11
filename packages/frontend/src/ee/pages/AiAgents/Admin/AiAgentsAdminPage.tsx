import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';

import Page from '../../../../components/common/Page/Page';
import { AiAgentsAdminLayout } from '../../../features/aiCopilot/components/Admin/AiAgentsAdminLayout';
import { store } from '../../../features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../../features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';

export const AiAgentsAdminPage = () => {
    const { t } = useTranslation();

    return (
        <Provider store={store}>
            <AiAgentThreadStreamAbortControllerContextProvider>
                <Page title={t('pages_ai_agents_admin.title')} noContentPadding>
                    <AiAgentsAdminLayout />
                </Page>
            </AiAgentThreadStreamAbortControllerContextProvider>
        </Provider>
    );
};
