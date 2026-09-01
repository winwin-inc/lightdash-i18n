import { createContext, useContext, type FC, type PropsWithChildren } from 'react';
import {
    selectActiveFields,
    useExplorerSelector,
} from '../../../features/explorer/store';

/**
 * Lets a field tree show selection for a query other than the explorer's
 * primary metric query (e.g. a merge additional source).
 */
const ActiveFieldsOverrideContext = createContext<Set<string> | null>(null);

export const ActiveFieldsOverrideProvider: FC<
    PropsWithChildren<{ activeFields: Set<string> | null }>
> = ({ activeFields, children }) => (
    <ActiveFieldsOverrideContext.Provider value={activeFields}>
        {children}
    </ActiveFieldsOverrideContext.Provider>
);

export const useActiveFields = (): Set<string> => {
    const override = useContext(ActiveFieldsOverrideContext);
    const fromRedux = useExplorerSelector(selectActiveFields);
    return override ?? fromRedux;
};
