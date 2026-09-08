// STUB: API / auth helpers not yet fully ported from upstream
// Theme / pipeline types now live in ee/designs and types/schedulerTaskList.
export type ApiAppSchedulersResponse = { status: 'ok'; results: unknown };
export type ApiCreateAppSchedulerResponse = {
    status: 'ok';
    results: unknown;
};
export type UuidOrSlug = string;
export function assertRegisteredAccount(
    account: unknown,
): asserts account is object {
    if (!account) {
        throw new Error('STUB assertRegisteredAccount: missing account');
    }
}
