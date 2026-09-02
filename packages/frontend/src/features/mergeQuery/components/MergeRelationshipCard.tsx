import { MergeJoinType } from '@lightdash/common';
import { Badge, Box } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { MergeJoinBar } from './MergeJoinBar';
import { getJoinClauseLabel } from './mergeJoinLabels';

const MergeRelationshipCardContent: FC = () => {
    const { t } = useTranslation();
    const {
        effectiveParts,
        labelFor,
        primaryExploreLabel,
        additionalExploreLabel,
        additionalSourceId,
        isIncomplete,
        setupStep,
    } = useMergeSetup();
    const merge = useMergeSafe();
    const [isOpen, setIsOpen] = useState(true);
    const primaryLabel =
        primaryExploreLabel ?? t('features_mergeQuery.first_data');
    const additionalLabel =
        additionalExploreLabel ?? t('features_mergeQuery.combined_data');
    const joinTypeLabel =
        merge?.joinType === MergeJoinType.LEFT
            ? t('features_mergeQuery.join_left')
            : merge?.joinType === MergeJoinType.INNER
              ? t('features_mergeQuery.join_inner')
              : t('features_mergeQuery.join_full_outer');
    const relationshipSummary = effectiveParts
        .map((part) => {
            const primaryFieldId = part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
            const additionalFieldId =
                part.fieldIdBySourceId[additionalSourceId];
            return getJoinClauseLabel(
                primaryLabel,
                primaryFieldId ? labelFor(primaryFieldId) : '?',
                additionalLabel,
                additionalFieldId ? labelFor(additionalFieldId) : '?',
            );
        })
        .join(' AND ');
    const badgeLabel = setupStep ?? `${relationshipSummary} · ${joinTypeLabel}`;

    return (
        <CollapsableCard
            title={t('features_mergeQuery.relationship')}
            isOpen={isOpen}
            onToggle={setIsOpen}
            headerElement={
                <Badge
                    variant="light"
                    color={isIncomplete ? 'orange' : 'gray'}
                    maw="min(70vw, 720px)"
                    title={badgeLabel}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                    {badgeLabel}
                </Badge>
            }
        >
            <Box px="md" pb="md">
                <MergeJoinBar guided />
            </Box>
        </CollapsableCard>
    );
};

/** The relationship belongs to the result, so it lives with result controls—not inside either dataset. */
export const MergeRelationshipCard: FC = () => {
    const merge = useMergeSafe();
    if (
        !merge?.isMerging ||
        merge.readOnly ||
        !merge.additionalSources[0]?.exploreName
    ) {
        return null;
    }

    return <MergeRelationshipCardContent />;
};
