import { Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({ projectUuid }) => {
        const { t } = useTranslation();
        const { data, isInitialLoading, error } = useCompiledSql();

        return (
            <Button
                {...COLLAPSABLE_CARD_BUTTON_PROPS}
                component={Link}
                to={{
                    pathname: `/projects/${projectUuid}/sql-runner`,
                }}
                state={{ sql: data?.query }} // pass SQL as location state
                leftIcon={<MantineIcon icon={IconTerminal2} color="gray" />}
                disabled={isInitialLoading || !!error}
            >
                {t('components_open_in_sql_runner_button.open_in_sql_runner')}
            </Button>
        );
    },
);

export default OpenInSqlRunnerButton;
