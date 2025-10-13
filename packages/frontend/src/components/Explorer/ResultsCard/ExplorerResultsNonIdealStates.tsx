import { type ApiErrorDetail } from '@lightdash/common';
import { Anchor, createStyles, keyframes, Loader, Text } from '@mantine/core';
import { IconTableOff } from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import NoTableIcon from '../../../svgs/emptystate-no-table.svg?react';
import { SectionName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { RefreshButton } from '../../RefreshButton';

const animationKeyframes = keyframes`
    0% {
        opacity: 0;
    }
    5% {
        opacity: 0;
        transform: translateY(-10px);
    }
    10% {
        opacity: 1;
        transform: translateY(0px);
    }
    25% {
        opacity: 1;
        transform: translateY(0px);
    }
    30% {
        opacity: 0;
        transform: translateY(10px);
    }
    80% {
        opacity: 0;
    }
    100% {
        opacity: 0;
    }
`;

const useAnimatedTextStyles = createStyles((theme) => ({
    root: {
        position: 'relative',
        height: theme.spacing.lg,
        textAlign: 'center',
        width: '100%',

        '& > span': {
            animation: `${animationKeyframes} 16s linear infinite 0s`,
            opacity: 0,
            overflow: 'hidden',
            position: 'absolute',
            width: '100%',
            left: 0,
        },

        '& span:nth-of-type(2)': {
            animationDelay: '4s',
        },

        '& span:nth-of-type(3)': {
            animationDelay: '8s',
        },

        '& span:nth-of-type(4)': {
            animationDelay: '12s',
        },
    },
}));

const ExploreDocumentationUrl =
    'https://docs.lightdash.com/get-started/exploring-data/using-explores/';

export const EmptyStateNoColumns = () => {
    const { classes } = useAnimatedTextStyles();
    const { t } = useTranslation();

    return (
        <EmptyState
            title={
                <>
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.title',
                    )}{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                        iconProps={{ size: 'lg' }}
                    />
                </>
            }
            description={
                <>
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.description.part_1',
                    )}{' '}
                    <Text span color="yellow.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.description.part_2',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.description.part_3',
                    )}{' '}
                    <Text span color="blue.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.description.part_4',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.description.part_5',
                    )}
                </>
            }
        >
            <Text className={classes.root} color="dimmed">
                <Text span>
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_1.part_1',
                    )}{' '}
                    <Text span color="yellow.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_1.part_2',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_1.part_3',
                    )}{' '}
                    <Text span color="blue.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_1.part_4',
                        )}
                    </Text>
                    ?
                </Text>

                <Text span>
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_2.part_1',
                    )}{' '}
                    <Text span color="yellow.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_2.part_2',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_2.part_3',
                    )}{' '}
                    <Text span color="blue.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_2.part_4',
                        )}
                    </Text>
                    ?
                </Text>

                <Text span>
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_3.part_1',
                    )}{' '}
                    <Text span color="yellow.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_3.part_2',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_3.part_3',
                    )}{' '}
                    <Text span color="blue.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_3.part_4',
                        )}
                    </Text>
                    ?
                </Text>

                <Text span>
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_4.part_1',
                    )}{' '}
                    <Text span color="yellow.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_4.part_2',
                        )}
                    </Text>{' '}
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_4.part_3',
                    )}{' '}
                    <Text span color="blue.9">
                        {t(
                            'components_explorer_results_card_non_ideal_state.empty_no_columns.eg_4.part_4',
                        )}
                    </Text>
                    ?
                </Text>
            </Text>
        </EmptyState>
    );
};

export const EmptyStateNoTableData: FC<{ description: React.ReactNode }> = ({
    description,
}) => (
    <TrackSection name={SectionName.EMPTY_RESULTS_TABLE}>
        <EmptyState
            maw={500}
            description={
                <>
                    {description}{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                    />
                </>
            }
        >
            <RefreshButton size={'xs'} />
        </EmptyState>
    </TrackSection>
);

export const NoTableSelected = () => {
    const { t } = useTranslation();

    return (
        <EmptyState
            maw={500}
            icon={<NoTableIcon />}
            title={t(
                'components_explorer_results_card_non_ideal_state.empty_no_table.title',
            )}
            description={
                <>
                    {t(
                        'components_explorer_results_card_non_ideal_state.empty_no_table.description',
                    )}{' '}
                    <DocumentationHelpButton
                        href={ExploreDocumentationUrl}
                        pos="relative"
                        top={2}
                    />
                </>
            }
        />
    );
};

export const EmptyStateExploreLoading = () => {
    const { t } = useTranslation();

    return (
        <EmptyState
            title={t(
                'components_explorer_results_card_non_ideal_state.empty_state_explore_loading.title',
            )}
        >
            <Loader color="gray" />
        </EmptyState>
    );
};

export const ExploreIdleState = () => {
    const { t } = useTranslation();

    return (
        <EmptyState
            title={t(
                'components_explorer_results_card_non_ideal_state.explore_idle_state.title',
            )}
        />
    );
};

export const ExploreEmptyQueryState = () => {
    const { t } = useTranslation();

    return (
        <EmptyState
            title={t(
                'components_explorer_results_card_non_ideal_state.explore_empty_query_state.title',
            )}
            description={t(
                'components_explorer_results_card_non_ideal_state.explore_empty_query_state.description',
            )}
        />
    );
};

export const ExploreLoadingState = () => {
    const { t } = useTranslation();

    return (
        <EmptyState
            title={t(
                'components_explorer_results_card_non_ideal_state.explore_loading_state.title',
            )}
        >
            <Loader color="gray" data-testid="results-table-loading" />
        </EmptyState>
    );
};

export const ExploreErrorState = ({
    errorDetail,
}: {
    errorDetail?: ApiErrorDetail | null;
}) => {
    const { t } = useTranslation();

    return (
        <EmptyState
            icon={<MantineIcon icon={IconTableOff} />}
            title={t(
                'components_explorer_results_card_non_ideal_state.explore_error_state.title',
            )}
            description={
                <Fragment>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                        {errorDetail?.message ||
                            t(
                                'components_explorer_results_card_non_ideal_state.explore_error_state.description',
                            )}
                    </Text>
                    {errorDetail?.data.documentationUrl && (
                        <Fragment>
                            <br />
                            <Anchor
                                href={errorDetail.data.documentationUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_explorer_results_card_non_ideal_state.explore_error_state.detail',
                                )}
                            </Anchor>
                        </Fragment>
                    )}
                </Fragment>
            }
        />
    );
};

export const MissingRequiredParameters = ({
    missingRequiredParameters,
}: {
    missingRequiredParameters: string[];
}) => {
    const { t } = useTranslation();

    return (
        <EmptyState
            title={t(
                'components_explorer_results_card_non_ideal_state.missing_required_parameters.title',
            )}
            description={
                <>
                    <Text>
                        {missingRequiredParameters.length === 1
                            ? t(
                                  'components_explorer_results_card_non_ideal_state.missing_required_parameters.parameter_01',
                              )
                            : t(
                                  'components_explorer_results_card_non_ideal_state.missing_required_parameters.parameter_02',
                              )}
                    </Text>
                    <br />
                    <Text span fw={500} size="sm">
                        {missingRequiredParameters.join(', ')}
                    </Text>
                </>
            }
        />
    );
};
