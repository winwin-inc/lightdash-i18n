// STUB: minimal submit button (upstream uses CSS module + ActionIcon chrome).
import { ActionIcon } from '@mantine-8/core';
import { type Icon } from '@tabler/icons-react';
import MantineIcon from '../MantineIcon';

type Props = {
    icon: Icon;
    label: string;
    onClick: () => void;
    size?: 'sm' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    destructive?: boolean;
    accent?: 'none' | 'indigo';
    className?: string;
};

export const ComposerSubmitButton = ({
    icon,
    label,
    onClick,
    size = 'lg',
    disabled = false,
    loading = false,
    className,
}: Props) => (
    <ActionIcon
        variant="filled"
        size={size === 'lg' ? 'lg' : 'md'}
        className={className}
        disabled={disabled}
        loading={loading}
        onClick={onClick}
        aria-label={label}
    >
        <MantineIcon icon={icon} size={size === 'lg' ? 20 : 18} stroke={2} />
    </ActionIcon>
);
