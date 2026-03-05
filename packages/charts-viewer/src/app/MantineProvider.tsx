'use client';

import { MantineProvider } from '@mantine/core';
import { ReactNode } from 'react';

export function ChartsMantineProvider({ children }: { children: ReactNode }) {
    return (
        <MantineProvider defaultColorScheme="light" theme={{ primaryColor: 'blue' }}>
            {children}
        </MantineProvider>
    );
}
