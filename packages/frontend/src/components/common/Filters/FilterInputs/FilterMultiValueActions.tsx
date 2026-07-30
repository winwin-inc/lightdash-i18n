/*
 * FilterMultiValueActions
 *
 * Footer row appended to the MultiSelect dropdown via the `dropdownComponent`
 * override. Provides two shortcuts:
 *
 *   - "Add all (N)" / "Add all '<search>' (N)": bulk-adds every visible
 *     candidate that is not yet selected.
 *   - "Clear (N)": empties the current value set.
 *
 * Buttons call `event.preventDefault()` on `mousedown` to keep the search
 * input focused so the user can keep clicking after an action.
 */
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, type FC, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../MantineIcon';

import classes from './FilterMultiValueActions.module.css';

type Props = {
    /** Visible candidate values inside the dropdown (after Mantine filter). */
    candidates: string[];
    /** Currently selected values. */
    selected: string[];
    /** Current search input (controls the "with search" button text variant). */
    search: string;
    /** Triggered by "Add all" button. No-op when there is nothing to add. */
    onSelectAll: () => void;
    /** Triggered by "Clear" button. */
    onClear: () => void;
};

const I18N_KEY = 'components_common_filters_inputs.select_all_matched';

const FilterMultiValueActions: FC<Props> = ({
    candidates,
    selected,
    search,
    onSelectAll,
    onClear,
}) => {
    const { t } = useTranslation();

    const visibleCount = candidates.length;
    const selectedCount = selected.length;
    const trimmedSearch = search.trim();

    const allAlreadySelected = useMemo(
        () =>
            visibleCount > 0 &&
            candidates.every((value) => selected.includes(value)),
        [candidates, visibleCount, selected],
    );

    // Prevent the MultiSelect from blurring when clicking an action so the
    // user can chain actions without re-focusing the input.
    const keepFocus = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
    };

    const handleSelectAll = (event: MouseEvent<HTMLButtonElement>) => {
        keepFocus(event);
        if (allAlreadySelected) return;
        onSelectAll();
    };

    const handleClear = (event: MouseEvent<HTMLButtonElement>) => {
        keepFocus(event);
        onClear();
    };

    if (visibleCount === 0 && selectedCount === 0) {
        return null;
    }

    const selectAllLabel = allAlreadySelected
        ? t(`${I18N_KEY}.already_selected`, { count: visibleCount })
        : trimmedSearch
        ? t(`${I18N_KEY}.button_with_search`, {
              count: visibleCount,
              search: trimmedSearch,
          })
        : t(`${I18N_KEY}.button_no_search`, { count: visibleCount });

    return (
        <div className={classes.actionList}>
            {visibleCount > 0 && (
                <button
                    type="button"
                    className={`${classes.actionButton} ${
                        allAlreadySelected ? '' : classes.primary
                    }`}
                    disabled={allAlreadySelected}
                    aria-label={selectAllLabel}
                    onMouseDown={handleSelectAll}
                >
                    <MantineIcon
                        icon={IconPlus}
                        size="xs"
                        className={classes.actionIcon}
                    />
                    <span>{selectAllLabel}</span>
                </button>
            )}
            {selectedCount > 0 && (
                <button
                    type="button"
                    className={`${classes.actionButton} ${classes.danger}`}
                    aria-label={t(`${I18N_KEY}.clear`, {
                        count: selectedCount,
                    })}
                    onMouseDown={handleClear}
                >
                    <MantineIcon
                        icon={IconTrash}
                        size="xs"
                        className={classes.actionIcon}
                    />
                    <span>
                        {t(`${I18N_KEY}.clear`, { count: selectedCount })}
                    </span>
                </button>
            )}
        </div>
    );
};

export default FilterMultiValueActions;
