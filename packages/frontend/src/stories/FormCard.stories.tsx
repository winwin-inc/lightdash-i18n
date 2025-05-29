import {
    Button,
    Card,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
    Title,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react';
import { useTranslation } from 'react-i18next';

interface FormCardProps {
    hasError?: boolean;
}

export function FormCard({ hasError = false }: FormCardProps) {
    const { t } = useTranslation();

    const errorMessage = hasError
        ? t('stories_form_card.tips.field_is_required')
        : undefined;

    return (
        <Card shadow="subtle" radius="md" p="lg">
            <Stack>
                <Title order={4}>
                    {t('stories_form_card.tips.this_is_a_form_card')}
                </Title>
                <Stack>
                    <TextInput
                        radius="md"
                        label={t('stories_form_card.name.label')}
                        placeholder={t('stories_form_card.name.placeholder')}
                        error={errorMessage}
                    />
                    <TextInput
                        radius="md"
                        label={t('stories_form_card.email.label')}
                        placeholder={t('stories_form_card.email.placeholder')}
                        error={errorMessage}
                    />
                    <TextInput
                        radius="md"
                        label={t('stories_form_card.phone.label')}
                        placeholder={t('stories_form_card.phone.placeholder')}
                        error={errorMessage}
                    />
                    <Select
                        radius="md"
                        label={t('stories_form_card.login_options.label')}
                        placeholder={t(
                            'stories_form_card.login_options.placeholder',
                        )}
                        data={['Option 1', 'Option 2', 'Option 3']}
                        error={errorMessage}
                    />
                    <Switch label={t('stories_form_card.remember_me.label')} />
                    <SegmentedControl
                        radius="md"
                        data={['Option 1', 'Option 2', 'Option 3']}
                        sx={{
                            alignSelf: 'flex-start',
                        }}
                    />
                    <Button
                        type="submit"
                        radius="md"
                        variant="darkPrimary"
                        sx={{
                            alignSelf: 'flex-end',
                        }}
                    >
                        {t('stories_form_card.submit.label')}
                    </Button>
                </Stack>
            </Stack>
        </Card>
    );
}

const meta: Meta<typeof FormCard> = {
    component: FormCard,
    argTypes: {
        hasError: {
            control: 'boolean',
            description: 'Toggle error state for all form inputs',
            defaultValue: false,
        },
    },
};

export default meta;
type Story = StoryObj<typeof FormCard>;

export const Primary: Story = {
    args: {
        hasError: false,
    },
};
