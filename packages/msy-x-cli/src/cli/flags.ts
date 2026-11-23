/**
 * commander 否定选项（`--no-x`）的读取。
 *
 * commander 把 `--no-browser` 记成 **`browser: false`**（未传时是 `browser: true`），
 * 而不是 `noBrowser: true`。直接读 `opts.noBrowser` 永远是 undefined，
 * `--no-browser` 会被静默忽略：URL 不打印、还照样去拉浏览器，
 * 用户只能看到一句“等待浏览器授权超时”。
 */

/** 是否传了 `--no-browser`（兼容将来改成非否定选项的 `noBrowser: true`） */
export const readNoBrowser = (opts: Record<string, unknown>): boolean =>
    opts.browser === false || opts.noBrowser === true;
