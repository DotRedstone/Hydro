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

// [Glyphs] 4×6 网格上的笔画，原点在左上
type Stroke = [number, number][];
const GLYPHS: Record<string, Stroke[]> = {
    2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
    3: [[[0, 0], [4, 0], [2, 2.5], [3, 2.5], [4, 3.5], [4, 5], [3, 6], [1, 6], [0, 5]]],
    4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
    5: [[[4, 0], [0, 0], [0, 2.5], [3, 2.5], [4, 3.5], [4, 5], [3, 6], [1, 6], [0, 5]]],
    6: [[[3.5, 0], [2, 0], [0, 2], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.5], [3, 2.5], [1, 2.5], [0, 3.5]]],
    7: [[[0, 0], [4, 0], [1.5, 6]]],
    8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
    9: [[[4, 2.5], [3, 3.5], [1, 3.5], [0, 2.5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 4], [2, 6], [0.5, 6]]],
    A: [[[0, 6], [2, 0], [4, 6]], [[0.7, 4], [3.3, 4]]],
    B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
    C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
    D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
    F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
    G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.5], [2.5, 3.5]]],
    H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    J: [[[1.5, 0], [4, 0]], [[3, 0], [3, 5], [2, 6], [1, 6], [0, 5]]],
    K: [[[0, 0], [0, 6]], [[4, 0], [0, 4]], [[1.3, 2.8], [4, 6]]],
    L: [[[0, 0], [0, 6], [4, 6]]],
    M: [[[0, 6], [0, 0], [2, 3.5], [4, 0], [4, 6]]],
    N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
    P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
    Q: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.5, 4.5], [4.2, 6.3]]],
    R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]], [[2, 3.5], [4, 6]]],
    S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
    T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
    U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
    V: [[[0, 0], [2, 6], [4, 0]]],
    W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
    X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
    Y: [[[0, 0], [2, 3]], [[4, 0], [2, 3], [2, 6]]],
    Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
};

// [Random]
const rand = (min: number, max: number) => min + (randomInt(1_000_000) / 1_000_000) * (max - min);
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

function shuffle<T>(list: T[]) {
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = randomInt(i + 1);
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
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

// [Render] 每个字符随机缩放、旋转、错切并抖动，坐标直接烘焙进路径
function glyphStrokes(char: string, cx: number, cy: number) {
    const unit = rand(3.6, 4.3);
    const angle = (rand(-15, 15) * Math.PI) / 180;
    const skew = rand(-0.25, 0.25);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const place = ([gx, gy]: [number, number]) => {
        const lx = (gx - 2 + skew * (gy - 3)) * unit;
        const ly = (gy - 3) * unit;
        return [cx + lx * cos - ly * sin + rand(-0.6, 0.6), cy + lx * sin + ly * cos + rand(-0.6, 0.6)];
    };
    return GLYPHS[char].map((stroke) => {
        const points = stroke.map(place);
        if (randomInt(2)) points.reverse();
        let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
        for (let i = 1; i < points.length; i += 1) {
            const [px, py] = points[i - 1];
            const [qx, qy] = points[i];
            const mx = (px + qx) / 2 + rand(-0.8, 0.8);
            const my = (py + qy) / 2 + rand(-0.8, 0.8);
            d += `Q${fmt(mx)} ${fmt(my)} ${fmt(qx)} ${fmt(qy)}`;
        }
        return d;
    });
}

/** 生成自包含的 SVG 验证码：字符只以打乱顺序的笔画路径出现，源码里没有明文 */
export function renderCaptchaSvg(code: string) {
    const width = 132;
    const height = 44;
    const pad = 12;
    const step = (width - pad * 2) / code.length;
    const strokes: string[] = [];
    for (const [index, char] of [...code].entries()) {
        const x = pad + step * index + step / 2 + rand(-2, 2);
        const y = height / 2 + rand(-2, 2);
        strokes.push(...glyphStrokes(char, x, y));
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
        + `<path d="${shuffle(strokes).join('')}" fill="none" stroke="#3D3929" stroke-width="2.6" `
        + 'stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';
}
