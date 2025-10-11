import { DashboardSummaryTone, type DashboardSummary } from '@lightdash/common';
import { Button, Flex, Select, Stack, Textarea } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import capitalize from 'lodash/capitalize';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { getToneEmoji } from '../utils';
import AudienceInput from './AudienceInput';

type PresetsFormProps = {
    summary?: DashboardSummary;
    isLoading: boolean;
    onFormSubmit: (
        presets: Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>,
    ) => void;
    handleCancel: () => void;
};

const validationSchema = z.object({
    context: z.string().optional(),
    tone: z.nativeEnum(DashboardSummaryTone),
    audiences: z.string().array(),
});

type PresetFormValues = z.infer<typeof validationSchema>;

// this never changes so we can keep it outside of the component
const TONE_SELECT_DATA = Object.values(DashboardSummaryTone).map((tone) => ({
    value: tone,
    label: `${getToneEmoji(tone)} ${capitalize(tone)}`,
}));

const PresetsForm: FC<PresetsFormProps> = ({
    summary,
    isLoading,
    onFormSubmit,
    handleCancel,
}) => {
    const { t } = useTranslation();

    const placeholder = `${t(
        'ai_dashboard_summary_presets_form.placeholder.part_1',
    )}\n\n${t('ai_dashboard_summary_presets_form.placeholder.part_2')}\n\n${t(
        'ai_dashboard_summary_presets_form.placeholder.part_3',
    )}\n\n${t('ai_dashboard_summary_presets_form.placeholder.part_4')}\n\n${t(
        'ai_dashboard_summary_presets_form.placeholder.part_5',
    )}\n\n${t('ai_dashboard_summary_presets_form.placeholder.part_6')}`;

    const form = useForm<PresetFormValues>({
        initialValues: {
            context: summary?.context ?? undefined, // in db it is null, but form should be initialized with undefined otherwise it warns about controlled/uncontrolled input
            tone: summary?.tone || DashboardSummaryTone.FRIENDLY,
            audiences: summary?.audiences ?? [],
        },
        validate: zodResolver(validationSchema),
    });

    return (
        <form
            id="dashboard-summary-presets-form"
            onSubmit={form.onSubmit(onFormSubmit)}
        >
            <Stack w="100%">
                <Select
                    label={t('ai_dashboard_summary_presets_form.tone')}
                    data={TONE_SELECT_DATA}
                    withinPortal
                    w="25%"
                    {...form.getInputProps('tone')}
                />
                <AudienceInput
                    label={t('ai_dashboard_summary_presets_form.audiences')}
                    w="35%"
                    {...form.getInputProps('audiences')}
                />
                <Textarea
                    label={t('ai_dashboard_summary_presets_form.context')}
                    placeholder={placeholder}
                    autosize
                    minRows={10}
                    maxRows={10}
                    {...form.getInputProps('context')}
                />

                <Flex gap="md" justify="flex-end">
                    <Button type="submit" loading={isLoading}>
                        {t('ai_dashboard_summary_presets_form.generate')}
                    </Button>
                    <Button
                        onClick={handleCancel}
                        variant="subtle"
                        disabled={isLoading}
                    >
                        {t('ai_dashboard_summary_presets_form.cancel')}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default PresetsForm;
