import { type ApiError } from '@lightdash/common';
import { Alert, Loader, type AlertProps } from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../common/MantineIcon';

type ProjectStatusCalloutProps = Omit<AlertProps, 'children'> & {
    isSuccess: boolean;
    isError: boolean;
    isLoading: boolean;
    error: ApiError | null;
};

const ProjectStatusCallout: FC<ProjectStatusCalloutProps> = ({
    isSuccess,
    isError,
    isLoading,
    error,
    ...props
}) => {
    const { t } = useTranslation();

    let stateProps: AlertProps;

    if (isLoading) {
        stateProps = {
            color: 'blue',
            title: t(
                'components_project_connection_project_status_callout.updating_project_settings',
            ),
            icon: <Loader size="lg" />,
            children: undefined,
            styles: { title: { marginBottom: 0 } },
        };
    } else if (isSuccess) {
        stateProps = {
            color: 'green',
            title: t(
                'components_project_connection_project_status_callout.project_settings_updated',
            ),
            icon: <MantineIcon icon={IconCircleCheckFilled} size="lg" />,
            children: undefined,
            styles: { title: { marginBottom: 0 } },
        };
    } else if (isError) {
        stateProps = {
            color: 'red',
            title: t(
                'components_project_connection_project_status_callout.updating_error',
            ),
            icon: <MantineIcon icon={IconAlertTriangleFilled} size="lg" />,
            children: error ? (
                <MDEditor.Markdown
                    source={error.error.message.replaceAll('\n', '\n\n')}
                    rehypePlugins={[
                        [rehypeExternalLinks, { target: '_blank' }],
                    ]}
                    style={{
                        background: 'transparent',
                        fontSize: '12px',
                    }}
                />
            ) : null,
            styles: error ? { title: { marginBottom: 0 } } : undefined,
        };
    } else {
        stateProps = {
            color: 'blue',
            title: t(
                'components_project_connection_project_status_callout.updating_project_settings',
            ),
            icon: <Loader size="lg" />,
            children: undefined,
            styles: { title: { marginBottom: 0 } },
        };
    }

    return <Alert {...props} {...stateProps} />;
};

export default ProjectStatusCallout;
