import { Button, Flex, Popover, Text } from '@mantine/core';
import { useCallback, type FC, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
    opened: boolean;
    onClose: () => void;
    onMultiValue: () => void;
    onSingleValue: () => void;
};

const MultiValuePastePopUp: FC<PropsWithChildren<Props>> = ({
    opened,
    onClose,
    onMultiValue,
    onSingleValue,
    children,
}) => {
    const { t } = useTranslation();

    const onSingleValueClick = useCallback(() => {
        onSingleValue();
        onClose();
    }, [onClose, onSingleValue]);

    const onMultiValueClick = useCallback(() => {
        onMultiValue();
        onClose();
    }, [onClose, onMultiValue]);

    return (
        <Popover
            opened={opened}
            onClose={onClose}
            position="top-start"
            withArrow
            arrowPosition="side"
        >
            <Popover.Target>{children}</Popover.Target>
            <Popover.Dropdown>
                <Text weight={500}>
                    {t(
                        'components_common_filters_inputs.multi_value_paste_popver.title',
                    )}
                </Text>
                <Text>
                    {t(
                        'components_common_filters_inputs.multi_value_paste_popver.subtitle',
                    )}
                </Text>
                <Flex mt="xl" align={'center'} gap={'sm'} justify={'flex-end'}>
                    <Button
                        variant="light"
                        size="sm"
                        onClick={onSingleValueClick}
                    >
                        {t(
                            'components_common_filters_inputs.multi_value_paste_popver.single_value',
                        )}
                    </Button>
                    <Button
                        variant="light"
                        size="sm"
                        onClick={onMultiValueClick}
                    >
                        {t(
                            'components_common_filters_inputs.multi_value_paste_popver.multiple_value',
                        )}
                    </Button>
                </Flex>
            </Popover.Dropdown>
        </Popover>
    );
};

export default MultiValuePastePopUp;
