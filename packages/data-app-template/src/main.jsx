import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient, LightdashProvider } from '@lightdash/query-sdk';
import App from './App';
import './index.css';

const lightdash = createClient();

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <LightdashProvider client={lightdash}>
            <App />
        </LightdashProvider>
    </React.StrictMode>,
);
