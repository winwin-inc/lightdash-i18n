import {
    type ResourceViewChartItem,
    type ResourceViewDashboardItem,
    type ResourceViewDataAppItem,
    type ResourceViewItem,
    type ResourceViewSpaceItem,
} from '@lightdash/common';
import { type ReactNode } from 'react';

export enum ResourceViewItemAction

export enum ResourceViewType

export enum ResourceSortDirection

export type ResourceViewItemActionState =
    | {
          type: ResourceViewItemAction.CLOSE;
      }
    | {
          type: ResourceViewItemAction.UPDATE;
          item: ResourceViewItem;
      }
    | {
          type: ResourceViewItemAction.DELETE;
          item: ResourceViewItem;
      }
    | {
          type: ResourceViewItemAction.DUPLICATE;
          item: ResourceViewChartItem | ResourceViewDashboardItem;
      }
    | {
          type: ResourceViewItemAction.ADD_TO_DASHBOARD;
          item: ResourceViewChartItem;
      }
    | {
          type: ResourceViewItemAction.CREATE_SPACE;
          item: ResourceViewChartItem | ResourceViewDashboardItem;
      }
    | {
          type: ResourceViewItemAction.PIN_TO_HOMEPAGE;
          item: ResourceViewItem;
      }
    | {
          type: ResourceViewItemAction.TRANSFER_TO_SPACE;
          item:
              | ResourceViewChartItem
              | ResourceViewDashboardItem
              | ResourceViewSpaceItem
              | ResourceViewDataAppItem;
      }
    | {
          type: ResourceViewItemAction.UPLOAD_PACKAGE;
          item: ResourceViewDataAppItem;
      };

type TabType = {
    id: string;
    name?: string;
    icon?: ReactNode;
    infoTooltipText?: string;
    sort?: (a: ResourceViewItem, b: ResourceViewItem) => number;
    filter?: (item: ResourceViewItem, index: number) => boolean;
};

interface ResourceHeaderProps {
    title?: string;
    description?: string;
    action?: React.ReactNode;
}

export interface ResourceViewCommonProps {
    items: ResourceViewItem[];
    tabs?: TabType[];
    maxItems?: number;
    headerProps?: ResourceHeaderProps;
    emptyStateProps?: ResourceEmptyStateProps;
    view?: ResourceViewType;
    hasReorder?: boolean;
}

export interface ResourceEmptyStateProps {
    icon?: ReactNode;
    title?: string;
    description?: string;
    action?: ReactNode;
}

export enum ColumnVisibility

export type ColumnVisibilityConfig = {
    [ColumnVisibility.NAME]?: boolean;
    [ColumnVisibility.SPACE]?: boolean;
    [ColumnVisibility.UPDATED_AT]?: boolean;
    [ColumnVisibility.ACCESS]?: boolean;
    [ColumnVisibility.CONTENT]?: boolean;
    [ColumnVisibility.STATUS]?: boolean;
};

export enum ResourceAccess
