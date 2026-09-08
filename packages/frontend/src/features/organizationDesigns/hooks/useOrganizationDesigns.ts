// STUB: organization designs / themes not ported.
export type StubOrganizationDesign = {
    designUuid: string;
    name: string;
    isDefault: boolean;
};

export const useOrganizationDesigns = (_opts?: unknown) => ({
    data: [] as StubOrganizationDesign[],
    isFetched: true,
    isLoading: false,
    isInitialLoading: false,
});
