import { friendlyName } from '@lightdash/common';
import { type FormErrors } from '@mantine/form';
import { useTranslation } from 'react-i18next';

import useToaster from '../../hooks/toaster/useToaster';

export const useOnProjectError = () => {
    const { showToastError } = useToaster();
    const { t } = useTranslation();

    return (errors: FormErrors) => {
        if (!errors) {
            showToastError({
                title: t('components_project_connection.tips_error.title'),
                subtitle: t(
                    'components_project_connection.tips_error.subtitle',
                ),
            });
        } else {
            const errorMessages: string[] = Object.entries(errors).reduce<any>(
                (acc, [field, message]) => {
                    const parts = field.split('.');
                    if (parts.length === 1) {
                        return [...acc, message?.toString()];
                    }
                    const [section, _key] = parts;

                    return [...acc, `${friendlyName(section)}: ${message}`];
                },
                [],
            );
            showToastError({
                title: t('components_project_connection.tips_error.form_error'),
                subtitle: errorMessages.join('\n\n'),
            });
        }
    };
};
