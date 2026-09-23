import type { PromotionAction } from '../promotion';
import type { VizColumn } from '../../visualizations/types';
import type { ContentAsCodeType } from './core';

export type VirtualViewAsCode = {
    contentType: ContentAsCodeType.VIRTUAL_VIEW;
    version: number;
    slug: string;
    name: string;
    sql: string;
    columns: VizColumn[];
};

export type VirtualViewAsCodeSkip = {
    slug: string;
    reason: string;
};

export type ApiVirtualViewAsCodeListResponse = {
    status: 'ok';
    results: {
        virtualViews: VirtualViewAsCode[];
        skipped: VirtualViewAsCodeSkip[];
        missingSlugs: string[];
    };
};

export type ApiVirtualViewAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};
