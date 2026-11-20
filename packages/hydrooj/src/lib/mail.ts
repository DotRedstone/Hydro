import fs from 'fs-extra';
import nodemailer from 'nodemailer';
import path from 'path';
import { SendMailError } from '../error';
import { Logger } from '../logger';
import { hydroPath } from '../options';

const logger = new Logger('mail');

/**
 * 开发用发件箱：不连 SMTP，直接把邮件渲染成 HTML 落到 ~/.hydro/outbox/，
 * 供本地完整走通“注册 -> 收信 -> 点链接 -> 设置密码”的流程。
 */
function writeToOutbox(to: string, subject: string, html: string) {
    const dir = path.resolve(hydroPath, 'outbox');
    fs.ensureDirSync(dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTo = to.replace(/[^\w.@-]/g, '_');
    const file = path.join(dir, `${stamp}-${safeTo}.html`);
    fs.writeFileSync(file, html, 'utf-8');
    logger.info('dev outbox: %s (%s)', file, subject);
    return file;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
    let t: unknown;
    try {
        const { system } = global.Hydro.model;
        const [host, port, secure, user, pass, from, devOutbox] = await Promise.all([
            system.get('smtp.host'),
            system.get('smtp.port'),
            system.get('smtp.secure'),
            system.get('smtp.user'),
            system.get('smtp.pass'),
            system.get('smtp.from'),
            system.get('smtp.devOutbox'),
        ]);
        if (devOutbox) return { devOutbox: writeToOutbox(to, subject, html) };
        const transporter = nodemailer.createTransport({
            host, port, secure, auth: { user, pass },
        });
        t = await new Promise((resolve, reject) => {
            transporter.sendMail({
                from,
                to,
                subject,
                text,
                html,
            }, (err, info) => {
                if (err) reject(err);
                else resolve(info);
            });
        });
    } catch (e) {
        logger.error(e);
        throw new SendMailError(to, e.message);
    }
    return t;
}
