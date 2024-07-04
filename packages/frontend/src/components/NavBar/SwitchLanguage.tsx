import { Select } from '@mantine/core';
import { Suspense, type FC } from 'react';
import { useTranslation } from 'react-i18next';

const normalizedLanguage = (language: string) => {
    return language.toLowerCase().split('-')[0];
};

const languages = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '中文' },
];

const SwitchLanguage: FC = () => {
    const { i18n } = useTranslation();

    const language = normalizedLanguage(i18n.language);

    const handleLanguageChange = async (lang: string) => {
        await i18n.changeLanguage(lang);
    };

    return (
        <Suspense fallback={null}>
            <Select
                size="xs"
                value={language}
                data={languages}
                style={{ width: 88 }}
                onChange={handleLanguageChange}
            />
        </Suspense>
    );
};

export default SwitchLanguage;
