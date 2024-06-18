import {
    getEmailSchema,
    getPasswordSchema,
    type CreateUserArgs,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    PasswordInput,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import PasswordTextInput from '../PasswordTextInput';

type Props = {
    isLoading: boolean;
    readOnlyEmail?: string;
    onSubmit: (data: CreateUserArgs) => void;
};

const validationSchema = z.object({
    email: getEmailSchema(),
    password: getPasswordSchema(),
});

const CreateUserForm: FC<Props> = ({ isLoading, readOnlyEmail, onSubmit }) => {
    const { t } = useTranslation();
    const form = useForm<CreateUserArgs>({
        initialValues: {
            firstName: '',
            lastName: '',
            email: readOnlyEmail || '',
            password: '',
        },
        validate: zodResolver(validationSchema),
    });

    return (
        <form name="register" onSubmit={form.onSubmit(onSubmit)}>
            <Stack spacing="md">
                <Flex direction="row" gap="xs">
                    <TextInput
                        label={t(
                            'components_register_form.create_user_form.first_name.label',
                        )}
                        name="firstName"
                        placeholder={t(
                            'components_register_form.create_user_form.first_name.placeholder',
                        )}
                        disabled={isLoading}
                        required
                        {...form.getInputProps('firstName')}
                    />
                    <TextInput
                        label={t(
                            'components_register_form.create_user_form.last_name.label',
                        )}
                        name="lastName"
                        placeholder={t(
                            'components_register_form.create_user_form.last_name.placeholder',
                        )}
                        disabled={isLoading}
                        required
                        {...form.getInputProps('lastName')}
                    />
                </Flex>
                <TextInput
                    label={t(
                        'components_register_form.create_user_form.email.label',
                    )}
                    name="email"
                    placeholder={t(
                        'components_register_form.create_user_form.email.placeholder',
                    )}
                    required
                    {...form.getInputProps('email')}
                    disabled={isLoading || !!readOnlyEmail}
                    data-cy="email-address-input"
                />
                <PasswordTextInput
                    passwordValue={form.values.password as string}
                >
                    <PasswordInput
                        label={t(
                            'components_register_form.create_user_form.password.label',
                        )}
                        name="password"
                        placeholder={t(
                            'components_register_form.create_user_form.password.placeholder',
                        )}
                        required
                        {...form.getInputProps('password')}
                        data-cy="password-input"
                        disabled={isLoading}
                    />
                </PasswordTextInput>
                <Button
                    type="submit"
                    loading={isLoading}
                    disabled={isLoading}
                    data-cy="signup-button"
                >
                    {t('components_register_form.create_user_form.sign_up')}
                </Button>
                <Text mx="auto">
                    {t(
                        'components_register_form.create_user_form.alreday_registered',
                    )}
                    <Anchor href="/signin">
                        {' '}
                        {t('components_register_form.create_user_form.sign_in')}
                    </Anchor>
                </Text>
            </Stack>
        </form>
    );
};

export default CreateUserForm;
