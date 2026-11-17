/**
 * 管道读 stdin（`--file -` 等场景）。
 *
 * `process.stdin.isTTY` 为真（交互终端、没有管道输入）时立即返回 null，
 * 绝不挂死等待；仅在确实有管道（或可读流已就绪）时读到 end / error。
 */
export const readStdinIfPiped = async (
    stdin: NodeJS.ReadStream = process.stdin,
): Promise<string | null> => {
    if (stdin.isTTY === true) return null;
    if (stdin.destroyed) return null;

    stdin.setEncoding('utf8');
    const chunks: string[] = [];
    return new Promise<string | null>((resolve) => {
        let settled = false;
        const cleanup = (): void => {
            stdin.off('data', onData);
            stdin.off('end', onEnd);
            stdin.off('error', onError);
            stdin.off('close', onClose);
        };
        const finish = (value: string | null): void => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
        };
        const onData = (chunk: string): void => {
            chunks.push(chunk);
        };
        const onEnd = (): void => {
            finish(chunks.join(''));
        };
        const onError = (): void => {
            finish(null);
        };
        const onClose = (): void => {
            finish(chunks.length > 0 ? chunks.join('') : null);
        };
        stdin.on('data', onData);
        stdin.on('end', onEnd);
        stdin.on('error', onError);
        stdin.on('close', onClose);
    });
};
