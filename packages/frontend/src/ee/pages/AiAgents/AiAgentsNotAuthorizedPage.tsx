import {
    Avatar,
    Box,
    Button,
    Center,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowLeft, IconLock, IconRobot } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import MantineIcon from '../../../components/common/MantineIcon';
import { AiAgentPageLayout } from '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout';

const AiAgentsNotAuthorizedPage: FC = () => {
    const { t } = useTranslation();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <AiAgentPageLayout>
            <Center h="80%">
                <Stack align="center" maw="480px">
                    <Box pos="relative">
                        <Avatar size={80} color="gray">
                            <MantineIcon
                                icon={IconRobot}
                                size={48}
                                strokeWidth={1.5}
                            />
                        </Avatar>
                        <Box
                            pos="absolute"
                            bottom={0}
                            right={0}
                            bg="white"
                            p={4}
                            style={{
                                borderRadius: '50%',
                                border: '1px solid #e0e0e0',
                            }}
                        >
                            <MantineIcon
                                icon={IconLock}
                                size={18}
                                color="yellow"
                                strokeWidth={1.5}
                            />
                        </Box>
                    </Box>

                    <Title order={3} ta="center">
                        {t('pages_ai_agents_not_authorized.title')}
                    </Title>
                    <Paper p="md" shadow="subtle" w="100%">
                        <Stack align="center" gap="xs">
                            <Text size="xs" c="dimmed" ta="center">
                                {t('pages_ai_agents_not_authorized.content')}
                            </Text>
                            <Button
                                variant="subtle"
                                color="gray"
                                leftSection={
                                    <MantineIcon icon={IconArrowLeft} />
                                }
                                component={Link}
                                to={`/projects/${projectUuid}/home`}
                            >
                                {t(
                                    'pages_ai_agents_not_authorized.go_back_to_project_home',
                                )}
                            </Button>
                        </Stack>
                    </Paper>
                </Stack>
            </Center>
        </AiAgentPageLayout>
    );
};

export default AiAgentsNotAuthorizedPage;
