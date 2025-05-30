import {
    ActionIcon,
    Button,
    Group,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useColorPalettes,
    useSetActiveColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { CreatePaletteModal } from './CreatePaletteModal';
import { PaletteItem } from './PaletteItem';

const AppearanceColorSettings: FC = () => {
    const { t } = useTranslation();

    const { data: organization } = useOrganization();
    const { data: health, isLoading: isHealthLoading } = useHealth();
    const { data: palettes = [], isLoading: isPalettesLoading } =
        useColorPalettes();

    const setActivePalette = useSetActiveColorPalette();

    const [isCreatePaletteModalOpen, setIsCreatePaletteModalOpen] =
        useState(false);

    const handleSetActive = useCallback(
        (uuid: string) => {
            setActivePalette.mutate(uuid);
        },
        [setActivePalette],
    );

    const hasColorPaletteOverride =
        health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    return (
        <Stack spacing="md">
            <Group position="apart">
                <Text size="sm" color="gray.6">
                    {t(
                        'components_user_settings_appearance_settings_panel.customize_color_palettes',
                    )}
                </Text>

                <Button
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatePaletteModalOpen(true)}
                    variant="default"
                    size="xs"
                    sx={{ alignSelf: 'flex-end' }}
                    disabled={hasColorPaletteOverride}
                >
                    {t(
                        'components_user_settings_appearance_settings_panel.new_palette',
                    )}
                </Button>
            </Group>

            <Stack spacing="xs">
                {isPalettesLoading || isHealthLoading ? (
                    <>
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                    </>
                ) : (
                    <>
                        {hasColorPaletteOverride &&
                            health?.appearance.overrideColorPalette &&
                            organization?.organizationUuid && (
                                <PaletteItem
                                    palette={{
                                        colorPaletteUuid: 'custom',
                                        createdAt: new Date(),
                                        name:
                                            health.appearance
                                                .overrideColorPaletteName ??
                                            'Custom override',
                                        colors: health.appearance
                                            .overrideColorPalette,
                                        organizationUuid:
                                            organization?.organizationUuid,
                                    }}
                                    isActive={true}
                                    readOnly
                                    onSetActive={undefined}
                                />
                            )}
                        {palettes.map((palette) => (
                            <PaletteItem
                                key={palette.colorPaletteUuid}
                                palette={palette}
                                isActive={
                                    palette.isActive && !hasColorPaletteOverride
                                }
                                onSetActive={
                                    hasColorPaletteOverride
                                        ? undefined
                                        : handleSetActive
                                }
                            />
                        ))}
                    </>
                )}
            </Stack>

            <CreatePaletteModal
                key={`create-palette-modal-${isCreatePaletteModalOpen}`}
                opened={isCreatePaletteModalOpen}
                onClose={() => {
                    setIsCreatePaletteModalOpen(false);
                }}
            />
        </Stack>
    );
};

const AppearanceSettingsPanel: FC = () => {
    const { t } = useTranslation();

    return (
        <Stack spacing="sm">
            <Group spacing="xxs">
                <Title order={5}>
                    {t(
                        'components_user_settings_appearance_settings_panel.appearance_settings',
                    )}
                </Title>
                <Tooltip
                    label={t(
                        'components_user_settings_appearance_settings_panel.customizing',
                    )}
                    position="bottom"
                >
                    <ActionIcon
                        component="a"
                        href="https://docs.lightdash.com/guides/customizing-the-appearance-of-your-project"
                        target="_blank"
                        rel="noreferrer"
                        size="xs"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <SettingsCard mb="lg">
                <AppearanceColorSettings />
            </SettingsCard>
        </Stack>
    );
};

export default AppearanceSettingsPanel;
