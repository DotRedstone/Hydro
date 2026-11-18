import $ from 'jquery';

// 验证码图片是现场生成的，点“换一张”只是换掉图片地址，
// 服务端每次 GET 都会写入新的答案并作废旧答案。
function refreshCaptcha(image: HTMLImageElement) {
    const base = image.getAttribute('src').split('?')[0];
    image.setAttribute('src', `${base}?t=${Date.now()}`);
}

$(document).on('click', '[data-captcha-refresh]', (ev) => {
    ev.preventDefault();
    const figure = $(ev.currentTarget).closest('.login-captcha');
    const image = figure.find('img.login-captcha__image').get(0) as HTMLImageElement;
    if (image) refreshCaptcha(image);
});
