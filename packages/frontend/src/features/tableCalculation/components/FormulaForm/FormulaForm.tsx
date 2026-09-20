import { type Explore, type MetricQuery } from '@lightdash/common';
import { Box, Flex } from '@mantine-8/core';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useFormulaValidation } from '../../hooks/useFormulaValidation';
import { FormulaEditor } from './FormulaEditor';
import classes from './FormulaForm.module.css';

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    formula: string;
    initialFormula?: string;
    onChange: (formula: string) => void;
    onValidationChange: (error: string | null) => void;
    isFullScreen?: boolean;
};

export type FormulaFormHandle = {
    /** No-op stub kept for API compatibility with upstream AI fix flow. */
    fixWithAi: (errorMessage: string) => void;
};

export const FormulaForm = forwardRef<FormulaFormHandle, Props>(
    function FormulaForm(
        {
            explore,
            metricQuery,
            formula,
            initialFormula,
            onChange,
            onValidationChange,
            isFullScreen,
        },
        ref,
    ) {
        const { error, validate } = useFormulaValidation(formula, metricQuery);
        const [referenceOpened, setReferenceOpened] = useState(false);

        useEffect(() => {
            onValidationChange(error);
        }, [error, onValidationChange]);

        useImperativeHandle(
            ref,
            () => ({
                fixWithAi: () => undefined,
            }),
            [],
        );

        return (
            <Flex direction="column" h="100%">
                <Box
                    className={`${classes.container} ${
                        error ? classes.containerError : ''
                    }`}
                >
                    <Box className={classes.editorArea}>
                        <FormulaEditor
                            explore={explore}
                            metricQuery={metricQuery}
                            initialContent={initialFormula}
                            onTextChange={onChange}
                            onBlur={validate}
                            isFullScreen={isFullScreen}
                            aiEnabled={false}
                            referenceOpened={referenceOpened}
                            onReferenceToggle={setReferenceOpened}
                        />
                    </Box>
                </Box>
            </Flex>
        );
    },
);
