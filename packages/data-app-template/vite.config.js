import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    // Relative asset URLs so the preview iframe can serve the bundle.
    base: './',
});
