import { Title, type TitleProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

export const OnboardingTitle: FC<React.PropsWithChildren<TitleProps>> = ({
    children,
}) => {
    return (
        <Title order={3} fw={500}>
            {children}
        </Title>
    );
};

interface OnboardingConnectTitleProps {
    isCreatingFirstProject: boolean;
}

export const OnboardingConnectTitle: FC<OnboardingConnectTitleProps> = ({
    isCreatingFirstProject,
}) => {
    const { t } = useTranslation();

    return (
        <OnboardingTitle>
            {isCreatingFirstProject
                ? t(
                      'components_project_connection_flow.onboarding_title.set_up',
                  )
                : t(
                      'components_project_connection_flow.onboarding_title.connect_new_project',
                  )}
        </OnboardingTitle>
    );
};
