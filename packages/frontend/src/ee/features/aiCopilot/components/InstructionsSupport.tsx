import {
    Button,
    Grid,
    Group,
    HoverCard,
    Paper,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconBuilding,
    IconChartBar,
    IconTarget,
    IconUser,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon, {
    type MantineIconProps,
} from '../../../../components/common/MantineIcon';

const InstructionsGuidelinesItem = ({
    icon,
    title,
    description,
}: {
    icon: MantineIconProps['icon'];
    title: string;
    description: string;
}) => (
    <HoverCard>
        <HoverCard.Target>
            <Paper
                p="xs"
                withBorder
                style={{
                    borderStyle: 'dashed',
                    cursor: 'help',
                }}
            >
                <Group align="center" gap="xs">
                    <MantineIcon icon={icon} size={20} color="gray" />
                    <Title order={6} c="gray.7" size="xs">
                        {title}
                    </Title>
                </Group>
            </Paper>
        </HoverCard.Target>
        <HoverCard.Dropdown maw={200}>
            <Text size="xs">{description}</Text>
        </HoverCard.Dropdown>
    </HoverCard>
);


export const InstructionsGuidelines = () =>  {
  const { t } = useTranslation();

  const guidelines = [
    {
        icon: IconTarget,
        title: t('features_ai_copilot_instructions.guidelines.domain_knowledge.title'),
        description: t('features_ai_copilot_instructions.guidelines.domain_knowledge.description'),
    },
    {
        icon: IconBuilding,
        title: t('features_ai_copilot_instructions.guidelines.company_context.title'),
        description: t('features_ai_copilot_instructions.guidelines.company_context.description'),
    },
    {
        icon: IconChartBar,
        title: t('features_ai_copilot_instructions.guidelines.analysis_preferences.title'),
        description: t('features_ai_copilot_instructions.guidelines.analysis_preferences.description'),
    },
    {
        icon: IconUser,
        title: t('features_ai_copilot_instructions.guidelines.role_and_expertise.title'),
        description: t('features_ai_copilot_instructions.guidelines.role_and_expertise.description'),
    },
  ];

  return (
    <Grid gutter="xs">
        {guidelines.map((guideline) => (
            <Grid.Col span={3} key={guideline.title}>
                <InstructionsGuidelinesItem {...guideline} />
            </Grid.Col>
        ))}
    </Grid>
  );
}


export const InstructionsTemplates = ({
    onSelect,
}: {
    onSelect: (template: string) => void;
}) => {
  const { t } = useTranslation();

  const templates = [
    {
        icon: `📊`,
        title: t('features_ai_copilot_instructions.templates.marketing_expert.title'),
        description: t('features_ai_copilot_instructions.templates.marketing_expert.description'),
    },
    {
        icon: `🏥`,
        title: t('features_ai_copilot_instructions.templates.healthcare_analyst.title'),
        description: t('features_ai_copilot_instructions.templates.healthcare_analyst.description'),
    },
    {
        icon: `🏭`,
        title: t('features_ai_copilot_instructions.templates.operations_manager.title'),
        description: t('features_ai_copilot_instructions.templates.operations_manager.description'),
    },
    {
        icon: `💰`,
        title: t('features_ai_copilot_instructions.templates.financial_expert.title'),
        description: t('features_ai_copilot_instructions.templates.financial_expert.description'),
    },
    {
        icon: `🛒`,
        title: t('features_ai_copilot_instructions.templates.ecommerce_analyst.title'),
        description: t('features_ai_copilot_instructions.templates.ecommerce_analyst.description'),
    },
    {
        icon: `🎓`,
        title: t('features_ai_copilot_instructions.templates.education_analyst.title'),
        description: t('features_ai_copilot_instructions.templates.education_analyst.description'),
    },
    {
        icon: `🏦`,
        title: t('features_ai_copilot_instructions.templates.banking_risk_analyst.title'),
        description: t('features_ai_copilot_instructions.templates.banking_risk_analyst.description'),
    },
  ];

  return  (
    <Group gap="xs" wrap="wrap">
        {templates.map((template) => (
            <Button
                style={(theme) => ({
                    borderColor: theme.colors.gray[2],
                    borderRadius: theme.radius.lg,
                })}
                color="gray"
                size="xs"
                variant="outline"
                key={template.title}
                onClick={() => onSelect(template.description)}
                leftSection={template.icon}
            >
                {template.title}
            </Button>
        ))}
    </Group>
);

}