import { type AnyType } from '@lightdash/common';
import {
    Button,
    Center,
    Checkbox,
    Image,
    Loader,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import html2canvas from 'html2canvas';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { lightdashApi, networkHistory } from '../../api';
import useToaster from '../../hooks/toaster/useToaster';

type SupportDrawerContentProps = {
    // Add props here
};

const MAX_LOG_LENGTH = 10;
let logHistory: AnyType[] = [];

/** This method will capture all the logs, and store it on memory
 * they will be shared when the user clicks on the share button
 * We only store the last 50 logs
 */
(function () {
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    function storeAndLog(type: AnyType, args: AnyType) {
        const message = {
            type,
            args: JSON.stringify(args).substring(0, 500),
            timestamp: new Date().toISOString(),
        };
        logHistory.push(message);
        if (logHistory.length > MAX_LOG_LENGTH) logHistory.shift(); // keep last 50
    }

    console.error = function (...args) {
        storeAndLog('error', args);
        originalError.apply(console, args);
    };

    console.warn = function (...args) {
        storeAndLog('warn', args);
        originalWarn.apply(console, args);
    };

    console.info = function (...args) {
        storeAndLog('info', args);
        originalInfo.apply(console, args);
    };
})();

const SupportDrawerContent: FC<SupportDrawerContentProps> = () => {
    const [includeImage, setIncludeImage] = useState(true);
    const [moreDetails, setMoreDetails] = useState('');
    const [allowAccess, setAllowAccess] = useState(true);
    const { t } = useTranslation();

    const [screenshot, setScreenshot] = useState<string | null>(null);
    const { showToastSuccess } = useToaster();
    useEffect(() => {
        const element = document.querySelector('body');
        if (element)
            void html2canvas(element as HTMLElement).then((canvas) => {
                const base64 = canvas.toDataURL('image/png');
                setScreenshot(base64);
            });
    }, []);

    const handleShare = useCallback(async () => {
        const body = JSON.stringify({
            image: includeImage ? screenshot : undefined,
            logs: JSON.stringify(logHistory).substring(0, 5000),
            network: JSON.stringify(networkHistory).substring(0, 5000), //Limit to 5000 chars to avoid "Payload too large"
            canImpersonate: allowAccess,
            description: moreDetails.substring(0, 5000),
        });
        void lightdashApi<null>({
            url: `/support/share`,
            method: 'POST',
            body,
        }).then(() => {
            showToastSuccess({
                title: t('providers_support_drawer.success.title'),
                subtitle: t('providers_support_drawer.success.subtitle'),
            });
        });
        modals.closeAll();
    }, [
        includeImage,
        screenshot,
        allowAccess,
        moreDetails,
        showToastSuccess,
        t,
    ]);

    return (
        <Stack spacing="xs">
            <Checkbox
                label={t('providers_support_drawer.include_image')}
                checked={includeImage}
                onChange={(event) => setIncludeImage(event.target.checked)}
                mt="xs"
            />
            {screenshot ? (
                <Image
                    height={200}
                    src={screenshot}
                    alt="Screenshot"
                    fit="contain"
                />
            ) : (
                <Center>
                    <Loader height={200} w="100%" variant="dots" />
                </Center>
            )}
            <Text mt="sm">{t('providers_support_drawer.more_details')}</Text>
            <Textarea
                placeholder="Enter more details"
                value={moreDetails}
                onChange={(event) => setMoreDetails(event.target.value)}
                minRows={4}
            />
            <Checkbox
                label={t('providers_support_drawer.allow_access')}
                checked={allowAccess}
                onChange={(event) => setAllowAccess(event.target.checked)}
                mt="xs"
            />
            <Text size="xs" color="dimmed">
                {t('providers_support_drawer.tips.part_1')}
            </Text>

            <Text size="xs" color="dimmed">
                {t('providers_support_drawer.tips.part_2')}
            </Text>
            <Button
                mt="xs"
                style={{ alignSelf: 'flex-end' }}
                onClick={handleShare}
            >
                {t('providers_support_drawer.tips.part_3')}
            </Button>
        </Stack>
    );
};

export default SupportDrawerContent;
