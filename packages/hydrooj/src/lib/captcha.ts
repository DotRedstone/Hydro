import { randomInt } from 'crypto';

// 去掉 0/O/1/I 之类容易看错的字符，避免用户明明看对了却输入失败
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LENGTH = 4;

export const CAPTCHA_THRESHOLD = 3;

export function createCaptcha() {
    let code = '';
    for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
    return code;
}

function noiseLine(width: number, height: number) {
    const x1 = randomInt(width);
    const y1 = randomInt(height);
    const x2 = randomInt(width);
    const y2 = randomInt(height);
    const cx = randomInt(width);
    const cy = randomInt(height);
    return `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`;
}

/**
 * 生成一张自包含的 SVG 验证码。用不到外部依赖，也不需要额外字体：
 * 字符以随机旋转 + 抖动绘制，叠加两条曲线与若干噪点。
 * 图片交给 <img> 加载，因此颜色写死为浅色纸张 + 墨色字符。
 */
export function renderCaptchaSvg(code: string) {
    const width = 132;
    const height = 44;
    const pad = 12;
    const step = (width - pad * 2) / code.length;
    let glyphs = '';
    for (const [index, char] of [...code].entries()) {
        const x = pad + step * index + step / 2;
        const y = height / 2 + randomInt(5) - 2;
        const rotate = randomInt(31) - 15;
        const size = 25 + randomInt(3);
        glyphs += `<text x="${x}" y="${y}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" `
            + `font-size="${size}" font-weight="700" fill="#3D3929" text-anchor="middle" `
            + `dominant-baseline="middle" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
    }
    let dots = '';
    for (let i = 0; i < 14; i += 1) {
        dots += `<circle cx="${randomInt(width)}" cy="${randomInt(height)}" r="${randomInt(2) + 1}" `
            + `fill="#3D3929" fill-opacity="0.12"/>`;
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" '
        + `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="captcha">`
        + `<rect width="${width}" height="${height}" rx="10" fill="#F0EEE6"/>`
        + dots
        + `<path d="${noiseLine(width, height)}" fill="none" stroke="#D97757" stroke-opacity="0.45" stroke-width="1.4"/>`
        + `<path d="${noiseLine(width, height)}" fill="none" stroke="#8A8578" stroke-opacity="0.4" stroke-width="1.2"/>`
        + glyphs
        + '</svg>';
}
