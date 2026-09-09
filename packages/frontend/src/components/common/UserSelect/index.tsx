import { Loader, Select, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';

const getUserDisplayName = (
    firstName: string | undefined,
    lastName: string | undefined,
    email: string,
): string => {
    if (firstName && lastName) {
        return `${firstName} ${lastName}`;
    }
    return email;
};

type UserSelectProps = {
    value: string | null;
    onChange: (value: string | null) => void;
    excludedUserUuid?: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    projectUuid?: string;
};

export const UserSelect: FC<UserSelectProps> = ({
    value,
    onChange,
    excludedUserUuid,
    label,
    placeholder,
    disabled = false,
    clearable = false,
    projectUuid,
}) => {
    const { t } = useTranslation();
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearchValue] = useDebouncedValue(searchValue, 300);

    const { data: organizationUsers, isLoading: isLoadingUsers } =
        useOrganizationUsers({
            searchInput: debouncedSearchValue || undefined,
            projectUuid,
        });

    const eligibleUsers = useMemo(() => {
        if (!organizationUsers) return [];
        if (!excludedUserUuid) return organizationUsers;
        return organizationUsers.filter(
            (user) => user.userUuid !== excludedUserUuid,
        );
    }, [organizationUsers, excludedUserUuid]);

    const selectData = useMemo(() => {
        return eligibleUsers.map((user) => ({
            value: user.userUuid,
            label: getUserDisplayName(
                user.firstName,
                user.lastName,
                user.email,
            ),
            email: user.email,
        }));
    }, [eligibleUsers]);

    return (
        <Select
            label={label}
            placeholder={
                placeholder ?? t('components_common_user_select.placeholder')
            }
            searchable
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            value={value}
            onChange={onChange}
            data={selectData}
            nothingFound={t('components_common_user_select.nothing_found')}
            maxDropdownHeight={250}
            disabled={disabled}
            clearable={clearable}
            withinPortal
            rightSection={isLoadingUsers ? <Loader size="xs" /> : null}
            itemComponent={({ label: optionLabel, email, ...others }) => (
                <div {...others}>
                    <Stack spacing={2}>
                        <Text size="sm" fw={500}>
                            {optionLabel}
                        </Text>
                        {email && (
                            <Text size="xs" color="dimmed">
                                {email}
                            </Text>
                        )}
                    </Stack>
                </div>
            )}
            filter={() => true}
        />
    );
};
