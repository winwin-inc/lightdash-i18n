/** qrcode-terminal 无官方类型，按实际导出（CommonJS: { generate }）声明 */
declare module 'qrcode-terminal' {
    export interface QrcodeTerminalOptions {
        small?: boolean;
    }
    export function generate(
        text: string,
        options?: QrcodeTerminalOptions | ((qrCode: string) => void),
        callback?: (qrCode: string) => void,
    ): void;
    const qrcodeTerminal: {
        generate: typeof generate;
    };
    export default qrcodeTerminal;
}
