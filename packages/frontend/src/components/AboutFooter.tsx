import { LightdashMode } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type MantineSize,
} from '@mantine/core';
import { IconBook, IconInfoCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useApp } from '../providers/AppProvider';
import { TrackPage, TrackSection } from '../providers/TrackingProvider';
import Logo from '../svgs/grey-icon-logo.svg?react';
import { PageName, PageType, SectionName } from '../types/Events';
import MantineIcon from './common/MantineIcon';
import MantineLinkButton from './common/MantineLinkButton';
import { PAGE_CONTENT_WIDTH } from './common/Page/Page';

export const FOOTER_HEIGHT = 80;
export const FOOTER_MARGIN: MantineSize = 'lg';

const AboutFooter: FC<{ minimal?: boolean; maxWidth?: number }> = ({
    minimal,
    maxWidth = PAGE_CONTENT_WIDTH,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const { health: healthState } = useApp();
    const { t } = useTranslation();

    const showUpdateBadge =
        healthState.data?.latest.version &&
        healthState.data.version !== healthState.data.latest.version &&
        healthState.data?.mode === LightdashMode.DEFAULT;

    return (
        <TrackSection name={SectionName.PAGE_FOOTER}>
            <Box mt={FOOTER_MARGIN} h={FOOTER_HEIGHT} component="footer">
                <Divider color="gray.2" w="100%" />

                <Group
                    h="100%"
                    miw={minimal ? '100%' : maxWidth}
                    maw={maxWidth}
                    position="apart"
                    mx="auto"
                >
                    <Button
                        variant={minimal ? 'subtle' : 'light'}
                        color="gray.7"
                        p="xs"
                        fw="500"
                        leftIcon={<Logo />}
                        loading={healthState.isInitialLoading}
                        onClick={() => setIsOpen(true)}
                    >
                        {!minimal && 'Lightdash - '}
                        {healthState.data && `v${healthState.data.version}`}
                        {showUpdateBadge && (
                            <Badge
                                variant="light"
                                ml="xs"
                                radius="xs"
                                size="xs"
                            >
                                {t('components_about_footer.new_version')}
                            </Badge>
                        )}
                    </Button>

                    {minimal ? (
                        <Anchor
                            href="https://docs.lightdash.com/"
                            target="_blank"
                        >
                            <ActionIcon color="gray.7" p="xs" size="lg">
                                <MantineIcon
                                    icon={IconBook}
                                    size="lg"
                                    color="gray.7"
                                />
                            </ActionIcon>
                        </Anchor>
                    ) : (
                        <MantineLinkButton
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            leftIcon={
                                <MantineIcon
                                    icon={IconBook}
                                    size="lg"
                                    color="gray.7"
                                />
                            }
                            variant="light"
                            color="gray.7"
                            fw="500"
                            p="xs"
                        >
                            {t('components_about_footer.documentation')}
                        </MantineLinkButton>
                    )}
                </Group>
            </Box>

            <Modal
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                title={
                    <Group align="center" position="left" spacing="xs">
                        <IconInfoCircle size={17} color="gray" />{' '}
                        {t('components_about_footer.modal.title', {
                            name: 'Lightdash',
                        })}
                    </Group>
                }
            >
                <TrackPage
                    name={PageName.ABOUT_LIGHTDASH}
                    type={PageType.MODAL}
                >
                    <Stack mx="xs">
                        <Title order={5} fw={500}>
                            <b>{t('components_about_footer.modal.version')}</b>{' '}
                            {healthState.data
                                ? `v${healthState.data.version}`
                                : 'n/a'}
                        </Title>
                        {showUpdateBadge && (
                            <Alert
                                title="New version available!"
                                color="blue"
                                icon={<IconInfoCircle size={17} />}
                            >
                                <Text color="blue">
                                    {t(
                                        'components_about_footer.modal.description',
                                        {
                                            version:
                                                healthState.data?.latest
                                                    .version,
                                        },
                                    )}
                                    <Anchor
                                        href="https://docs.lightdash.com/self-host/update-lightdash"
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                            textDecoration: 'underline',
                                        }}
                                    >
                                        {t('components_about_footer.modal.why')}
                                    </Anchor>{' '}
                                    {t(
                                        'components_about_footer.modal.documentation',
                                    )}
                                </Text>
                            </Alert>
                        )}

                        <Group position="right">
                            <MantineLinkButton
                                href="https://docs.lightdash.com/"
                                target="_blank"
                                variant="default"
                            >
                                {t('components_about_footer.group.docs')}
                            </MantineLinkButton>
                            <MantineLinkButton
                                href="https://github.com/lightdash/lightdash"
                                target="_blank"
                                variant="default"
                            >
                                {t('components_about_footer.group.github')}
                            </MantineLinkButton>
                        </Group>
                    </Stack>
                </TrackPage>
            </Modal>
        </TrackSection>
    );
};

export default AboutFooter;
