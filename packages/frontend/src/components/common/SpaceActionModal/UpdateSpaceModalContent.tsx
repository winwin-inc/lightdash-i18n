import { TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type SpaceModalBody } from '.';

const UpdateSpaceModalContent: FC<SpaceModalBody> = ({ form }) => {
    const { t } = useTranslation();
    return (
        <TextInput
            {...form.getInputProps('name')}
            label={t('components_space_action_modal_update.form.name.label')}
            placeholder={t(
                'components_space_action_modal_update.form.name.placeholder',
            )}
        />
    );
};

export default UpdateSpaceModalContent;
