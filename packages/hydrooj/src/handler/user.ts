import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import moment from 'moment-timezone';
import { Binary } from 'mongodb';
import Schema from 'schemastery';
import { randomstring } from '@hydrooj/utils';
import type { Context } from '../context';
import {
    AuthOperationError, BadRequestError, BlacklistedError, BuiltinLoginError,
    ForbiddenError, InvalidTokenError, LoginError, NotFoundError, OpcountExceededError,
    SendMailError, SystemError, UserAlreadyExistError, UserFacingError,
    UserNotFoundError, ValidationError, VerifyPasswordError,
} from '../error';
import { TokenDoc, Udoc, User } from '../interface';
import avatar from '../lib/avatar';
import { CAPTCHA_THRESHOLD, createCaptcha, renderCaptchaSvg } from '../lib/captcha';
import { sendMail } from '../lib/mail';
import { verifyTFA } from '../lib/verifyTFA';
import BlackListModel from '../model/blacklist';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as ContestModel from '../model/contest';
import domain from '../model/domain';
import * as opcount from '../model/opcount';
import * as oplog from '../model/oplog';
import problem, { ProblemDoc } from '../model/problem';
import ScheduleModel from '../model/schedule';
import SolutionModel from '../model/solution';
import system from '../model/system';
import token from '../model/token';
import user, { deleteUserCache } from '../model/user';
import {
    Handler, param, post, Query, Types,
} from '../service/server';

async function successfulAuth(this: Handler, udoc: User) {
    if (udoc._id !== 0) {
        await this.ctx.serial('auth/before-login', this, udoc);
        await user.setById(udoc._id, { loginat: new Date(), loginip: this.request.ip });
    }
    this.context.HydroContext.user = udoc;
    this.session.viewLang = '';
    this.session.uid = udoc._id;
    this.session.sudo = null;
    this.session.sudoUid = null;
    this.session.scope = PERM.PERM_ALL.toString();
    this.session.oauthBind = null;
    this.session.recreate = true;
    if (udoc._id !== 0) {
        await oplog.log(this, 'user.loginSuccess', { uid: udoc._id });
        await this.ctx.serial('auth/login', this, udoc);
    }
}

// [Login Fail] 失败计数同时记在会话与服务端（按 IP、按用户名），清 cookie 不能绕过验证码
const LOGIN_FAIL_WINDOW = 15 * 60;
const failKey = (uname: string) => uname.trim().toLowerCase();

async function isCaptchaRequired(h: Handler, uname = '') {
    if ((h.session.loginFail || 0) >= CAPTCHA_THRESHOLD) return true;
    const [byIp, byName] = await Promise.all([
        opcount.get('user_login_fail', h.request.ip, LOGIN_FAIL_WINDOW),
        uname ? opcount.get('user_login_fail_id', failKey(uname), LOGIN_FAIL_WINDOW) : 0,
    ]);
    return byIp >= CAPTCHA_THRESHOLD || byName >= CAPTCHA_THRESHOLD;
}

async function recordLoginFail(h: Handler, uname: string) {
    h.session.loginFail = (h.session.loginFail || 0) + 1;
    await Promise.all([
        opcount.inc('user_login_fail', h.request.ip, LOGIN_FAIL_WINDOW, Number.MAX_SAFE_INTEGER),
        opcount.inc('user_login_fail_id', failKey(uname), LOGIN_FAIL_WINDOW, Number.MAX_SAFE_INTEGER),
    ]);
}

/** 校验并一次性消耗会话中的验证码，避免同一张图被重复使用 */
function consumeCaptcha(h: Handler, input: string) {
    const expect = h.session.captcha;
    const issuedAt = h.session.captchaAt || 0;
    h.session.captcha = null;
    h.session.captchaAt = 0;
    if (!expect || Date.now() - issuedAt > 5 * 60 * 1000) {
        throw new ValidationError('captcha', null, h.translate('Captcha expired, please enter the new one.'));
    }
    if (!input || input.trim().toUpperCase() !== expect) {
        throw new ValidationError('captcha', null, h.translate('Captcha mismatch, please try again.'));
    }
}

// [Inline Error] 表单页内联错误文案
function inlineErrorText(h: Handler, e: any) {
    if (e instanceof ValidationError && e.params[0] === 'captcha' && e.params[2]) return e.params[2];
    return h.translate(e.message).formatFromArray(e.params || []);
}

class UserLoginHandler extends Handler {
    noCheckPermView = true;

    private async renderWithError(message: string, uname: string, redirect: string) {
        this.response.template = 'user_login.html';
        this.response.body = {
            redirect,
            uname,
            error: message,
            builtInLogin: system.get('server.login'),
            loginMethods: this.loginMethods,
            captchaRequired: await isCaptchaRequired(this, uname),
        };
    }

    @param('redirect', Types.String, true)
    async get(domainId: string, redirect: string = '') {
        this.response.template = 'user_login.html';
        this.response.body = {
            redirect,
            uname: '',
            error: '',
            builtInLogin: system.get('server.login'),
            loginMethods: this.loginMethods,
            captchaRequired: await isCaptchaRequired(this),
        };
    }

    @param('uname', Types.Username)
    @param('password', Types.Password)
    @param('rememberme', Types.Boolean)
    @param('redirect', Types.String, true)
    @param('tfa', Types.String, true)
    @param('authnChallenge', Types.String, true)
    @param('judge', Types.Boolean, true)
    @param('captcha', Types.String, true)
    async post(
        domainId: string, uname: string, password: string, rememberme = false, redirect = '',
        tfa = '', authnChallenge = '', judge = false, captcha = '',
    ) {
        // 浏览器表单提交时留在登录页显示错误，其它调用方仍拿到原来的错误对象
        const inline = !judge && (this.request.headers.accept || '').includes('text/html');
        try {
            if (!judge && !system.get('server.login')) throw new BuiltinLoginError();
            // 限流放在查用户之前：不存在的用户名同样消耗额度
            await Promise.all([
                this.limitRate('user_login', 60, 30),
                this.limitRate('user_login_id', 60, 5, failKey(uname)),
                oplog.log(this, 'user.login', { redirect }),
            ]);
            if (!judge && await isCaptchaRequired(this, uname)) consumeCaptcha(this, captcha);
            let udoc = await user.getByEmail(domainId, uname);
            udoc ||= await user.getByUname(domainId, uname);
            if (judge && !system.get('server.login') && !udoc?.hasPriv(PRIV.PRIV_JUDGE)) throw new BuiltinLoginError();
            if (!udoc) {
                await recordLoginFail(this, uname);
                // 与密码错误同一种错误，避免任何调用方据此枚举用户名
                throw new LoginError(uname);
            }
            if (system.get('system.contestmode') && !udoc.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
                if (udoc._loginip && udoc._loginip !== this.request.ip) throw new ValidationError('ip');
                if (system.get('system.contestmode') === 'strict') {
                    const udocs = await user.getMulti({ loginip: this.request.ip, _id: { $ne: udoc._id } }).toArray();
                    if (udocs.length) throw new ValidationError('ip');
                }
            }
            if (udoc.tfa || udoc.authn) {
                if (udoc.tfa && tfa) {
                    if (!verifyTFA(udoc._tfa, tfa)) {
                        await recordLoginFail(this, uname);
                        throw new InvalidTokenError('2FA');
                    }
                } else if (udoc.authn && authnChallenge) {
                    const challenge = await token.get(authnChallenge, token.TYPE_WEBAUTHN);
                    if (!challenge || challenge.uid !== udoc._id) {
                        await recordLoginFail(this, uname);
                        throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_WEBAUTHN]);
                    }
                    if (!challenge.verified) throw new ValidationError('challenge');
                    await token.del(authnChallenge, token.TYPE_WEBAUTHN);
                } else throw new ValidationError('2FA', 'Authn');
            }
            try {
                await udoc.checkPassword(password);
            } catch (e) {
                await recordLoginFail(this, uname);
                throw e;
            }
            if (!udoc.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new BlacklistedError(uname, udoc.banReason);
            this.session.loginFail = 0;
            await successfulAuth.call(this, udoc);
            this.session.save = rememberme;
            this.response.redirect = redirect || ((this.request.referer || '/login').endsWith('/login')
                ? this.url('homepage') : this.request.referer);
        } catch (e) {
            if (!inline) throw e;
            // 账号或密码错误时不暴露具体是哪一项错，统一一句话
            let message = inlineErrorText(this, e);
            if (e instanceof UserNotFoundError || e instanceof LoginError) {
                message = this.translate('Invalid username/email or password.');
            } else if (e instanceof OpcountExceededError) {
                message = this.translate('Too many attempts, please try again later.');
            }
            await this.renderWithError(message, uname, redirect);
        }
    }
}

class CaptchaHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get() {
        const code = createCaptcha();
        this.session.captcha = code;
        this.session.captchaAt = Date.now();
        this.response.type = 'image/svg+xml';
        this.response.addHeader('cache-control', 'no-store, max-age=0');
        this.response.body = renderCaptchaSvg(code);
    }
}

class UserSudoHandler extends Handler {
    async get() {
        if (!this.session.sudoArgs?.method) throw new ForbiddenError();
        this.response.template = 'user_sudo.html';
    }

    @param('password', Types.String, true)
    @param('tfa', Types.String, true)
    @param('authnChallenge', Types.String, true)
    async post(domainId: string, password = '', tfa = '', authnChallenge = '') {
        if (!this.session.sudoArgs?.method) throw new ForbiddenError();
        await Promise.all([
            this.limitRate('user_sudo', 60, 5, '{{user}}'),
            oplog.log(this, 'user.sudo', {}),
        ]);
        if (this.user.authn && authnChallenge) {
            const challenge = await token.get(authnChallenge, token.TYPE_WEBAUTHN);
            if (challenge?.uid !== this.user._id) throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_WEBAUTHN]);
            if (!challenge.verified) throw new ValidationError('challenge');
            await token.del(authnChallenge, token.TYPE_WEBAUTHN);
        } else if (this.user.tfa && tfa) {
            if (!verifyTFA(this.user._tfa, tfa)) throw new InvalidTokenError('2FA');
        } else await this.user.checkPassword(password);
        this.session.sudo = Date.now();
        if (this.session.sudoArgs.method.toLowerCase() !== 'get') {
            this.response.template = 'user_sudo_redirect.html';
            this.response.body = this.session.sudoArgs;
        } else this.response.redirect = this.session.sudoArgs.redirect;
        this.session.sudoArgs.method = null;
    }
}

class UserTFAHandler extends Handler {
    noCheckPermView = true;

    @param('q', Types.String)
    async get({ }, q: string) {
        let udoc = await user.getByUname('system', q);
        udoc ||= await user.getByEmail('system', q);
        if (!udoc) this.response.body = { tfa: false, authn: false };
        else this.response.body = { tfa: udoc.tfa, authn: udoc.authn };
    }
}

class UserWebauthnHandler extends Handler {
    noCheckPermView = true;

    getAuthnHost() {
        return system.get('authn.host') && this.request.hostname.includes(system.get('authn.host'))
            ? system.get('authn.host') : this.request.hostname;
    }

    @param('uname', Types.Username, true)
    @param('login', Types.Boolean)
    async get(domainId: string, uname: string, login: boolean) {
        let allowCredentials = [];
        let uid = 0;
        if (!login) {
            const udoc = this.user._id ? this.user : ((await user.getByEmail(domainId, uname)) || await user.getByUname(domainId, uname));
            if (!udoc._id) throw new UserNotFoundError(uname || 'user');
            if (!udoc.authn) throw new AuthOperationError('authn', 'disabled');
            allowCredentials = udoc._authenticators.map((authenticator) => ({
                id: isoBase64URL.fromBuffer(new Uint8Array(authenticator.credentialID.buffer)),
            }));
            uid = udoc._id;
        }
        const options = await generateAuthenticationOptions({
            allowCredentials,
            rpID: this.getAuthnHost(),
            userVerification: 'preferred',
        });
        await token.add(token.TYPE_WEBAUTHN, 60, { uid: login ? 'login' : uid }, options.challenge);
        this.session.challenge = options.challenge;
        this.response.body.authOptions = options;
    }

    async post({ domainId, result, redirect }) {
        const challenge = this.session.challenge;
        if (!challenge) throw new ForbiddenError('no-challenge');
        const tdoc = await token.get(challenge, token.TYPE_WEBAUTHN);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_WEBAUTHN]);
        const udoc = await (tdoc.uid === 'login'
            ? (async () => {
                const u = await user.coll.findOne({ 'authenticators.credentialID': Binary.createFromBase64(result.id) });
                return u ? await user.getById(domainId, u._id) : null;
            })()
            : user.getById(domainId, tdoc.uid));
        if (!udoc) throw new NotFoundError();
        const parseId = (id: Binary) => Buffer.from(id.toString('hex'), 'hex').toString('base64url');
        const authenticator = udoc._authenticators?.find((c) => parseId(c.credentialID) === result.id);
        if (!authenticator) throw new ValidationError('authenticator');
        const verification = await verifyAuthenticationResponse({
            response: result,
            expectedChallenge: challenge,
            expectedOrigin: this.request.headers.origin,
            expectedRPID: this.getAuthnHost(),
            credential: {
                ...authenticator,
                id: isoBase64URL.fromBuffer(new Uint8Array(authenticator.credentialID.buffer)),
                publicKey: new Uint8Array(authenticator.credentialPublicKey.buffer),
            },
        }).catch(() => null);
        if (!verification?.verified) throw new ValidationError('authenticator');
        authenticator.counter = verification.authenticationInfo.newCounter;
        await user.setById(udoc._id, { authenticators: udoc._authenticators });
        if (tdoc.uid === 'login') {
            await successfulAuth.call(this, await user.getById(domainId, udoc._id));
            await token.del(challenge, token.TYPE_WEBAUTHN);
            this.response.redirect = redirect || ((this.request.referer || '/login').endsWith('/login')
                ? this.url('homepage') : this.request.referer);
        } else {
            await token.update(challenge, token.TYPE_WEBAUTHN, 60, { verified: true });
            this.back();
        }
    }
}

class UserLogoutHandler extends Handler {
    noCheckPermView = true;

    async get() {
        this.response.template = 'user_logout.html';
    }

    async post({ domainId }) {
        await successfulAuth.call(this, await user.getById(domainId, 0));
        this.response.redirect = '/';
    }
}

// rename to RegisterSendMailHandler
export class UserRegisterHandler extends Handler {
    noCheckPermView = true;
    async prepare() {
        if (!system.get('server.login')) throw new BuiltinLoginError();
    }

    async get() {
        this.response.template = 'user_register.html';
        this.response.body = { captchaRequired: true, error: '', mail: '' };
    }

    @post('mail', Types.Email)
    @param('captcha', Types.String, true)
    async post({ }, mail: string, captcha = '') {
        try {
            consumeCaptcha(this, captcha);
        } catch (e) {
            this.response.template = 'user_register.html';
            this.response.body = { captchaRequired: true, error: inlineErrorText(this, e), mail };
            return;
        }
        if (await user.getByEmail('system', mail)) throw new UserAlreadyExistError(mail);
        const mailDomain = mail.split('@')[1];
        if (await BlackListModel.get(`mail::${mailDomain}`)) throw new BlacklistedError(mailDomain);
        await Promise.all([
            this.limitRate('send_mail', 60, 1, mail),
            this.limitRate('send_mail', 3600, 30),
            oplog.log(this, 'user.register', {}),
        ]);
        const t = await token.add(
            token.TYPE_REGISTRATION,
            system.get('session.unsaved_expire_seconds'),
            {
                mail,
                redirect: this.domain.registerRedirect,
                identity: {
                    provider: 'mail',
                    platform: 'mail',
                    id: mail,
                },
            },
        );
        const prefix = this.domain.host
            ? `${this.domain.host instanceof Array ? this.domain.host[0] : this.domain.host}`
            : system.get('server.url');
        if (system.get('smtp.verify') && (system.get('smtp.user') || system.get('smtp.devOutbox'))) {
            const m = await this.renderHTML('user_register_mail.html', {
                path: `/register/${t[0]}`,
                url_prefix: prefix.endsWith('/') ? prefix.slice(0, -1) : prefix,
            });
            await sendMail(mail, 'Sign Up', 'user_register_mail', m.toString());
            this.response.template = 'user_register_mail_sent.html';
            this.response.body = { mail };
        } else this.response.redirect = this.url('user_register_with_code', { code: t[0] });
    }
}

class UserRegisterWithCodeHandler extends Handler {
    noCheckPermView = true;
    tdoc: TokenDoc;

    @param('code', Types.String)
    async prepare({ }, code: string) {
        this.tdoc = await token.get(code, token.TYPE_REGISTRATION);
        if (!this.tdoc?.identity) {
            // prevent brute forcing tokens
            await this.limitRate('user_register_with_code', 60, 5);
            throw new InvalidTokenError(token.TYPE_TEXTS[token.TYPE_REGISTRATION], code);
        }
    }

    async get() {
        const provider = this.ctx.oauth.providers[this.tdoc.identity.provider];
        this.response.template = 'user_register_with_code.html';
        this.response.body = {
            ...this.tdoc,
            lockUsername: !!provider?.lockUsername,
        };
    }

    @param('password', Types.Password)
    @param('verifyPassword', Types.Password)
    @param('uname', Types.Username, true)
    @param('code', Types.String)
    async post(
        domainId: string, password: string, verify: string,
        uname = '', code: string,
    ) {
        const provider = this.ctx.oauth.providers[this.tdoc.identity.provider];
        if (!provider) throw new SystemError(`OAuth provider ${this.tdoc.identity.provider} not found`);
        if (provider.lockUsername) uname = this.tdoc.username;
        if (!Types.Username[1](uname)) throw new ValidationError('uname');
        if (password !== verify) throw new VerifyPasswordError();
        const randomEmail = `${randomstring(12)}@invalid.local`; // some random email to remove in the future
        const uid = await user.create(this.tdoc.mail || randomEmail, uname, password, undefined, this.request.ip);
        await token.del(code, token.TYPE_REGISTRATION);
        const [id, mailDomain] = this.tdoc.mail.split('@');
        const $set: any = this.tdoc.set || {};
        if (mailDomain === 'qq.com' && !Number.isNaN(+id)) {
            $set.avatar = `qq:${id}`;
            $set.qq = `${id}`;
        }
        if (this.session.viewLang) $set.viewLang = this.session.viewLang;
        if (Object.keys($set).length) await user.setById(uid, $set);
        if (Object.keys(this.tdoc.setInDomain || {}).length) await domain.setUserInDomain(domainId, uid, this.tdoc.setInDomain);
        await this.ctx.oauth.set(this.tdoc.identity.platform, this.tdoc.identity.id, uid);
        await successfulAuth.call(this, await user.getById(domainId, uid));
        this.response.redirect = this.tdoc.redirect || this.url('home_settings', { category: 'preference' });
    }
}

/** 发信通道：配了 SMTP 账号，或者开了开发用 outbox，都算能发信 */
function canSendMail() {
    return !!(system.get('smtp.user') || system.get('smtp.devOutbox'));
}

/** 重置链接的有效时长（小时），与 token 的过期时间保持一致 */
function resetExpireHours() {
    return Math.max(1, Math.round(system.get('session.unsaved_expire_seconds') / 3600));
}

// 域名各段不含点，相邻量词字符集不重叠，避免回溯爆炸
const MAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

class UserLostPassHandler extends Handler {
    noCheckPermView = true;

    private render(mail: string, error = '') {
        this.response.template = 'user_lostpass.html';
        this.response.body = { mail, error, mailEnabled: canSendMail() };
    }

    async get() {
        this.render('');
    }

    @param('mail', Types.String, true)
    async post(domainId: string, mail = '') {
        const address = mail.trim();
        if (!MAIL_PATTERN.test(address)) {
            this.render(address, this.translate('Enter a valid email address.'));
            return;
        }
        if (!canSendMail()) {
            this.render(address, this.translate('Mail service is not configured yet.'));
            return;
        }
        try {
            // 限流放在查邮箱之前，未注册的邮箱同样消耗额度
            await Promise.all([
                this.limitRate('send_mail', 3600, 30),
                this.limitRate('send_mail', 60, 1, address.toLowerCase()),
                oplog.log(this, 'user.lostpass', {}),
            ]);
            const udoc = await user.getByEmail('system', address);
            if (!udoc) {
                // 未注册也显示“已发送”，不暴露邮箱是否存在
                this.response.template = 'user_lostpass_mail_sent.html';
                this.response.body = { mail: address, expireHours: resetExpireHours() };
                return;
            }
            const [tid] = await token.add(
                token.TYPE_LOSTPASS,
                system.get('session.unsaved_expire_seconds'),
                { uid: udoc._id },
            );
            const prefix = this.domain.host
                ? `${this.domain.host instanceof Array ? this.domain.host[0] : this.domain.host}`
                : system.get('server.url');
            const m = await this.renderHTML('user_lostpass_mail.html', {
                url: `/lostpass/${tid}`,
                url_prefix: prefix.endsWith('/') ? prefix.slice(0, -1) : prefix,
                uname: udoc.uname,
                expireHours: resetExpireHours(),
            });
            await sendMail(address, 'Lost Password', 'user_lostpass_mail', m.toString());
            this.response.template = 'user_lostpass_mail_sent.html';
            this.response.body = { mail: address, expireHours: resetExpireHours() };
        } catch (e) {
            if (!(e instanceof UserFacingError)) throw e;
            // 浏览器表单：错误留在页面上，别把人甩到错误页
            let message = inlineErrorText(this, e);
            if (e instanceof OpcountExceededError) message = this.translate('Too many attempts, please try again later.');
            else if (e instanceof SendMailError) message = this.translate('Failed to send the mail, please try again later.');
            this.render(address, message);
        }
    }
}

class UserLostPassWithCodeHandler extends Handler {
    noCheckPermView = true;

    private async loadUname(code: string) {
        const tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) return null;
        const udoc = await user.getById('system', tdoc.uid);
        return udoc?.uname || null;
    }

    private async render(code: string, error = '') {
        const uname = await this.loadUname(code);
        this.response.template = 'user_lostpass_with_code.html';
        this.response.body = {
            code, uname, error, expireHours: resetExpireHours(),
        };
    }

    @param('code', Types.String)
    async get(domainId: string, code: string) {
        await this.render(code);
    }

    @param('code', Types.String)
    @param('password', Types.String, true)
    @param('verifyPassword', Types.String, true)
    async post(domainId: string, code: string, password = '', verifyPassword = '') {
        const tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) {
            await this.render(code, this.translate('The reset link is invalid or has expired.'));
            return;
        }
        if (password.length < 6 || password.length > 255) {
            await this.render(code, this.translate('Password should be at least 6 characters.'));
            return;
        }
        if (password !== verifyPassword) {
            await this.render(code, this.translate('Passwords do not match.'));
            return;
        }
        await this.limitRate('user_lostpass', 60, 10, '{{user}}');
        await user.setById(tdoc.uid, { authenticators: [], tfa: false });
        await user.setPassword(tdoc.uid, password);
        await token.del(code, token.TYPE_LOSTPASS);
        // 密码换了就作废所有登录态：原来占着会话的人必须重新登录
        await token.delByUid(tdoc.uid, token.TYPE_SESSION);
        await oplog.log(this, 'user.lostpass.reset', { uid: tdoc.uid });
        // 密码换了就回登录页，让人用新密码登一次
        this.response.redirect = this.url('user_login');
    }
}

class UserDetailHandler extends Handler {
    @param('uid', Types.Int)
    async get(domainId: string, uid: number) {
        if (uid === 0) throw new UserNotFoundError(0);
        const isSelfProfile = this.user._id === uid;
        const [udoc, sdoc] = await Promise.all([
            user.getById(domainId, uid),
            token.getMostRecentSessionByUid(uid, ['createAt', 'updateAt']),
        ]);
        if (!udoc) throw new UserNotFoundError(uid);
        const pdocs: ProblemDoc[] = [];
        const acInfo: Record<string, number> = {};
        const canViewHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        if (this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) {
            const psdocs = await problem.getMultiStatus(domainId, { uid, status: STATUS.STATUS_ACCEPTED }).toArray();
            pdocs.push(...Object.values(
                await problem.getList(
                    domainId, psdocs.map((i) => i.docId), canViewHidden,
                    false, problem.PROJECTION_LIST, true,
                ),
            ));
        }
        for (const pdoc of pdocs) {
            for (const tag of pdoc.tag) {
                if (acInfo[tag]) acInfo[tag]++;
                else acInfo[tag] = 1;
            }
        }
        const tags = Object.entries(acInfo).sort((a, b) => b[1] - a[1]).slice(0, 20);
        const tsdocs = await ContestModel.getMultiStatus(domainId, { uid, attend: { $exists: true } }).project({ docId: 1 }).toArray();
        const tdocs = await ContestModel.getMulti(domainId, { docId: { $in: tsdocs.map((i) => i.docId) } })
            .project({ docId: 1, title: 1, rule: 1 }).sort({ _id: -1 }).toArray();
        this.response.template = 'user_detail.html';
        this.response.body = {
            isSelfProfile, udoc, sdoc, pdocs, tags, tdocs,
        };
        if (this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_SOLUTION)) {
            const psdocs = await SolutionModel.getByUser(domainId, uid).limit(10).toArray();
            this.response.body.psdocs = psdocs;
            if (this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) {
                this.response.body.pdict = await problem.getList(
                    domainId, psdocs.map((i) => i.parentId), canViewHidden,
                    false, problem.PROJECTION_LIST,
                );
            }
        }
        this.UiContext.extraTitleContent = udoc.uname;
    }
}

class UserDeleteHandler extends Handler {
    async post({ password }) {
        await this.user.checkPassword(password);
        const tid = await ScheduleModel.add({
            executeAfter: moment().add(7, 'days').toDate(),
            type: 'script',
            id: 'deleteUser',
            args: { uid: this.user._id },
        });
        await user.setById(this.user._id, { del: tid });
        this.response.template = 'user_delete_pending.html';
    }
}

class OauthHandler extends Handler {
    noCheckPermView = true;

    @param('type', Types.Key)
    @param('redirect', Types.String, true)
    async get(domainId: string, type: string, redirect = '') {
        this.session.oauthRedirect = redirect;
        await this.ctx.oauth.providers[type]?.get.call(this);
    }
}

class OauthCallbackHandler extends Handler {
    noCheckPermView = true;

    async get(args: any) {
        const provider = this.ctx.oauth.providers[args.type];
        if (!provider) throw new UserFacingError('Oauth type');
        await this.limitRate('oauth_callback', 60, 5);
        const r = await provider.callback.call(this, args);
        const ids = Array.isArray(r._id) ? r._id : [r._id];
        const existing = await Promise.all(ids.map((id) => this.ctx.oauth.get(args.type, id)));
        if (this.session.oauthBind === args.type) {
            delete this.session.oauthBind;
            if (existing.some((id) => id && id !== this.user._id)) {
                throw new BadRequestError('Already bound to another account');
            }
            this.response.redirect = this.session.oauthRedirect || this.url('home_security');
            delete this.session.oauthRedirect;
            await Promise.all(ids.map((i) => this.ctx.oauth.set(args.type, i, this.user._id)));
            return;
        }
        const effective = existing.find((i) => i);
        if (effective) {
            await successfulAuth.call(this, await user.getById('system', effective));
            this.response.redirect = this.session.oauthRedirect || this.url('homepage');
            delete this.session.oauthRedirect;
            return;
        }
        const udoc = await user.getByEmail('system', r.email);
        if (udoc) {
            await Promise.all(ids.map((i) => this.ctx.oauth.set(args.type, i, udoc._id)));
            await successfulAuth.call(this, udoc);
            this.response.redirect = this.session.oauthRedirect || this.url('homepage');
            delete this.session.oauthRedirect;
            return;
        }
        if (!provider.canRegister) throw new ForbiddenError('No bound account found');
        this.checkPriv(PRIV.PRIV_REGISTER_USER);
        let username = '';
        r.uname ||= [];
        const mailDomain = r.email.split('@')[1];
        if (await BlackListModel.get(`mail::${mailDomain}`)) throw new BlacklistedError(mailDomain);
        for (const uname of r.uname) {
            // eslint-disable-next-line no-await-in-loop
            const nudoc = await user.getByUname('system', uname);
            if (!nudoc) {
                username = uname;
                break;
            }
        }
        const set: Partial<Udoc> = { ...r.set };
        if (r.bio) set.bio = r.bio;
        if (r.viewLang) set.viewLang = r.viewLang;
        if (r.avatar) set.avatar = r.avatar;
        const [t] = await token.add(
            token.TYPE_REGISTRATION,
            system.get('session.unsaved_expire_seconds'),
            {
                mail: r.email,
                username,
                redirect: this.domain.registerRedirect,
                set,
                setInDomain: r.setInDomain,
                identity: {
                    provider: args.type,
                    platform: args.type,
                    id: r._id,
                },
            },
        );
        this.response.redirect = this.url('user_register_with_code', { code: t });
    }
}

class ContestModeHandler extends Handler {
    async get() {
        const bindings = await user.getMulti({ loginip: { $exists: true } })
            .project<{ _id: number, loginip: string }>({ _id: 1, loginip: 1 }).toArray();
        this.response.body = { bindings };
        this.response.template = 'contest_mode.html';
    }

    @param('uid', Types.Int, true)
    async postReset(domainId: string, uid: number) {
        if (uid) await user.setById(uid, {}, { loginip: '' });
        else {
            await user.coll.updateMany({}, { $unset: { loginip: 1 } });
            deleteUserCache(true);
        }
    }
}

export const inject = ['oauth'];

const UserApi = {
    user: Query(Schema.object({
        id: Schema.number().step(1),
        uname: Schema.string(),
        mail: Schema.string(),
        domainId: Schema.string().required(),
    }), (c, arg) => {
        if (arg.id) return user.getById(arg.domainId, arg.id);
        if (arg.mail) return user.getByEmail(arg.domainId, arg.mail);
        if (arg.uname) return user.getByUname(arg.domainId, arg.uname);
        return user.getById(arg.domainId, c.user._id);
    }),
    users: Query(Schema.object({
        ids: Schema.array(Schema.number().step(1)),
        auto: Schema.array(Schema.string()),
        search: Schema.string(),
        limit: Schema.number().step(1),
        exact: Schema.boolean(),
    }), async (c, arg) => {
        const auto = (arg.ids?.length && arg.ids) || arg.auto || [];
        if (auto.length) {
            const maybeId = auto.filter((i) => !Number.isNaN(+i));
            const result = [];
            if (maybeId.length) {
                const udocs = await user.getList(arg.domainId, maybeId.map((i) => +i));
                for (const i in udocs) udocs[i].avatarUrl = avatar(udocs[i].avatar);
                result.push(...Object.values(udocs));
            }
            const notFound = auto.filter((i) => !result.find((j) => j._id === +i));
            if (notFound.length > 50) return result; // reject if too many
            for (const i of notFound) {
                // eslint-disable-next-line no-await-in-loop
                const udoc = await user.getByUname(arg.domainId, i.toString()) || await user.getByEmail(arg.domainId, i.toString());
                if (udoc) result.push(udoc);
            }
            return result;
        }
        if (!arg.search) return [];
        const udoc = await user.getById(arg.domainId, +arg.search)
            || await user.getByUname(arg.domainId, arg.search)
            || await user.getByEmail(arg.domainId, arg.search);
        const udocs: User[] = arg.exact
            ? []
            : await user.getPrefixList(arg.domainId, arg.search, Math.min(arg.limit || 10, 10));
        if (udoc && !udocs.find((i) => i._id === udoc._id)) {
            udocs.pop();
            udocs.unshift(udoc);
        }
        for (const i in udocs) {
            udocs[i].avatarUrl = avatar(udocs[i].avatar);
        }
        return udocs;
    }),
} as const;

declare module '@hydrooj/framework' {
    interface Apis {
        user: typeof UserApi;
    }
}

export async function apply(ctx: Context) {
    ctx.Route('user_login', '/login', UserLoginHandler);
    ctx.Route('captcha', '/captcha.svg', CaptchaHandler);
    ctx.Route('user_oauth', '/oauth/:type/login', OauthHandler);
    ctx.Route('user_sudo', '/user/sudo', UserSudoHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_tfa', '/user/tfa', UserTFAHandler);
    ctx.Route('user_webauthn', '/user/webauthn', UserWebauthnHandler);
    ctx.Route('user_oauth_callback', '/oauth/:type/callback', OauthCallbackHandler);
    ctx.Route('user_register', '/register', UserRegisterHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('user_register_with_code', '/register/:code', UserRegisterWithCodeHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('user_logout', '/logout', UserLogoutHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_lostpass', '/lostpass', UserLostPassHandler);
    ctx.Route('user_lostpass_with_code', '/lostpass/:code', UserLostPassWithCodeHandler);
    ctx.Route('user_delete', '/user/delete', UserDeleteHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('user_detail', '/user/:uid', UserDetailHandler);
    if (system.get('server.contestmode')) {
        ctx.Route('contest_mode', '/contestmode', ContestModeHandler, PRIV.PRIV_EDIT_SYSTEM);
    }
    ctx.oauth.provide('mail', {
        text: 'Mail',
        name: 'mail',
        hidden: true,
        async get() {
            throw new NotFoundError();
        },
        async callback() {
            throw new NotFoundError();
        },
    });
    await ctx.inject(['api'], ({ api }) => {
        api.provide(UserApi);
    });
}
