export default function reducer(state = {
  // 与服务端一致的默认语言（上次用过的 / 站点默认 / 常见语言），不是注册顺序里的 bash
  lang: UiContext.defaultLang || UiContext.codeLang,
  code: UiContext.codeTemplate,
}, action: any = {}) {
  if (action.type === 'SCRATCHPAD_EDITOR_HYDRATE') return action.payload;
  if (action.type === 'SCRATCHPAD_EDITOR_UPDATE_CODE') return { ...state, code: action.payload };
  if (action.type === 'SCRATCHPAD_EDITOR_SET_LANG') return { ...state, lang: action.payload };
  return state;
}
