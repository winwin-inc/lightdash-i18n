import { Anchor, Box } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Can } from '../providers/Ability';
import SuboptimalState from './common/SuboptimalState/SuboptimalState';

const ForbiddenPanel: FC<{ subject?: string }> = ({ subject }) => {
    const { t } = useTranslation();

    return (
        <Box mt="30vh">
            <SuboptimalState
                title={`${t('components_forbidden_panel.title.part_1')}${
                    subject
                        ? ` ${t(
                              'components_forbidden_panel.title.part_2',
                          )} ${subject}`
                        : ''
                }`}
                description={
                    <>
                        {' '}
                        <p>
                            {t('components_forbidden_panel.description.part_1')}
                        </p>
                        <Can I="create" a={'Project'}>
                            {(isAllowed) => {
                                return (
                                    isAllowed && (
                                        <Anchor
                                            component={Link}
                                            to="/createProject"
                                        >
                                            {t(
                                                'components_forbidden_panel.description.part_2',
                                            )}
                                        </Anchor>
                                    )
                                );
                            }}
                        </Can>
                    </>
                }
                icon={IconLock}
            />
        </Box>
    );
};

export default ForbiddenPanel;
