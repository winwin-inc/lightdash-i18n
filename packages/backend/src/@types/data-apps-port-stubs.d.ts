declare module 'undici' {
    export const Agent: any;
    export const fetch: typeof globalThis.fetch;
    export type RequestInit = globalThis.RequestInit;
    export type Response = globalThis.Response;
    export type Dispatcher = any;
}
declare module '@aws-sdk/client-lambda-microvms' {
    export class LambdaMicroVMClient {
        constructor(...args: any[]);
        send(...args: any[]): Promise<any>;
    }
    // Class (not const) so it can be used both as a value and as a type.
    export class LambdaMicrovms {
        constructor(...args: any[]);
        runMicrovm(...args: any[]): Promise<any>;
        getMicrovm(...args: any[]): Promise<any>;
        suspendMicrovm(...args: any[]): Promise<any>;
        resumeMicrovm(...args: any[]): Promise<any>;
        terminateMicrovm(...args: any[]): Promise<any>;
        createMicrovmAuthToken(...args: any[]): Promise<any>;
    }
    export const MicrovmState: any;
    export class ResourceNotFoundException extends Error {}
    export const CreateMicroVMCommand: any;
    export const DeleteMicroVMCommand: any;
    export const GetMicroVMCommand: any;
    export const ListMicroVMsCommand: any;
    export const ResumeMicroVMCommand: any;
    export const SuspendMicroVMCommand: any;
}
declare module 'google-auth-library' {
    export class GoogleAuth {
        constructor(...args: any[]);
        getClient(...args: any[]): Promise<any>;
        getAccessToken(...args: any[]): Promise<any>;
    }
}
