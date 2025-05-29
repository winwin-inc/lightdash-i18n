import { ContentType } from '@lightdash/common';
import { Center, SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

interface OptionProps {
    label: string;
    color?: string;
}

const ContentTypeSelectOption = ({ label }: OptionProps) => (
    <Center px={'xxs'}>
        <Text size="sm" color="gray.7">
            {label}
        </Text>
    </Center>
);

type ContentTypeFilterProps = {
    value: ContentType | undefined;
    onChange: (value: ContentType | undefined) => void;
    options: ContentType[];
};

const ContentTypeFilter: FC<ContentTypeFilterProps> = ({
    value,
    onChange,
    options,
}) => {
    const { t } = useTranslation();

    const ContentTypeOptions = [
        {
            value: ContentType.DASHBOARD,
            label: (
                <ContentTypeSelectOption
                    label={t(
                        'components_common_resource_view_content_type.dashboards',
                    )}
                    color={'green.8'}
                />
            ),
        },
        {
            value: ContentType.CHART,
            label: (
                <ContentTypeSelectOption
                    label={t(
                        'components_common_resource_view_content_type.charts',
                    )}
                    color={'blue.8'}
                />
            ),
        },
    ];

    return (
        <SegmentedControl
            size="xs"
            radius="md"
            value={value ?? 'all'}
            onChange={(newValue) =>
                onChange(
                    newValue === 'all' ? undefined : (newValue as ContentType),
                )
            }
            data={[
                {
                    value: 'all',
                    label: (
                        <ContentTypeSelectOption
                            label={t(
                                'components_common_resource_view_content_type.all',
                            )}
                        />
                    ),
                },
                ...ContentTypeOptions.filter((option) =>
                    options?.includes(option.value),
                ),
            ]}
        />
    );
};

export default ContentTypeFilter;
