import {
    DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE,
    UnexpectedServerError,
} from '@lightdash/common';
import { ExportRowBudget } from './exportBudget';

describe('ExportRowBudget', () => {
    it('accumulates rows while under the limit', () => {
        const budget = new ExportRowBudget(100);
        budget.add(30);
        budget.add(70);
        expect(budget.used).toBe(100);
        expect(budget.exceeded).toBe(false);
        expect(() => budget.assertWithinLimit()).not.toThrow();
    });

    it('throws with the shared message once the limit is exceeded', () => {
        const budget = new ExportRowBudget(100);
        budget.add(60);
        expect(() => budget.add(60)).toThrow(UnexpectedServerError);
        expect(budget.used).toBe(120);
        expect(() => budget.assertWithinLimit()).toThrow(
            DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE,
        );
    });

    it('reports the numbers in the message so the UI can localise it', () => {
        const budget = new ExportRowBudget(10);
        try {
            budget.add(11);
            throw new Error('expected to throw');
        } catch (error) {
            expect(String(error)).toContain('11 rows, limit 10');
        }
    });

    it('ignores empty batches and can pre-check before a query', () => {
        const budget = new ExportRowBudget(5);
        budget.add(0);
        expect(budget.used).toBe(0);
        expect(() => budget.assertWithinLimit()).not.toThrow();
        expect(() => budget.add(6)).toThrow(
            DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE,
        );
        expect(() => budget.assertWithinLimit()).toThrow(
            DASHBOARD_EXPORT_ROW_LIMIT_MESSAGE,
        );
    });
});
