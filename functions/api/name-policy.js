import OpenCC from 'opencc-js';

const toTaiwanTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

const CONTACT_OR_SCAM = /https?|www|\.com|\.net|\.org|\.tw|\.io|@|line\s*id|line|加\s*(?:賴|line|微信|好友)|賴\s*id|微信|wechat|telegram|私訊|聯絡|客服|群組|投資|股票群|虛擬幣|加密幣|保證獲利|穩賺|高報酬|貸款|借款|代儲|代購|買幣|賣帳|免費領|送點數|領點數|抽獎|領獎/i;
const NEGATIVE = /笨蛋|白癡|白痴|智障|弱智|廢物|廢咖|垃圾|腦殘|有病|去死|滾蛋|可悲|噁心|低能|沒用|醜八怪|王八蛋|媽的|三小|靠北|靠邀|哭夭|幹你|操你|肏|fuck|shit|bitch|asshole|idiot|stupid|retard/i;
const HOMOPHONE = /(?:^|[^0-9])87(?:[^0-9]|$)|北七|白七|趕羚羊|草泥馬|淦|贛你|幹林|幹拎|ㄍㄋ|ㄎㄅ|g8|3小/i;
const SENSITIVE = /色情|情色|做愛|約炮|援交|裸聊|毒品|吸毒|大麻|賭博|博弈|賭場|下注|殺人|自殺|槍枝|霸凌|恐攻|納粹|黑幫/i;
const SAFE_CHARS = /^[\p{Script=Han}\p{Script=Latin}\p{N} ·・_-]+$/u;
const HAS_WORD = /[\p{Script=Han}\p{Script=Latin}]/u;

export function reviewEducationName(input, options = {}) {
  const max = Number.isInteger(options.max) ? options.max : 12;
  if (typeof input !== 'string') return { ok: false, reason: 'format', error: '名稱格式不正確' };
  const name = input.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, reason: 'format', error: '名稱不可空白' };

  // 簡體優先回報，讓學生知道要改用臺灣正體字，而不是只收到籠統的內容不當。
  if (toTaiwanTraditional(name) !== name)
    return { ok: false, reason: 'simplified', error: '名稱請使用繁體中文，不可使用簡體字' };
  if (CONTACT_OR_SCAM.test(name))
    return { ok: false, reason: 'scam', error: '名稱不可包含網址、聯絡方式、廣告或疑似詐騙內容' };
  if (SENSITIVE.test(name))
    return { ok: false, reason: 'sensitive', error: '名稱含不適合教育場域的敏感內容' };
  if (HOMOPHONE.test(name))
    return { ok: false, reason: 'homophone', error: '名稱不可使用不雅諧音或變形字' };
  if (NEGATIVE.test(name))
    return { ok: false, reason: 'negative', error: '名稱不可包含負面、辱罵或攻擊性詞彙' };

  const length = [...name].length;
  if (length < 1 || length > max)
    return { ok: false, reason: 'format', error: `名稱須為 1–${max} 字` };
  if (!SAFE_CHARS.test(name) || !HAS_WORD.test(name) || /([\p{L}\p{N}])\1{4,}/u.test(name))
    return { ok: false, reason: 'format', error: '名稱只能使用繁體中文、英文字母、數字與簡單分隔符號' };

  return { ok: true, name };
}

export const isEducationSafeName = (input, options) => reviewEducationName(input, options).ok;
