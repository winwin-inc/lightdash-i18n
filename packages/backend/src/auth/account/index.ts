export { fromJwt, fromSession } from './account';

// STUB
export function toSessionUser(account: any): any {
    return account?.user ?? account;
}
