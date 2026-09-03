// STUB: declare module so typecheck passes without installing the package.
// Return `any` so assignability to S3ClientConfig['credentials'] succeeds.
declare module '@aws-sdk/credential-providers' {
    export function createCredentialChain(...providers: unknown[]): any;
    export function fromEnv(): any;
    export function fromHttp(_opts: unknown): any;
    export function fromIni(): any;
    export function fromTokenFile(): any;
    export function fromContainerMetadata(): any;
    export function fromInstanceMetadata(): any;
}