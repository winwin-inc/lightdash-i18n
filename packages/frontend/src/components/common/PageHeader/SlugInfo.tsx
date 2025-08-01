import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import TextCopy from '../TextCopy';
import InfoContainer from './InfoContainer';

interface SlugInfoProps {
    slug: string;
}

const SlugInfo: FC<SlugInfoProps> = ({ slug }) => {
    const { t } = useTranslation();
    
    return (
        <InfoContainer icon={IconKey}>
            {t('components_common_page_header.slug')}:{' '}
            <div style={{ display: 'inline-block' }}>
                <TextCopy variant="code" text={slug} tooltipLabel={t('components_common_page_header.copy_slug')} />
            </div>
        </InfoContainer>
    );
};

export default SlugInfo;
