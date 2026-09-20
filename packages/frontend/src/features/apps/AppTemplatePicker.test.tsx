// AppTemplatePicker.test.tsx
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen } from '@testing-library/react';
import AppTemplatePicker from './AppTemplatePicker';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const map: Record<string, string> = {
                'features_apps_templates.dashboard.title': 'Dashboard',
                'features_apps_templates.dashboard.description':
                    'A grid of KPIs and charts for at-a-glance reporting.',
                'features_apps_templates.slideshow.title': 'Slide Show',
                'features_apps_templates.slideshow.description':
                    'A guided narrative - one chart per slide, navigated linearly.',
                'features_apps_templates.pdf.title': 'PDF Report',
                'features_apps_templates.pdf.description':
                    'A print-friendly document with sections and supporting charts.',
                'features_apps_templates.custom.title': 'From scratch',
                'features_apps_templates.custom.description':
                    'Start from scratch and describe whatever you want.',
                'features_apps_templates.data_app_viz.title':
                    'Data app visualization',
                'features_apps_templates.data_app_viz.description':
                    'A reusable single-tile chart you can apply to any query like a chart type.',
            };
            return map[key] ?? key;
        },
    }),
}));

const setup = (
    selected:
        | 'dashboard'
        | 'slideshow'
        | 'pdf'
        | 'custom'
        | 'data_app_viz'
        | null,
    onSelectedChange = vi.fn(),
) => {
    render(
        <MantineProvider env="test">
            <AppTemplatePicker
                selected={selected}
                onSelectedChange={onSelectedChange}
            />
        </MantineProvider>,
    );
    return { onSelectedChange };
};

describe('AppTemplatePicker', () => {
    it('renders the app starting points, no viz template, no Lets go button', () => {
        setup(null);
        expect(
            screen.getByRole('button', { name: /Dashboard/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Slide Show/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /PDF Report/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /From scratch/i }),
        ).toBeInTheDocument();
        // Vizs (custom chart types) are created from Explorer, not here.
        expect(
            screen.queryByRole('button', { name: /Data app visualization/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Let's go/i }),
        ).not.toBeInTheDocument();
    });

    it('nothing is selected by default', () => {
        setup(null);
        expect(
            screen.queryByRole('button', { pressed: true }),
        ).not.toBeInTheDocument();
    });

    it('selecting a card reports the template', () => {
        const { onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /Slide Show/i }));
        expect(onSelectedChange).toHaveBeenCalledWith('slideshow');
    });

    it('selecting From scratch reports the custom template', () => {
        const { onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /From scratch/i }));
        expect(onSelectedChange).toHaveBeenCalledWith('custom');
    });

    it('clicking the selected card deselects it', () => {
        const { onSelectedChange } = setup('dashboard');
        fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }));
        expect(onSelectedChange).toHaveBeenCalledWith(null);
    });
});
