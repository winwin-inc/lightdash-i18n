import { Button } from '@mantine/core';
import { IconMessageCircleStar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useActiveProject } from '../../hooks/useActiveProject';
import MantineIcon from '../common/MantineIcon';

export const AiAgentsButton = () => {
    const { t } = useTranslation();

    // Using `navigate` instead of the `Link` component to ensure round corners within a button group
    const navigate = useNavigate();
    const { data: projectUuid } = useActiveProject();
    const isVisible = useAiAgentButtonVisibility();
    if (!isVisible) {
        return null;
    }
    return (
        <Button
            size="xs"
            variant="default"
            fz="sm"
            leftIcon={
                <MantineIcon icon={IconMessageCircleStar} color="#adb5bd" />
            }
            onClick={() => navigate(`/projects/${projectUuid}/ai-agents`)}
        >
            {t('components_navbar_ai_agents_button.ask_ai')}
        </Button>
    );
};
