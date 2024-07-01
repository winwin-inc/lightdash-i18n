import { Ability } from '@casl/ability';
import { createContextualCan } from '@casl/react';
import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';

export const AbilityContext = createContext(new Ability());
export const Can = createContextualCan(AbilityContext.Consumer);

export function useAbilityContext() {
    const { t } = useTranslation();
    const context = useContext(AbilityContext);

    if (context === undefined) {
        throw new Error(
            t('components_common_authorization.ablitity_not_allowed'),
        );
    }

    return context;
}
