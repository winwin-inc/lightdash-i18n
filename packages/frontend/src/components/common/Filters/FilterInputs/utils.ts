import {
    assertUnreachable,
    DimensionType,
    FilterOperator,
    FilterType,
    formatBoolean,
    formatDate,
    getFilterTypeFromItem,
    getItemId,
    getLocalTimeDisplay,
    isCustomSqlDimension,
    isDashboardFilterRule,
    isDimension,
    isField,
    isFilterableItem,
    isFilterRule,
    isMomentInput,
    type ConditionalRule,
    type ConditionalRuleLabels,
    type CustomSqlDimension,
    type Field,
    type FilterableDimension,
    type FilterableItem,
    type TableCalculation,
} from '@lightdash/common';
import isEmpty from 'lodash/isEmpty';
import uniq from 'lodash/uniq';
import { type MomentInput } from 'moment';
import { useTranslation } from 'react-i18next';
import { useFilterOperatorLabel, useTimeFilterOptions } from './constants';

export const useFilterOperatorOptions = () => {
    const { getFilterOptions } = useFilterOperatorLabel();
    const timeFilterOptions = useTimeFilterOptions();

    return (filterType: FilterType) => {
        switch (filterType) {
            case FilterType.STRING:
            case FilterType.NUMBER:
                switch (operator) {
              case FilterOperator.IN_BETWEEN:
              case FilterOperator.NOT_IN_BETWEEN:
                  return `${firstValue || 0}, ${secondValue || 0}`;
              default:
                  return values?.join(', ');
          }
      case FilterType.BOOLEAN:
          return values?.map(formatBoolean).join(', ');
      case FilterType.DATE:
          switch (operator) {
              case FilterOperator.IN_THE_PAST:
              case FilterOperator.NOT_IN_THE_PAST:
              case FilterOperator.IN_THE_NEXT:
                  if (!isFilterRule(rule)) throw new Error('Invalid rule');

                  return `${firstValue} ${
                      rule.settings?.completed ? 'completed ' : ''
                  }${rule.settings?.unitOfTime}`;
              case FilterOperator.IN_BETWEEN:
                  if (
                      isDimension(field) &&
                      isMomentInput(firstValue) &&
                      isMomentInput(secondValue) &&
                      field.type === DimensionType.DATE
                  ) {
                      return `${formatDate(
                          firstValue as MomentInput,
                          field.timeInterval,
                      )} and ${formatDate(
                          secondValue as MomentInput,
                          field.timeInterval,
                      )}`;
                  }
                  return `${getLocalTimeDisplay(
                      firstValue as MomentInput,
                      false,
                  )} and ${getLocalTimeDisplay(secondValue as MomentInput)}`;
              case FilterOperator.IN_THE_CURRENT:
              case FilterOperator.NOT_IN_THE_CURRENT:
                  if (!isFilterRule(rule)) throw new Error('Invalid rule');

                  return rule.settings?.unitOfTime.slice(0, -1);
              case FilterOperator.NULL:
              case FilterOperator.NOT_NULL:
              case FilterOperator.EQUALS:
              case FilterOperator.NOT_EQUALS:
              case FilterOperator.STARTS_WITH:
              case FilterOperator.ENDS_WITH:
              case FilterOperator.INCLUDE:
              case FilterOperator.NOT_INCLUDE:
              case FilterOperator.LESS_THAN:
              case FilterOperator.LESS_THAN_OR_EQUAL:
              case FilterOperator.GREATER_THAN:
              case FilterOperator.GREATER_THAN_OR_EQUAL:
                  return values
                      ?.map((value) => {
                          const type = isCustomSqlDimension(field)
                              ? field.dimensionType
                              : field.type;
                          if (
                              isDimension(field) &&
                              isMomentInput(value) &&
                              type === DimensionType.TIMESTAMP
                          ) {
                              return getLocalTimeDisplay(value);
                          } else if (
                              isDimension(field) &&
                              isMomentInput(value) &&
                              type === DimensionType.DATE
                          ) {
                              return formatDate(value, field.timeInterval);
                          } else {
                              return value;
                          }
                      })
                      .join(', ');
              case FilterOperator.NOT_IN_BETWEEN:
                  throw new Error('Not implemented');
              default:
                  return assertUnreachable(
                      operator,
                      `Unexpected operator: ${operator}`,
                  );
          }
      default:
          return assertUnreachable(
              filterType,
              `Unexpected filter type: ${filterType}`,
          );
        }
  }
};

const useValueAsString = () => {
    const { t } = useTranslation();

    return (
        filterType: FilterType,
        rule: ConditionalRule,
        field: Field | TableCalculation | CustomSqlDimension,
    ) => {
        const { operator, values } = rule;
        const firstValue = values?.[0];
        const secondValue = values?.[1];

        switch (filterType) {
            case FilterType.STRING:
            case FilterType.NUMBER:
                return values?.join(', ');
            case FilterType.BOOLEAN:
                return values?.map(formatBoolean).join(', ');
            case FilterType.DATE:
                switch (operator) {
                    case FilterOperator.IN_THE_PAST:
                    case FilterOperator.NOT_IN_THE_PAST:
                    case FilterOperator.IN_THE_NEXT:
                        if (!isFilterRule(rule))
                            throw new Error('Invalid rule');

                        return `${firstValue} ${
                            rule.settings?.completed
                                ? t(
                                      'components_common_filters_inputs.completed',
                                  )
                                : ''
                        }${rule.settings?.unitOfTime}`;
                    case FilterOperator.IN_BETWEEN:
                        return `${getLocalTimeDisplay(
                            firstValue as MomentInput,
                            false,
                        )} and ${getLocalTimeDisplay(
                            secondValue as MomentInput,
                        )}`;
                    case FilterOperator.IN_THE_CURRENT:
                    case FilterOperator.NOT_IN_THE_CURRENT:
                        if (!isFilterRule(rule))
                            throw new Error('Invalid rule');

                        return rule.settings?.unitOfTime.slice(0, -1);
                    case FilterOperator.NULL:
                    case FilterOperator.NOT_NULL:
                    case FilterOperator.EQUALS:
                    case FilterOperator.NOT_EQUALS:
                    case FilterOperator.STARTS_WITH:
                    case FilterOperator.ENDS_WITH:
                    case FilterOperator.INCLUDE:
                    case FilterOperator.NOT_INCLUDE:
                    case FilterOperator.LESS_THAN:
                    case FilterOperator.LESS_THAN_OR_EQUAL:
                    case FilterOperator.GREATER_THAN:
                    case FilterOperator.GREATER_THAN_OR_EQUAL:
                        return values
                            ?.map((value) => {
                                const type = isCustomSqlDimension(field)
                                    ? field.dimensionType
                                    : field.type;
                                if (
                                    isDimension(field) &&
                                    isMomentInput(value) &&
                                    type === DimensionType.TIMESTAMP
                                ) {
                                    return getLocalTimeDisplay(value);
                                } else if (
                                    isDimension(field) &&
                                    isMomentInput(value) &&
                                    type === DimensionType.DATE
                                ) {
                                    return formatDate(
                                        value,
                                        field.timeInterval,
                                    );
                                } else {
                                    return value;
                                }
                            })
                            .join(', ');
                    default:
                        return assertUnreachable(
                            operator,
                            `Unexpected operator: ${operator}`,
                        );
                }
            default:
                return assertUnreachable(
                    filterType,
                    `Unexpected filter type: ${filterType}`,
                );
        }
    };
};

export const useConditionalRuleLabel = () => {
    const { filterOperatorLabel } = useFilterOperatorLabel();

    const getFilterOperatorOptions = useFilterOperatorOptions();
    const getValueAsString = useValueAsString();

    return (
        rule: ConditionalRule,
        item: FilterableItem,
    ): ConditionalRuleLabels => {
        const filterType = isFilterableItem(item)
            ? getFilterTypeFromItem(item)
            : FilterType.STRING;
        const operatorOptions = getFilterOperatorOptions(filterType);
        const operationLabel =
            operatorOptions.find((o) => o.value === rule.operator)?.label ||
            filterOperatorLabel[rule.operator];

        return {
            field: isField(item) ? item.label : item.name,
            operator: operationLabel,
            value: getValueAsString(filterType, rule, item),
        };
    };
};

export const getFilterRuleTables = (
    filterRule: ConditionalRule,
    field: FilterableDimension,
    filterableFields: FilterableDimension[],
): string[] => {
    if (
        isDashboardFilterRule(filterRule) &&
        filterRule.tileTargets &&
        !isEmpty(filterRule.tileTargets)
    ) {
        return Object.values(filterRule.tileTargets).reduce<string[]>(
            (tables, tileTarget) => {
                const targetField = filterableFields.find(
                    (f) =>
                        tileTarget !== false &&
                        f.table === tileTarget.tableName &&
                        getItemId(f) === tileTarget.fieldId,
                );
                return targetField
                    ? uniq([...tables, targetField.tableLabel])
                    : tables;
            },
            [],
        );
    } else {
        return [field.tableLabel];
    }
};

export const formatDisplayValue = (value: string): string => {
    return value
        .replace(/^\s+|\s+$/g, (match) => '␣'.repeat(match.length))
        .replace(/\n/g, '↵');
};
