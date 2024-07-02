import { Button, NumberInput, Stack } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import useHealth from '../../hooks/health/useHealth';
import { type Props } from './index';

type LimitFormProps = Pick<Props, 'limit' | 'onLimitChange'>;

const LimitForm = forwardRef<HTMLFormElement, LimitFormProps>(
    ({ limit, onLimitChange }, ref) => {
        const { t } = useTranslation();

        const health = useHealth();
        const max = health.data?.query.maxLimit || 5000;

        const schema = z.object({
            limit: z
                .number({
                    invalid_type_error: t(
                        'components_limit_button.schema_error.invalid_value',
                    ),
                })
                .int()
                .min(
                    1,
                    `${t(
                        'components_limit_button.schema_error.minium_value',
                    )}: 1`,
                )
                .max(
                    max,
                    `${t(
                        'components_limit_button.schema_error.maximum_value',
                    )}: ${max}`,
                ),
        });

        const form = useForm({
            validate: zodResolver(schema),
            validateInputOnChange: true,
            initialValues: { limit },
        });

        if (!health.data) {
            return null;
        }

        return (
            <form
                ref={ref}
                onSubmit={form.onSubmit(({ limit: newLimit }) => {
                    onLimitChange(newLimit);
                })}
            >
                <Stack w={200}>
                    <NumberInput
                        autoFocus
                        step={100}
                        min={1}
                        required
                        label={t('components_limit_button.total_rows')}
                        {...form.getInputProps('limit')}
                    />

                    <Button
                        size={'xs'}
                        type="submit"
                        disabled={!form.isValid()}
                        sx={{ alignSelf: 'flex-end' }}
                    >
                        {t('components_limit_button.apply')}
                    </Button>
                </Stack>
            </form>
        );
    },
);

export default LimitForm;
