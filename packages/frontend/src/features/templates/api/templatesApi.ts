import { type AnyType } from '@lightdash/common';
import { lightdashApi } from '../../../api';

export type ChartTemplateListItem = Record<string, unknown>;
export type ChartTemplateDetail = Record<string, unknown>;

export const getChartTemplates = async (): Promise<ChartTemplateListItem[]> =>
    lightdashApi<ChartTemplateListItem[]>({
        url: '/chart-templates',
        method: 'GET',
        body: undefined,
    });

export const getChartTemplate = async (
    templateId: string,
): Promise<ChartTemplateDetail> =>
    (await lightdashApi<AnyType>({
        url: `/chart-templates/${encodeURIComponent(templateId)}`,
        method: 'GET',
        body: undefined,
    })) as ChartTemplateDetail;
