import { DimensionType, FieldType, type ItemsMap } from '@lightdash/common';
import { describe, expect, it } from 'vitest';

import { prepareCustomVisSpecForClipboard } from './prepareCustomVisSpecForClipboard';

describe('prepareCustomVisSpecForClipboard', () => {
    it('resolves rewrite fields for the selected editor tab', () => {
        const itemsMap = {
            orders_category: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                table: 'orders',
                tableLabel: 'Orders',
                name: 'category',
                label: 'Category',
            },
        } as unknown as ItemsMap;

        const result = prepareCustomVisSpecForClipboard(
            JSON.stringify({
                rewrite: true,
                data: { name: 'values' },
                encoding: {
                    x: { field: 'category', type: 'nominal' },
                    y: { field: 'revenue', type: 'quantitative' },
                },
                transform: [
                    {
                        as: 'formatted_revenue',
                        calculate: 'format(datum.revenue, ",.2f")',
                    },
                ],
                lightdash: {
                    responsive: {
                        breakpoint: 768,
                        mobile: {
                            data: { name: 'values' },
                            encoding: {
                                x: { field: 'Category', type: 'nominal' },
                            },
                        },
                    },
                },
            }),
            'mobile',
            itemsMap,
            ['orders_category', 'orders_revenue'],
        );

        expect(result).toEqual({
            data: { name: 'values' },
            encoding: {
                x: { field: 'orders_category', type: 'nominal' },
            },
        });
    });

    it('returns no spec for invalid JSON or an empty mobile tab', () => {
        expect(
            prepareCustomVisSpecForClipboard('{', 'desktop', undefined, []),
        ).toBeUndefined();

        expect(
            prepareCustomVisSpecForClipboard(
                JSON.stringify({ layer: [] }),
                'mobile',
                undefined,
                [],
            ),
        ).toBeUndefined();
    });

    it('inlines series as `data: { values }` and strips named-dataset references', () => {
        const series = [
            { orders_category: 'Books', orders_revenue: 100 },
            { orders_category: 'Games', orders_revenue: 50 },
        ];

        const result = prepareCustomVisSpecForClipboard(
            JSON.stringify({
                data: { name: 'values' },
                layer: [
                    {
                        data: { name: 'values' },
                        mark: 'bar',
                        encoding: {
                            x: { field: 'orders_category', type: 'nominal' },
                            y: {
                                field: 'orders_revenue',
                                type: 'quantitative',
                            },
                        },
                        transform: [
                            {
                                lookup: 'orders_category',
                                from: {
                                    data: { name: 'values' },
                                    key: 'orders_category',
                                    fields: ['orders_revenue'],
                                },
                            },
                        ],
                    },
                ],
            }),
            'desktop',
            undefined,
            ['orders_category', 'orders_revenue'],
            series,
        );

        expect(result).toEqual({
            data: { values: series },
            layer: [
                {
                    mark: 'bar',
                    encoding: {
                        x: { field: 'orders_category', type: 'nominal' },
                        y: { field: 'orders_revenue', type: 'quantitative' },
                    },
                    transform: [
                        {
                            lookup: 'orders_category',
                            from: {
                                data: { values: series },
                                key: 'orders_category',
                                fields: ['orders_revenue'],
                            },
                        },
                    ],
                },
            ],
        });
    });

    it('keeps the original spec when no series is provided', () => {
        const result = prepareCustomVisSpecForClipboard(
            JSON.stringify({
                data: { name: 'values' },
                encoding: {
                    x: { field: 'orders_category', type: 'nominal' },
                },
            }),
            'desktop',
            undefined,
            ['orders_category'],
        );

        expect(result).toEqual({
            data: { name: 'values' },
            encoding: { x: { field: 'orders_category', type: 'nominal' } },
        });
    });
});
