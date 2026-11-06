import { DimensionType, FieldType, Format } from '../types/field';
import { FilterOperator } from '../types/filter';
import {
    createConditionalFormattingConfigWithSingleColor,
    createConditionalFormattingRuleWithCompareTargetValues,
    createConditionalFormattingRuleWithValues,
    hasMatchingConditionalRules,
    parseConditionalFormattingNumericValue,
    toConditionalFormattingComparableValue,
} from './conditionalFormatting';

// Mock field for testing
const mockNumericField = {
    name: 'test_field',
    table: 'test_table',
    type: DimensionType.NUMBER,
    fieldType: FieldType.DIMENSION,
    sql: 'test_sql',
    tableLabel: 'Test Table',
    label: 'Test Field',
    hidden: false,
};

const mockPeriodField = {
    name: 'period',
    table: 'test_table',
    type: DimensionType.STRING,
    fieldType: FieldType.DIMENSION,
    sql: 'period_sql',
    tableLabel: 'Test Table',
    label: 'period',
    hidden: false,
};

describe('hasMatchingConditionalRules', () => {
    describe('LESS_THAN_OR_EQUAL operator', () => {
        it('should return true when field value is less than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                5, // less than 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return true when field value equals rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // equals 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return false when field value is greater than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                15, // greater than 10
                {},
                config,
            );

            expect(result).toBe(false);
        });
    });

    describe('GREATER_THAN_OR_EQUAL operator', () => {
        it('should return true when field value is greater than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                15, // greater than 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return true when field value equals rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // equals 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return false when field value is less than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                5, // less than 10
                {},
                config,
            );

            expect(result).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle multiple values with LESS_THAN_OR_EQUAL', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [5, 15];
            config.rules = [rule];

            // Should match if value is <= any of the rule values
            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // <= 15 (second value)
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should handle multiple values with GREATER_THAN_OR_EQUAL', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [5, 15];
            config.rules = [rule];

            // Should match if value is >= any of the rule values
            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // >= 5 (first value)
                {},
                config,
            );

            expect(result).toBe(true);
        });
    });
});

describe('parseConditionalFormattingNumericValue', () => {
    it('returns numbers unchanged', () => {
        expect(parseConditionalFormattingNumericValue(12.9)).toEqual({
            numeric: 12.9,
            hadPercentSign: false,
        });
    });

    it('parses currency and thousands separators (not parseInt)', () => {
        expect(parseConditionalFormattingNumericValue('¥1,234.56')).toEqual({
            numeric: 1234.56,
            hadPercentSign: false,
        });
        expect(parseConditionalFormattingNumericValue('$1,234.56')).toEqual({
            numeric: 1234.56,
            hadPercentSign: false,
        });
        // parseInt would yield 12; we must keep the fraction
        expect(parseConditionalFormattingNumericValue('12.9')).toEqual({
            numeric: 12.9,
            hadPercentSign: false,
        });
    });

    it('parses percent display strings and records hadPercentSign', () => {
        expect(parseConditionalFormattingNumericValue('12.5%')).toEqual({
            numeric: 12.5,
            hadPercentSign: true,
        });
        expect(parseConditionalFormattingNumericValue('-3.2%')).toEqual({
            numeric: -3.2,
            hadPercentSign: true,
        });
    });
});

describe('hasMatchingConditionalRules with formatted strings', () => {
    it('compares yen/comma formatted strings as numbers', () => {
        const config =
            createConditionalFormattingConfigWithSingleColor('#00ff00');
        const rule = createConditionalFormattingRuleWithValues();
        rule.operator = FilterOperator.GREATER_THAN;
        rule.values = [0];
        config.rules = [rule];

        expect(
            hasMatchingConditionalRules(
                mockNumericField,
                '¥1,234.56',
                {},
                config,
            ),
        ).toBe(true);

        expect(
            hasMatchingConditionalRules(mockNumericField, '¥-10.5', {}, config),
        ).toBe(false);
    });

    it('compares percent display strings without double-scaling', () => {
        const percentField = {
            ...mockNumericField,
            format: Format.PERCENT,
        };

        const config =
            createConditionalFormattingConfigWithSingleColor('#00ff00');
        const rule = createConditionalFormattingRuleWithValues();
        rule.operator = FilterOperator.GREATER_THAN;
        rule.values = [0];
        config.rules = [rule];

        // Display "12.5%" must compare as 12.5, not 1250
        expect(
            hasMatchingConditionalRules(percentField, '12.5%', {}, config),
        ).toBe(true);

        // Raw fraction 0.125 scales to 12.5 via convertFormattedValue
        expect(
            hasMatchingConditionalRules(percentField, 0.125, {}, config),
        ).toBe(true);

        expect(
            hasMatchingConditionalRules(percentField, '-1.5%', {}, config),
        ).toBe(false);
    });

    it('uses Number/parseFloat so decimals are preserved vs parseInt', () => {
        const config =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        const rule = createConditionalFormattingRuleWithValues();
        rule.operator = FilterOperator.GREATER_THAN;
        rule.values = [12];
        config.rules = [rule];

        expect(
            hasMatchingConditionalRules(mockNumericField, '12.9', {}, config),
        ).toBe(true);
        expect(
            hasMatchingConditionalRules(mockNumericField, '12.1', {}, config),
        ).toBe(true);
    });
});

describe('toConditionalFormattingComparableValue', () => {
    it('strips formatting for numeric fields', () => {
        expect(
            toConditionalFormattingComparableValue(
                '¥1,000.5',
                mockNumericField,
            ),
        ).toBe(1000.5);
    });

    it('scales raw percent fractions but not percent display strings', () => {
        const percentField = {
            ...mockNumericField,
            format: Format.PERCENT,
        };
        expect(
            toConditionalFormattingComparableValue(0.125, percentField),
        ).toBe(12.5);
        expect(
            toConditionalFormattingComparableValue('12.5%', percentField),
        ).toBe(12.5);
    });
});

describe('pivot header period in rowFields (field-values AND)', () => {
    it('metric <= 0 AND period contains YoY label only on matching columns', () => {
        const config =
            createConditionalFormattingConfigWithSingleColor('#ff0000');
        const valueRule = createConditionalFormattingRuleWithValues();
        valueRule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
        valueRule.values = [0];

        const periodRule =
            createConditionalFormattingRuleWithCompareTargetValues();
        periodRule.operator = FilterOperator.INCLUDE;
        periodRule.compareTarget = { fieldId: 'test_table_period' };
        periodRule.values = ['同比增长'];

        config.rules = [valueRule, periodRule];

        const yoyRowFields = {
            test_table_period: {
                field: mockPeriodField,
                value: '单月同比增长',
            },
        };
        const momRowFields = {
            test_table_period: {
                field: mockPeriodField,
                value: '单月环比增长',
            },
        };

        expect(
            hasMatchingConditionalRules(
                mockNumericField,
                -1.2,
                {},
                config,
                yoyRowFields,
            ),
        ).toBe(true);

        expect(
            hasMatchingConditionalRules(
                mockNumericField,
                -1.2,
                {},
                config,
                momRowFields,
            ),
        ).toBe(false);

        expect(
            hasMatchingConditionalRules(
                mockNumericField,
                5,
                {},
                config,
                yoyRowFields,
            ),
        ).toBe(false);
    });

    it('period EQUALS exact header label', () => {
        const config =
            createConditionalFormattingConfigWithSingleColor('#00ff00');
        const periodRule =
            createConditionalFormattingRuleWithCompareTargetValues();
        periodRule.operator = FilterOperator.EQUALS;
        periodRule.compareTarget = { fieldId: 'test_table_period' };
        periodRule.values = ['单月同比增长'];
        config.rules = [periodRule];

        expect(
            hasMatchingConditionalRules(mockNumericField, 1, {}, config, {
                test_table_period: {
                    field: mockPeriodField,
                    value: '单月同比增长',
                },
            }),
        ).toBe(true);
    });
});
