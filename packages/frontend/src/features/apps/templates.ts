import { type DataAppTemplate } from '@lightdash/common';
import {
    IconFileText,
    IconLayoutDashboard,
    IconPencil,
    IconPresentation,
    IconPuzzle,
    type Icon as TablerIcon,
} from '@tabler/icons-react';

export type TemplateDefinition = {
    id: DataAppTemplate;
    titleKey: string;
    descriptionKey: string;
    icon: TablerIcon;
};

const TEMPLATES: TemplateDefinition[] = [
    {
        id: 'dashboard',
        titleKey: 'features_apps_templates.dashboard.title',
        descriptionKey: 'features_apps_templates.dashboard.description',
        icon: IconLayoutDashboard,
    },
    {
        id: 'slideshow',
        titleKey: 'features_apps_templates.slideshow.title',
        descriptionKey: 'features_apps_templates.slideshow.description',
        icon: IconPresentation,
    },
    {
        id: 'pdf',
        titleKey: 'features_apps_templates.pdf.title',
        descriptionKey: 'features_apps_templates.pdf.description',
        icon: IconFileText,
    },
    {
        id: 'custom',
        titleKey: 'features_apps_templates.custom.title',
        descriptionKey: 'features_apps_templates.custom.description',
        icon: IconPencil,
    },
    {
        id: 'data_app_viz',
        titleKey: 'features_apps_templates.data_app_viz.title',
        descriptionKey: 'features_apps_templates.data_app_viz.description',
        icon: IconPuzzle,
    },
];

// Offered when creating a data app. Vizs (custom chart types) are created from
// Explorer's chart type picker instead, but existing viz apps still resolve
// their definition via `getTemplate`, so the entry stays in TEMPLATES.
export const PICKER_TEMPLATES: TemplateDefinition[] = TEMPLATES.filter(
    (t) => t.id !== 'data_app_viz',
);

export const getTemplate = (id: DataAppTemplate): TemplateDefinition => {
    const template = TEMPLATES.find((x) => x.id === id);
    if (!template) {
        throw new Error(`Unknown data app template: ${id}`);
    }
    return template;
};
