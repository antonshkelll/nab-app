/* =========================================================================
   «Спроси ССт НАБ» — Telegram Mini App, v2
   ─ Навигация: собственный стек экранов (history не используется для
     переходов — так «назад» работает внутри Telegram всегда).
   ─ Анимации: только transform / opacity / clip-path, всё на rAF.
   ─ API тот же, что в v1: /api/report, /api/doc, /api/faq.
   ========================================================================= */
(() => {
  'use strict';

  const API = (window.API_BASE || '').replace(/\/$/, '');
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  const initData = tg ? tg.initData : '';
  const inTelegram = Boolean(initData);
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const view = $('#view');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------------- Telegram ---------------- */

  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.disableVerticalSwipes(); } catch (e) {}
    try { tg.setHeaderColor('#112622'); tg.setBackgroundColor('#112622'); } catch (e) {}
    try { tg.setBottomBarColor('#112622'); } catch (e) {}
    tg.BackButton.onClick(() => goBack());
  }

  const haptic = (t = 'light') => {
    if (!tg || !tg.HapticFeedback) return;
    try {
      if (t === 'success' || t === 'error' || t === 'warning') tg.HapticFeedback.notificationOccurred(t);
      else if (t === 'select') tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred(t);
    } catch (e) {}
  };

  /* ---------------- Мелочи ---------------- */

  let toastTimer = null;
  function toast(text, kind = 'ok') {
    const el = $('#toast');
    el.textContent = text;
    el.dataset.kind = kind;
    el.dataset.show = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.dataset.show = '0'; }, 4200);
  }

  function openLink(url) {
    if (tg && /^https?:\/\/t\.me\//.test(url)) return tg.openTelegramLink(url);
    if (tg) return tg.openLink(url);
    window.open(url, '_blank', 'noopener');
  }

  async function api(path, body, isForm = false) {
    let res;
    try {
      const headers = { 'X-Init-Data': initData };
      if (!isForm) headers['Content-Type'] = 'application/json';
      res = await fetch(`${API}/api${path}`, { method: 'POST', headers, body: isForm ? body : JSON.stringify(body || {}) });
    } catch (e) {
      throw new Error('Нет связи с сервером. Проверь интернет и попробуй ещё раз.');
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data.ok) {
      const err = new Error(data.error || 'Сервер недоступен. Попробуй позже.');
      err.code = data.code;
      err.detail = data.detail;
      err.bot_username = data.bot_username;
      throw err;
    }
    return data;
  }

  function showApiError(e) {
    haptic('error');
    if (e.code === 'bad_hash') {
      const who = e.bot_username ? '@' + e.bot_username : 'другого бота';
      toast(`Приложение открыто не у того бота. Сервер настроен на ${who} — откройте приложение у него`, 'err');
    } else if (e.code === 'expired') {
      toast('Сессия устарела — закрой приложение и открой заново', 'err');
    } else if (e.code === 'empty') {
      toast('Открой приложение кнопкой у бота, а не ссылкой в браузере', 'err');
    } else {
      toast(e.message, 'err');
    }
  }

  function requireTelegram() {
    if (inTelegram) return true;
    haptic('error');
    toast('Открой приложение внутри Telegram — у бота @sprosinab_bot', 'err');
    return false;
  }

  $('#topDate').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
    .format(new Date()).toUpperCase();

  /* ---------------- Контент ---------------- */

  const NPB = [
    ['1', 'Устав Финансового университета', 'Главный документ вуза'],
    ['2', 'Правила внутреннего распорядка обучающихся', 'Права, обязанности, дисциплина'],
    ['3', 'Положение о проведении текущего контроля', 'Зачёты, экзамены, пересдачи'],
    ['4', 'Правила внутреннего распорядка студенческого общежития', 'Проживание и порядок'],
    ['5', 'О порядке перехода обучающихся на бесплатное обучение', 'Перевод на бюджет'],
    ['6', 'Положение о курсовой работе', 'Требования и сроки'],
    ['7', 'Положение о старосте учебной группы', 'Роль и полномочия'],
    ['8', 'Положение о порядке предоставления скидок', 'Скидки на обучение'],
    ['9', 'Положение о Студенческом совете', 'Как устроен ССт'],
  ];

  const GROUPS = [
    { t: 'ТГК NAB LABEL', k: 'Telegram · главный', s: 'Официальный канал Студсовета НАБ', u: 'https://t.me/NABLABFU' },
    { t: 'ТГК Финунивер | НАБ', k: 'Telegram · факультет', s: 'Новости и объявления факультета', u: 'https://t.me/magfnab' },
    { t: 'ВК НАБ | Налоги, аудит', k: 'ВКонтакте', s: 'Сообщество факультета', u: 'https://vk.ru/taxaudit' },
    { t: 'ВК Финунивер | НАБ', k: 'ВКонтакте · официально', s: 'Официальная группа ВКонтакте', u: 'https://vk.ru/timetotaxesfa' },
  ];

  const PEOPLE = [
    { ini: 'АЗ', role: 'Председатель Студенческого совета', name: 'Алина Зотова', tel: '+7 (937) 666-11-84', tg: 'jannalli', note: 'пиши — ответит' },
    { ini: 'ММ', role: 'Заместитель председателя по учебно-социальной деятельности', name: 'Мусо Мирзоев', tel: '+7 (912) 029-37-35', tg: 'YotaHiro2', note: 'учёба и соцвопросы' },
  ];

  // Число страниц и разделы FAQ приходят из assets/faq/manifest.json (его пишет tools/build_faq.sh).
  // Значения ниже — запасные, на случай если файла нет.
  let FAQ_PAGES = 27;
  let FAQ_RATIO = 1080 / 1980;
  let FAQ_CHAPTERS = [
    { t: 'Навигация', from: 2 },
    { t: 'Учёба и учебный процесс', from: 3 },
    { t: 'Преподаватели', from: 8 },
    { t: 'Группа и староста', from: 10 },
    { t: 'Университет и корпуса', from: 12 },
    { t: 'Общежитие', from: 14 },
    { t: 'Личный кабинет и цифровые сервисы', from: 18 },
    { t: 'Документы', from: 20 },
    { t: 'Стипендия и материальная помощь', from: 22 },
    { t: 'ССт и студенческие организации', from: 24 },
    { t: 'Остались вопросы?', from: 27 },
  ];
  fetch('assets/faq/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (!m || !m.pages) return;
      const changed = m.pages !== FAQ_PAGES;
      FAQ_PAGES = m.pages;
      if (m.ratio) FAQ_RATIO = m.ratio;
      if (Array.isArray(m.chapters) && m.chapters.length) FAQ_CHAPTERS = m.chapters;
      if (changed && current().name === 'faq') paint();
    })
    .catch(() => {});

  const FORMS = {
    question: { title: 'Вопрос', acc: 'руководству', script: 'спроси — ответим', rail: 'Вопросы',
      lead: 'Задай любой вопрос руководству ССт НАБ — ответ придёт прямо в чат с ботом.',
      ph: 'Например: как перевестись на бюджет и куда нести документы?', photos: false, place: false, btn: 'Отправить вопрос' },
    initiative: { title: 'Твоя', acc: 'инициатива', script: 'идеи меняют НАБ', rail: 'Инициатива',
      lead: 'Есть идея, как сделать жизнь в университете лучше? Расскажи — разберём на ближайшем собрании.',
      ph: 'Опиши свою идею или запрос…', photos: false, place: false, btn: 'Отправить идею' },
    repair: { title: 'Что-то', acc: 'сломалось?', script: 'сфоткай — починим', rail: 'Поломки',
      lead: 'Розетка, дверь, батарея, проектор? Пришли фото и место — передадим начальнику корпуса.',
      ph: 'Что именно сломалось?', photos: true, place: true, btn: 'Отправить обращение' },
    panic: { title: 'Тревожная', acc: 'кнопка', script: 'мы рядом', rail: 'Тревожная кнопка',
      lead: 'Если тебя что-то серьёзно беспокоит — ситуация с преподавателем, в корпусе, конфликт — напиши нам.',
      ph: 'Опиши ситуацию как можно подробнее…', photos: false, place: false, btn: 'Отправить сигнал' },
  };

  const MENU = [
    ['home', 'Главная'], ['search', 'Поиск'], ['my', 'Мои обращения'], ['events', 'Анонсы'], ['npb', 'НПБ'], ['faq', 'FAQ'],
    ['form:question', 'Вопросы'], ['form:initiative', 'Инициатива'], ['form:repair', 'Поломки'],
    ['form:panic', 'Тревожная кнопка', 'is-sos'], ['map', 'Карта корпуса'], ['polls', 'Опросы'],
    ['groups', 'Важные группы'], ['contacts', 'Контакты'], ['family', 'Больше, чем семья'],
  ];

  const TITLES = { npb: 'Нормативно-правовая база', faq: 'FAQ', doc: 'Документ', groups: 'Важные группы',
    contacts: 'Наши контакты', ok: 'Готово', map: 'Карта корпуса', search: 'Поиск', my: 'Мои обращения',
    events: 'Анонсы', polls: 'Опросы', news: 'Новости', admin: 'Пульт' };
  TITLES.my = 'Обращения';

  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  const faqSrc = (n) => `assets/faq/${pad2(n)}.webp`;
  const faqThumb = (n) => `assets/faq/thumb/${pad2(n)}.webp`;
  const docSrc = (slug, n) => `assets/docs/${slug}/${pad3(n)}.webp`;
  const docThumb = (slug, n) => `assets/docs/${slug}/thumb/${pad3(n)}.webp`;

  // страницы НПБ появляются после tools/build_docs.py
  let DOCS = {};
  fetch('assets/docs/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (!m || !m.docs) return;
      m.docs.forEach((d) => { DOCS[d.id] = d; });
      const n = current().name;
      if ((n === 'npb' || n === 'doc') && !busy) { remember(); paint(); }
    })
    .catch(() => {});

  /* ---------------- Иконки и фирменные элементы ---------------- */

  const svg = (d, w = 22) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    arr: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 16),
    back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>', 15),
    up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 16),
    doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    book: svg('<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/>'),
    mega: svg('<path d="M3 10v4h4l6 4V6l-6 4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>'),
    phone: svg('<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    ask: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01"/>'),
    bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
    tool: svg('<path d="M15 4a5 5 0 0 0-4.6 6.9L4 17.3V20h2.7l6.4-6.4A5 5 0 0 0 20 9l-3 1-2-2 1-3z"/>'),
    sos: svg('<path d="M12 3v2M5 7l1.5 1.5M19 7l-1.5 1.5M6 20h12M8 20v-6a4 4 0 0 1 8 0v6"/>'),
    tg: svg('<path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="m9 13 8-6"/>', 17),
    cam: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 26),
    pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 18),
    minus: svg('<path d="M5 12h14"/>', 18),
    fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 18),
    heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  };
  const SPARK = 'M12 0 L14.3 9.7 L24 12 L14.3 14.3 L12 24 L9.7 14.3 L0 12 L9.7 9.7 Z';
  const spark = (cls = '', style = '') => `<svg class="spark ${cls}" style="${style}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPARK}"/></svg>`;
  const clip = (cls = '') => `<svg class="clip ${cls}" viewBox="0 0 52 46" aria-hidden="true">
      <path d="M15 22 18.5 5Q19.3 1.8 22.6 1.8h6.8q3.3 0 4.1 3.2L37 22" fill="none" stroke="#9fb3a3" stroke-width="3"/>
      <path d="M5 19h42l-4 21q-.8 4-4.8 4H13.8q-4 0-4.8-4z" fill="#020F02"/>
      <path d="M9 23h34" stroke="#3a4a3c" stroke-width="2"/></svg>`;
  const logo = (cls = '', halo = true) => `<span class="logo ${cls}"><i class="logo__nab"></i>${halo ? '<span class="logo__halo"><b class="logo__label"></b></span>' : ''}</span>`;
  const swirl = (style, len = 900) => `<svg class="swirl" style="${style};--len:${len}" viewBox="0 0 260 180" aria-hidden="true">
      <path d="M8 160C40 70 120 30 128 92c5 40-52 52-50 16 2-38 70-60 104-30 26 23 10 60-16 52-22-7-6-40 30-44 30-3 52 18 56 44"/></svg>`;

  // разбивка на слова/буквы для «поднимающихся» заголовков
  function splitText(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = '1';
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            Array.from(part).forEach((c) => {
              const s = document.createElement('span');
              s.className = 'ch';
              s.style.setProperty('--i', i++);
              s.textContent = c;
              w.appendChild(s);
            });
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR' && !child.classList.contains('noSplit')) {
          walk(child);
        }
      });
    };
    walk(el);
  }

  /* ---------------- Наклейки ---------------- */

  function sticker(o, i) {
    return `<div class="stk-wrap ${o.wide ? 'stk-wrap--wide' : ''}" style="--i:${i};--r:${o.r}deg">
      <div class="stk-wob"${o.go === 'form:panic' ? ' data-anim' : ''}><button type="button" class="stk ${o.cls || ''}" data-go="${o.go}" ${o.tour ? `data-tour="${o.tour}"` : ''}>
        <span class="stk__top"><span class="stk__num">${o.n}</span><span class="stk__ico">${I[o.ic]}</span></span>
        <span class="stk__body"><span class="stk__t">${o.t}</span><span class="stk__h">${o.h}</span></span>
        ${o.img ? `<span class="stk__img" style="background-image:url(${o.img})"></span>` : ''}
        <span class="stk__arr">${I.arr}</span>
      </button></div></div>`;
  }

  const STICKERS = [
    { n: '01', go: 'form:question', ic: 'ask', t: 'Задать вопрос', h: 'руководству ССт — ответ придёт в чат', r: -1.5, wide: true, cls: 'stk--big', tour: 'question' },
    { n: '02', go: 'npb', ic: 'doc', t: 'НПБ', h: 'документы вуза', r: 2 },
    { n: '03', go: 'faq', ic: 'book', t: 'FAQ', h: 'ответы на всё', r: -2.2 },
    { n: '04', go: 'form:initiative', ic: 'bulb', t: 'Инициа&shy;тива', h: 'предложи идею', r: 1.2 },
    { n: '05', go: 'groups', ic: 'mega', t: 'Важные группы', h: 'каналы и паблики', r: -1 },
    { n: '06', go: 'contacts', ic: 'phone', t: 'Наши контакты', h: 'председатель и зам', r: 1.8 },
    { n: '07', go: 'form:repair', ic: 'tool', t: 'Поломки', h: 'фото → начальнику корпуса', r: -1.6, cls: 'stk--mint', tour: 'repair' },
    { n: '08', go: 'map', ic: 'pin', t: 'Карта корпуса', h: 'найди аудиторию за секунду', r: -1.2, wide: true, cls: 'stk--wide stk--map', img: 'assets/map/cover.webp' },
    { n: '09', go: 'form:panic', ic: 'sos', t: 'Тревожная кнопка', h: 'если срочно и серьёзно — жми', r: 1, wide: true, cls: 'stk--wine stk--wide stk--sos', tour: 'sos' },
  ];

  /* ---------------- Квест «Шаг 1 из 3» ----------------
     Шаги засчитываются, когда человек реально открывает раздел.
     Прогресс хранится в браузере Telegram на этом устройстве. */

  const QUEST = [
    { id: 'faq', t: 'загляни в FAQ', go: 'faq' },
    { id: 'npb', t: 'открой НПБ', go: 'npb' },
    { id: 'groups', t: 'подпишись на каналы', go: 'groups' },
  ];
  const questGet = () => { try { return JSON.parse(store.get('nab_quest') || '{}') || {}; } catch (e) { return {}; } };
  const questDone = () => QUEST.filter((q) => questGet()[q.id]).length;
  function questMark(id) {
    if (!QUEST.some((q) => q.id === id)) return;
    const st = questGet();
    if (st[id]) return;
    st[id] = Date.now();
    store.set('nab_quest', JSON.stringify(st));
  }
  function questHTML() {
    const st = questGet();
    const done = QUEST.filter((q) => st[q.id]).length;
    const bars = QUEST.map((q) => `<i class="${st[q.id] ? 'on' : ''}"></i>`).join('');
    if (done >= QUEST.length) {
      return `<span class="stage__bars">${bars}</span>
        <span class="stage__txt"><b>3 из 3 — ты в теме!</b> Все разделы открыты ✦</span>
        <span class="stage__go stage__go--done" aria-hidden="true">✓</span>`;
    }
    const next = QUEST.find((q) => !st[q.id]);
    return `<span class="stage__bars">${bars}</span>
      <span class="stage__txt">Шаг ${done + 1} из ${QUEST.length} · ${next.t}</span>
      <button type="button" class="stage__go" data-go="${next.go}" aria-label="${next.t}">${I.arr}</button>`;
  }

  /* ---------------- Экраны ---------------- */

  const S = {};

  S.home = () => {
    const mqWords = ['НПБ', 'FAQ', 'Карта корпуса', 'Вопросы', 'Инициативы', 'Поломки', 'Мы одна семья', 'Мы команда'];
    const mqChant = ['Они были теми,', 'в ком вечно нуждались', 'Налоги, Аудит', 'и Бизнес-анализ'];
    const mq = (cls, words = mqWords) => {
      // фраза повторяется дважды внутри половины ленты — так без пустот на любой ширине экрана
      const one = [...words, ...words].map((w, i) => `<span class="${i % 2 ? 'o' : ''}">${w}</span><i class="ast"></i>`).join('');
      return `<div class="mq ${cls}" data-anim><div class="mq__skew"><div class="mq__track"><div class="mq__item">${one}</div><div class="mq__item">${one}</div></div></div></div>`;
    };

    const manifesto = 'Почему стоит пойти в ССт? Многие из нас задавались этим вопросом перед анкетой — и сомневались. А в итоге получили море эмоций, смеха и незабываемых моментов, опыт настоящих проектов, кучу новых знакомств и самое главное — *людей.* ССт — это место, которое навсегда запомнится счастливыми годами студенчества. Место, где можно учиться на ошибках и бесконечно пробовать новое. Место, где тебя *слышат,* и ты знаешь: с любой проблемой можно прийти к своим. Попробовать не страшно — страшно упустить свою возможность. Потому что это *семья.*';
    let acc = false, wi = 0;
    const mfHtml = manifesto.split(/\s+/).map((w) => {
      const start = w.startsWith('*');
      if (start) acc = true;
      const clean = w.replace(/\*/g, '');
      const html = `<span class="mf__w${acc ? ' acc' : ''}" style="--w:${wi++}">${esc(clean)}</span>`;
      if (w.endsWith('*') || (w.includes('*') && !start)) acc = false;
      if (start && w.slice(1).includes('*')) acc = false;
      return html;
    }).join(' ');

    return `
    <section class="hero" id="hero">
      <div class="hero__grid"></div>
      <div class="hero__bgphoto" id="heroPhoto"></div>
      <div class="hero__ast" id="heroAst" data-anim><i class="ast"></i></div>
      <div class="hero__row rv">
        <span class="kicker">${spark('', '--s:11px')} @sprosinab_bot</span>
        <span class="hero__chips" id="heroChips">${heroChips()}</span>
      </div>
      <h1 class="disp hero__title split-mask" data-split>Спроси<br><span class="line2">ССт НАБ</span></h1>
      <div class="hero__script rv" style="--d:.5s">
        <span class="scr hl">Здесь можно:</span>
        <i class="brush hero__brush"></i>
      </div>
      <p class="lead hero__lead rv" style="--d:.65s">Документы, FAQ, вопросы руководству, идеи и сообщения о поломках — всё в одном окне, прямо в Telegram.</p>
      <button type="button" class="hsearch rv" style="--d:.72s" data-go="search">
        <span class="hsearch__ico">${I.search}</span><span class="hsearch__ph">Найти: стипендия, пересдача, 412…</span><span class="hsearch__k">поиск</span>
      </button>
      <div class="hero__cta rv" style="--d:.8s">
        <button type="button" class="btn btn--wine btn--block" data-go="form:question"><span class="btn__txt">Задать вопрос</span> <span class="arr">${I.arr}</span></button>
        <div class="scroll-hint"><i></i> листай вниз — там много всего</div>
      </div>
    </section>

    <section class="sec sec--night sec--dots" id="board">
      <div class="sec__head">
        <span class="kicker kicker--ghost rv">Разделы бота</span>
        <h2 class="disp sec__title split-mask" data-split style="margin-top:12px">Чем помочь?</h2>
      </div>
      <div class="board" id="stkBoard">${STICKERS.map(sticker).join('')}</div>
      ${inTelegram ? '' : `<div class="note rv"><span>⚠️</span><span>Это веб-версия. Чтобы отправлять обращения и получать документы, открой приложение внутри Telegram — у бота <b>@sprosinab_bot</b>.</span></div>`}
    </section>

    ${mq('')}
    ${mq('mq--wine', mqChant)}

    <section class="sec sec--night live" id="homeLive" hidden></section>

    <section class="sec sec--night">
      <div class="sec__head">
        <span class="kicker rv">${spark('', '--s:10px')} Главное</span>
        <h2 class="disp sec__title split-mask" data-split style="margin-top:12px">Что нового</h2>
      </div>
      <div class="fcards">
        <div class="fcards" id="homeNews"></div>
        <article class="fcard rv">
          <div class="fcard__photo"><img src="assets/brand/dance.webp" alt="Команда Студсовета НАБ танцует у корпуса" loading="lazy" decoding="async"></div>
          <div class="fcard__pills"><span class="kicker kicker--ink">Главное</span>${spark('spark--tw', '--s:18px')}</div>
          <h3 class="disp fcard__title">Бот стал <em>приложе&shy;нием</em></h3>
          <p class="fcard__text">Документы, FAQ, вопросы руководству и заявки о поломках — теперь в одном красивом окне, прямо в Telegram.</p>
          <div class="chips">
            <button type="button" class="chip" data-go="npb">НПБ <b>+</b></button>
            <button type="button" class="chip" data-go="faq">FAQ <b>+</b></button>
            <button type="button" class="chip" data-go="form:repair">Поломки <b>+</b></button>
            <button type="button" class="chip" data-go="contacts">Контакты <b>+</b></button>
            <button type="button" class="chip" data-go="map">Карта корпуса <b>+</b></button>
          </div>
          <div class="stage" id="quest">${questHTML()}</div>
        </article>

        <article class="fcard fcard--mint rv">
          <div class="fcard__pills"><span class="kicker kicker--wine">${FAQ_PAGES} страниц</span>${spark('spark--tw', '--s:16px;--d:-1s')}</div>
          <h3 class="disp fcard__title">Ответы на <em>всё</em></h3>
          <p class="fcard__text">Сессия, пересдачи, общежитие, стипендия, личный кабинет — собрали самые частые вопросы в одну листалку.</p>
          <div class="fan">
            <img src="${faqThumb(1)}" alt="" style="--i:0;--x:-70px;--r:-12deg" loading="lazy" decoding="async">
            <img src="${faqThumb(14)}" alt="" style="--i:2;--x:70px;--r:11deg" loading="lazy" decoding="async">
            <img src="${faqThumb(3)}" alt="" style="--i:1;--x:0px;--r:-1deg" loading="lazy" decoding="async">
          </div>
          <button type="button" class="btn btn--block" data-go="faq"><span class="btn__txt">Листать FAQ</span> <span class="arr">${I.arr}</span></button>
        </article>

        <article class="fcard fcard--sand rv">
          <div class="fcard__pills"><span class="kicker kicker--wine">Сломалось?</span>${spark('spark--tw', '--s:16px;--d:-.5s')}</div>
          <h3 class="disp fcard__title">Сфоткай — <em>починим</em></h3>
          <p class="fcard__text">Розетка, дверь, батарея, проектор. Пришли фото и место — передадим начальнику корпуса. Можно до 5 фото.</p>
          <div class="gap"></div>
          <button type="button" class="btn btn--wine btn--block" data-go="form:repair"><span class="btn__txt">Сообщить о поломке</span> <span class="arr">${I.arr}</span></button>
        </article>
      </div>
    </section>

    <section class="sec sec--pine sec--stack">
      ${swirl('right:-60px;top:10px;width:260px;transform:scaleX(-1)')}
      <div class="sec__head">
        <span class="kicker kicker--ghost rv">Как это работает</span>
        <h2 class="disp sec__title split-mask" data-split style="margin-top:12px">Три шага</h2>
        <span class="scr sec__sub rv" style="--d:.3s">и готово</span>
      </div>
      <div class="stack" id="stack">
        <article class="note-card" style="--i:0">${clip()}<span class="note-card__n">01</span>
          <h3 class="disp note-card__t">Выбери раздел</h3>
          <p>Вопрос, инициатива, поломка или тревожная кнопка — жми на нужную наклейку.</p><span class="scr">это просто</span></article>
        <article class="note-card note-card--mint" style="--i:1">${clip()}<span class="note-card__n">02</span>
          <h3 class="disp note-card__t">Напиши пару строк</h3>
          <p>Можно приложить фото и отправить анонимно — тогда твой профиль никто не увидит.</p><span class="scr">без стеснения</span></article>
        <article class="note-card note-card--sand" style="--i:2">${clip()}<span class="note-card__n">03</span>
          <h3 class="disp note-card__t">Мы берём в работу</h3>
          <p>Обращение сразу попадает к руководству ССт НАБ. На вопросы ответим прямо в чат с ботом.</p><span class="scr">мы рядом</span></article>
      </div>
    </section>

    <section class="fam" id="family">
      <div class="fam__card rv">
        <img src="assets/brand/stage.webp" alt="Студенческий совет НАБ на сцене" loading="lazy" decoding="async">
        <div class="fam__shade"></div>
        <span class="fam__lbl">ССт НАБ · Финансовый университет</span>
        <div class="fam__ast"><i class="ast"></i></div>
        <div class="fam__text">
          <span class="kicker">${I.heart.replace('width="22" height="22"', 'width="12" height="12"')} наша команда</span>
          <h2 class="disp fam__title">Студенческий совет НАБ —</h2>
          <span class="scr fam__script">больше, чем семья</span>
        </div>
      </div>
    </section>

    <section class="manifesto" id="manifesto">
      ${swirl('left:-70px;bottom:40px;width:280px;opacity:.6', 1000)}
      <div class="manifesto__lbl rv"><span class="kicker kicker--wine">Манифест</span>${spark('spark--tw', '--s:14px;color:var(--mint)')}</div>
      <p class="mf" id="mf">${mfHtml}</p>
      <div class="scr mf-sign rv">Добро пожаловать домой.</div>

      <div class="pins">
        <div class="pin rv-pop" style="--r:-4deg;--d:0s">${clip()}<div class="pin__t">Мы одна семья</div><span class="scr">с первого дня</span></div>
        <div class="pin pin--mint rv-pop" style="--r:3deg;--d:.12s">${clip()}<div class="pin__t">Каждый голос важен</div><span class="scr">даже анонимный</span></div>
        <div class="pin pin--sand rv-pop" style="--r:-1.5deg;--d:.24s">${clip()}<div class="pin__t">Мы команда</div><span class="scr">и это навсегда</span></div>
      </div>

      <div class="polaroid rv">
        <i class="tape"></i>
        <img src="assets/brand/selfie.webp" alt="Команда ССт НАБ за кулисами" loading="lazy" decoding="async">
        <span class="scr">за кулисами ♡</span>
      </div>
      <div class="gap"></div><div class="gap"></div>
      <button type="button" class="btn btn--block rv" data-link="https://t.me/NABLABFU"><span class="btn__txt">Стать частью семьи</span> <span class="arr">${I.arr}</span></button>
    </section>

    <section class="chant" id="chant">
      <div class="chant__photo">
        <img class="bw" src="assets/brand/scene-bw.webp" alt="" loading="lazy" decoding="async">
        <img class="col" src="assets/brand/scene.webp" alt="Студсовет НАБ на сцене" loading="lazy" decoding="async">
      </div>
      <div class="chant__in">
        <span class="kicker kicker--wine rv">${I.mega.replace('width="22" height="22"', 'width="13" height="13"')} Кричалка ССт НАБ</span>
        <p class="disp chant__l split-mask" data-split>Они были теми,</p>
        <p class="disp chant__l split-mask" data-split style="--d0:260ms">в ком вечно нуждались —</p>
        <p class="chant__nab"><span class="cw"><b style="--n:0">Н</b>алоги,</span> <span class="cw"><b style="--n:1">А</b>удит</span> <span class="cw">и&nbsp;<b style="--n:2">Б</b>изнес-анализ</span></p>
        <div class="chant__stamp" aria-hidden="true">НАБ!</div>
      </div>
    </section>

    <section class="sec sec--night gallery-sec">
      <div class="sec__head">
        <span class="kicker kicker--ghost rv">Наши моменты</span>
        <h2 class="disp sec__title split-mask" data-split style="margin-top:12px">Это мы</h2>
        <span class="scr sec__sub rv" style="--d:.3s">листай →</span>
      </div>
      <div class="gallery" id="gallery">
        ${[['stage', 'НАБ, вперёд!'], ['scene', 'наша сцена'], ['dance', 'в одном ритме'], ['selfie', 'за кулисами'], ['people', 'вся семья']]
          .map(([f, c], i) => `<figure class="gph${f === 'scene' ? ' gph--tall' : ''}" style="--r:${[-3, 2.5, -2, 3, -1.5][i]}deg">${i % 2 ? '' : '<i class="tape"></i>'}<img src="assets/brand/${f}.webp" alt="" loading="lazy" decoding="async"><figcaption class="scr">${c}</figcaption></figure>`).join('')}
      </div>
    </section>

    <section class="sec sec--wine cta">
      <i class="ast" style="left:-18px;top:26px;background:var(--ink);transform:rotate(18deg)"></i>
      <i class="ast" style="right:-12px;bottom:40px;width:54px;background:var(--mint);transform:rotate(-8deg)"></i>
      <h2 class="disp cta__title split-mask" data-split>Остались <span class="o noSplit">вопросы?</span></h2>
      <span class="scr rv" style="--d:.3s">спроси — мы ответим</span>
      <button type="button" class="btn btn--cream btn--block rv" style="--d:.4s" data-go="form:question"><span class="btn__txt">Задать вопрос</span> <span class="arr">${I.arr}</span></button>
    </section>

    <footer class="foot" id="foot">
      ${logo('logo--outline', true)}
      <p class="foot__chant scr">они были теми, в ком вечно нуждались</p>
      <p class="foot__txt">Студенческий совет факультета «Налоги, аудит и бизнес-анализ»<br>Финансовый университет · NAB Label</p>
    </footer>`;
  };

  function pageHead({ rail, title, acc = '', script = '', lead = '', ast = true }) {
    return `<div class="page__head">
      <button type="button" class="back" data-back="1">${I.back} Назад</button>
      <span class="page__rail">${esc(rail)}</span>
      ${ast ? '<div class="page__ast rv-pop" style="--d:.3s"><i class="ast"></i></div>' : ''}
      <h1 class="disp page__title split-mask" data-split>${esc(title)}${acc ? ` <span class="acc">${esc(acc)}</span>` : ''}</h1>
      ${script ? `<span class="scr page__script rv" style="--d:.35s">${esc(script)}</span>` : ''}
      ${lead ? `<p class="lead page__lead rv" style="--d:.45s">${lead}</p>` : ''}
    </div>`;
  }

  S.npb = () => {
    const ready = Object.keys(DOCS).length;
    const rows = D().docs.map(({ id, title, sub }, i) => {
      const d = DOCS[id];
      const has = d && d.pages;
      return `<button type="button" class="ticket ${i % 3 === 1 ? 'ticket--mint' : ''} rv" style="--d:${i * 0.05}s" ${has ? `data-go="doc:${id}"` : `data-senddoc="${id}"`}>
        <span class="ticket__n">${has ? `<img src="${docThumb(d.slug, 1)}" alt="" loading="lazy" decoding="async">` : pad2(id)}</span>
        <span><span class="ticket__t">${esc(title)}</span>
        <span class="ticket__s">${has ? `${d.pages} стр. · листать здесь` : `${esc(sub)} · пришлём PDF в чат`}</span></span>
        <span class="ticket__go">${I.arr}</span></button>`;
    }).join('');
    return `<div class="page">
      ${pageHead({ rail: 'Нормативно-правовая база', title: 'Нормативно-', acc: 'правовая база', script: 'всё по правилам',
        lead: ready ? 'Ключевые документы университета и Студсовета. Открывай и листай страницы прямо здесь — или попроси PDF в чат.' : 'Ключевые документы университета и Студсовета. Нажми — бот пришлёт PDF в чат.' })}
      <div class="tickets">${rows}</div>
    </div>`;
  };

  function pagesHTML(total, src, ratio) {
    let h = '';
    for (let n = 1; n <= total; n++) {
      h += `<div class="pg" data-p="${n}" style="--ar:${ratio}"><img data-src="${src(n)}" alt="Страница ${n}" decoding="async"><span class="pg__n">${n}</span></div>`;
    }
    return `<div class="pages" id="pages">${h}</div>`;
  }

  function hudHTML(total, pdfAttr) {
    return `<div class="hud" id="hud">
      <span class="hud__pos" id="hudPos">1 / ${total}</span>
      <input type="range" id="hudRange" min="1" max="${total}" value="1" aria-label="Перейти к странице">
      <button type="button" class="hud__pdf" ${pdfAttr}>PDF</button>
      <button type="button" class="hud__up" data-act="top" aria-label="Наверх">${I.up}</button>
    </div>`;
  }

  S.doc = (id) => {
    const d = DOCS[id];
    if (!d) return S.npb();
    return `<div class="page">
      ${pageHead({ rail: `Документ ${d.id}`, title: d.title, script: d.subtitle || '', ast: false,
        lead: `${d.pages} стр. · листай вниз. Внизу — ползунок для быстрого перехода.` })}
      <button type="button" class="btn btn--ghost btn--block rv" data-senddoc="${d.id}" style="margin-bottom:14px"><span class="btn__txt">Прислать PDF в чат</span></button>
      <div class="search rv" style="--d:.5s">
        <svg class="search__ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input type="search" id="rq" placeholder="Найти в документе…" autocomplete="off" enterkeyhint="search">
        <button type="button" class="search__x" id="rqx" aria-label="Очистить" hidden>×</button>
      </div>
      <div class="results" id="rres" hidden></div>
      <p class="linkhint rv">${spark('', '--s:11px')} ссылки на страницах нажимаются</p>
      ${pagesHTML(d.pages, (n) => docSrc(d.slug, n), d.ratio || 0.707)}
    </div>
    ${hudHTML(d.pages, `data-senddoc="${d.id}"`)}`;
  };

  S.faq = () => `<div class="page">
      ${pageHead({ rail: 'Часто задаваемые вопросы', title: 'FAQ', acc: 'ответы', script: 'на всё и сразу',
        lead: 'Учёба, сессия, преподаватели, общежитие, личный кабинет, стипендия и документы. Листай или выбирай раздел.' })}
      <button type="button" class="btn btn--wine btn--block rv" data-act="faqpdf" style="margin-bottom:6px"><span class="btn__txt">Прислать PDF в чат</span></button>
      <div class="search rv" style="--d:.5s">
        <svg class="search__ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input type="search" id="rq" placeholder="Поиск: пересдача, общежитие, стипендия…" autocomplete="off" enterkeyhint="search">
        <button type="button" class="search__x" id="rqx" aria-label="Очистить" hidden>×</button>
      </div>
      <div class="results" id="rres" hidden></div>
      <p class="linkhint rv">${spark('', '--s:11px')} ссылки и пункты «Навигации» нажимаются</p>
      <div class="chapters" id="chapters">${FAQ_CHAPTERS.map((c) => `<button type="button" class="chip" data-page="${c.from}">${esc(c.t)}</button>`).join('')}</div>
      ${pagesHTML(FAQ_PAGES, faqSrc, FAQ_RATIO)}
    </div>
    ${hudHTML(FAQ_PAGES, 'data-act="faqpdf"')}`;

  /* ---------------- Карта корпуса ---------------- */

  let MAP = null;          // assets/map/manifest.json: этажи и координаты аудиторий
  const mapReady = fetch('assets/map/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null)).then((m) => { MAP = m; return m; }).catch(() => null);

  S.map = () => `<div class="page page--map">
      ${pageHead({ rail: 'Карта корпуса', title: 'Карта', acc: 'корпуса', script: 'Верхняя Масловка, 15',
        lead: 'Впиши номер аудитории — покажем этаж и точку на плане. Карту можно двигать и приближать пальцами.' })}
      <div class="search rv" style="--d:.45s">
        ${I.pin.replace('width="22" height="22"', 'width="18" height="18" class="search__ico"')}
        <input type="search" id="roomQ" inputmode="text" placeholder="Аудитория: 412 или 105-1" autocomplete="off" enterkeyhint="search">
        <button type="button" class="search__x" id="roomX" aria-label="Очистить" hidden>×</button>
      </div>
      <p class="roomres" id="roomRes" aria-live="polite"></p>
      <div class="bld rv" style="--d:.5s" id="bld"><i class="bld__knob"></i>
        <button type="button" data-b="0" aria-pressed="true">Корпус 15</button>
        <button type="button" data-b="1" aria-pressed="false">Компьютерный 15-1</button>
      </div>
      <div class="floors" id="floors"></div>
      <div class="mapbox rv" style="--d:.55s" id="mapbox">
        <div class="mapview" id="mapview">
          <div class="mapzoom" id="mapzoom">
            <img id="mapimg" alt="" draggable="false">
            <div class="mpin" id="mpin" hidden><i></i><b id="mpinTxt"></b></div>
          </div>
        </div>
        <span class="mapfloor" id="mapFloor"></span>
        <div class="mapctl">
          <button type="button" id="mzIn" aria-label="Приблизить">${I.plus}</button>
          <button type="button" id="mzOut" aria-label="Отдалить">${I.minus}</button>
          <button type="button" id="mzFit" aria-label="Показать этаж целиком">${I.fit}</button>
        </div>
        <span class="maphint" id="mapHint">двигай и приближай ✦</span>
      </div>
      <div class="howto rv">
        <span class="kicker kicker--wine">Как читать номер</span>
        <p><b>1-я цифра — этаж, 2-я — подъезд.</b> 257 — это 2 этаж, 5 подъезд. Если в номере три цифры и вторая больше 4, прибавь единицу: получится 6 подъезд. 431 — 4 этаж, 3 подъезд.</p>
        <p class="muted-s">Кругового перехода нет на 1, 4 и 5 этажах. Номера с «-1» — компьютерный корпус 15-1, туда ведёт переход с 3 этажа.</p>
      </div>
      <button type="button" class="btn btn--ghost btn--block rv" data-senddoc="map"><span class="btn__txt">Прислать PDF карты в чат</span></button>
    </div>`;

  let mapResize = null;
  window.addEventListener('resize', () => { if (mapResize) mapResize(); });

  function setupMap() {
    const view_ = $('#mapview'), zoom = $('#mapzoom'), img = $('#mapimg'), pin = $('#mpin');
    const floorsBox = $('#floors'), bld = $('#bld'), q = $('#roomQ'), res = $('#roomRes'), qx = $('#roomX');
    let floors = [], b = 0, cur = null;
    let s = 1, tx = 0, ty = 0, base = 1;          // масштаб и сдвиг
    const W = () => view_.clientWidth, H = () => view_.clientHeight;
    const IW = 2400, IH = 1350;

    function clampT() {
      const w = IW * base * s, h = IH * base * s;
      tx = w <= W() ? (W() - w) / 2 : clamp(tx, W() - w, 0);
      ty = h <= H() ? (H() - h) / 2 : clamp(ty, H() - h, 0);
    }
    function apply(anim) {
      clampT();
      zoom.style.transition = anim && !REDUCED ? 'transform .55s cubic-bezier(.19,1,.22,1)' : 'none';
      zoom.style.transform = `translate(${tx}px, ${ty}px) scale(${base * s})`;
      pin.style.setProperty('--inv', (1 / (base * s)).toFixed(4));
    }
    function fit(anim) {                       // весь этаж целиком
      base = Math.min(W() / IW, H() / IH);
      s = 1;
      tx = (W() - IW * base) / 2; ty = (H() - IH * base) / 2;
      apply(anim);
    }
    function cover(anim) {                     // по высоте окна — крупнее, листается вбок
      base = Math.min(W() / IW, H() / IH);
      s = Math.max(1, (H() / IH) / base);
      tx = W() / 2 - 0.42 * IW * base * s; ty = (H() - IH * base * s) / 2;
      apply(anim);
    }
    function zoomAt(k, cx = W() / 2, cy = H() / 2, anim = true) {
      const ns = clamp(s * k, 1, 6);
      const r = ns / s;
      tx = cx - (cx - tx) * r; ty = cy - (cy - ty) * r; s = ns;
      apply(anim);
    }
    function focus(x, y, targetS = 2.4) {
      s = Math.max(s, targetS);
      tx = W() / 2 - x * IW * base * s; ty = H() / 2 - y * IH * base * s;
      apply(true);
    }

    function drawFloors() {
      const list = floors.filter((f) => (f.b.includes('15-1') ? 1 : 0) === b);
      floorsBox.innerHTML = list.map((f) => `<button type="button" class="fl${cur && cur.id === f.id ? ' on' : ''}" data-f="${f.id}">
        <b>${esc(f.t.replace(' этаж', ''))}</b><span>этаж</span></button>`).join('');
      $$('.fl', floorsBox).forEach((btn) => btn.addEventListener('click', () => { haptic('select'); show(btn.dataset.f); pin.hidden = true; }));
    }
    function show(id, keepPin) {
      const f = floors.find((x) => x.id === id);
      if (!f) return;
      const changed = !cur || cur.id !== id;
      cur = f;
      b = f.b.includes('15-1') ? 1 : 0;
      bld.dataset.v = String(b);
      $$('button', bld).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.b === String(b))));
      drawFloors();
      $('#mapFloor').textContent = `${f.t} · ${f.b}`;
      current().arg = id;
      if (changed) {
        zoom.classList.remove('swap'); void zoom.offsetWidth; zoom.classList.add('swap');
        img.src = `assets/map/${f.slug}.webp`;
        img.alt = `План: ${f.t}, ${f.b}`;
        if (!keepPin) pin.hidden = true;
        cover(false);
      }
    }

    function findRoom(raw) {
      const t = String(raw || '').toLowerCase().replace(/\s+/g, '').replace(/^(ауд\.?|аудитория|каб\.?)/, '')
        .replace(/a/g, 'а').replace(/b/g, 'б').replace(/v/g, 'в');
      if (!t) return null;
      const comp = /-1$/.test(t) || /^\d{3}[абв]?-?1$/.test(t) && t.length >= 5 && t.includes('-');
      for (const f of floors) {
        if (f.rooms[t]) return { f, key: t, xy: f.rooms[t], exact: true };
      }
      // без буквы: 221а → 221
      const bare = t.replace(/[абв](?=(-1)?$)/, '');
      for (const f of floors) if (f.rooms[bare]) return { f, key: bare, xy: f.rooms[bare], exact: false, asked: t };
      // не нашли на плане — хотя бы этаж
      const m = t.match(/^(-?\d)(\d)\d[абв]?(-1)?$/) || t.match(/^(0)(\d)\d$/);
      if (m) {
        const fl = m[1] === '0' ? '-1' : m[1];
        const id = (m[3] || comp) ? fl + 'к' : fl;
        const f = floors.find((x) => x.id === id);
        if (f) return { f, key: t, xy: null };
      }
      return null;
    }

    function search() {
      const v = q.value.trim();
      qx.hidden = !v;
      if (!v) { res.textContent = ''; res.className = 'roomres'; pin.hidden = true; return; }
      const r = findRoom(v);
      if (!r) { res.innerHTML = 'Такой аудитории не нашли. Проверь номер — например, <b>412</b> или <b>105-1</b>.'; res.className = 'roomres err'; pin.hidden = true; return; }
      show(r.f.id, true);
      if (r.xy) {
        $('#mpinTxt').textContent = r.key;
        pin.style.left = `${r.xy[0] * 100}%`; pin.style.top = `${r.xy[1] * 100}%`;
        pin.hidden = false;
        pin.classList.remove('drop'); void pin.offsetWidth; pin.classList.add('drop');
        requestAnimationFrame(() => focus(r.xy[0], r.xy[1]));
        res.innerHTML = `✦ <b>${esc(r.asked || r.key)}</b> — ${esc(r.f.t)}, ${esc(r.f.b)}${r.exact ? '' : ' (показали ближайший номер)'}`;
        res.className = 'roomres ok';
        haptic('success');
      } else {
        pin.hidden = true;
        res.innerHTML = `<b>${esc(v)}</b> — ${esc(r.f.t)}, ${esc(r.f.b)}. Точку на плане не отметили — ищи по номерам рядом.`;
        res.className = 'roomres ok';
        haptic('light');
      }
      $('#mapbox').scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
      $('#mapHint').classList.add('off');
    }

    // жесты: палец двигает, два пальца приближают, двойной тап — ближе
    const pts = new Map();
    let last = null, pinch = null, lastTap = 0;
    view_.addEventListener('pointerdown', (e) => {
      view_.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      $('#mapHint').classList.add('off');
      if (pts.size === 1) {
        last = { x: e.clientX, y: e.clientY };
        const now = Date.now();
        if (now - lastTap < 300) { const r = view_.getBoundingClientRect(); zoomAt(1.8, e.clientX - r.left, e.clientY - r.top); haptic('light'); }
        lastTap = now;
      }
      if (pts.size === 2) {
        const [a, c] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), s };
      }
    });
    view_.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, c] = [...pts.values()];
        const d = Math.hypot(a.x - c.x, a.y - c.y);
        const r = view_.getBoundingClientRect();
        zoomAt((pinch.s * d / pinch.d) / s, (a.x + c.x) / 2 - r.left, (a.y + c.y) / 2 - r.top, false);
      } else if (pts.size === 1 && last) {
        tx += e.clientX - last.x; ty += e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        apply(false);
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) last = { ...[...pts.values()][0] }; if (!pts.size) last = null; };
    view_.addEventListener('pointerup', up);
    view_.addEventListener('pointercancel', up);
    view_.addEventListener('wheel', (e) => { e.preventDefault(); const r = view_.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top, false); }, { passive: false });

    $$('.mapctl button').forEach((x) => x.addEventListener('click', () => $('#mapHint').classList.add('off')));
    $('#mzIn').addEventListener('click', () => { haptic('light'); zoomAt(1.5); });
    $('#mzOut').addEventListener('click', () => { haptic('light'); zoomAt(1 / 1.5); });
    $('#mzFit').addEventListener('click', () => { haptic('light'); fit(true); });
    $$('button', bld).forEach((x) => x.addEventListener('click', () => {
      haptic('select');
      const nb = Number(x.dataset.b);
      if (nb === b) return;
      b = nb;
      const first = floors.find((f) => (f.b.includes('15-1') ? 1 : 0) === b && (b ? true : f.id === '1'));
      show(first.id);
    }));
    let timer = null;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { q.blur(); clearTimeout(timer); search(); } });
    qx.addEventListener('click', () => { q.value = ''; search(); q.focus(); });
    let lastW = window.innerWidth;
    mapResize = () => {
      if (current().name !== 'map' || !view_.isConnected) return;
      if (window.innerWidth !== lastW) { lastW = window.innerWidth; cover(false); }  // поворот экрана
      else apply(false);                                                               // клавиатура — зум не трогаем
    };

    mapReady.then((m) => {
      if (!m || current().name !== 'map') return;
      floors = m.floors;
      const start = floors.find((f) => f.id === current().arg) || floors.find((f) => f.id === '1') || floors[0];
      show(start.id);
      if (pendingRoom) { q.value = pendingRoom; pendingRoom = ''; search(); }
    });
  }

  S.groups = () => `<div class="page">
      ${pageHead({ rail: 'Ресурсы', title: 'Важные', acc: 'группы', script: 'будь в курсе',
        lead: 'Все официальные ресурсы факультета и Студсовета — подписывайся, чтобы ничего не пропустить.' })}
      <div class="links">${D().links.map((g, i) => `<button type="button" class="lnk rv" style="--d:${i * 0.08}s" data-link="${g.u}">
        <span class="lnk__k">${esc(g.k)}</span>
        <span class="lnk__t">${esc(g.t)}</span>
        <span class="lnk__s">${esc(g.s)}</span>
        <span class="lnk__arr">${I.arr}</span></button>`).join('')}</div>
    </div>`;

  S.contacts = () => `<div class="page">
      ${pageHead({ rail: 'Контакты', title: 'Наши', acc: 'контакты', script: 'пиши смело',
        lead: 'Руководство Студенческого совета НАБ — можно написать напрямую.' })}
      <div class="badges">${D().people.map((p, i) => `<article class="badge rv" style="--i:${i};--d:${i * 0.12}s">
        <div class="badge__row"><span class="badge__ava"><span>${esc(p.ini)}</span></span>
          <span><span class="badge__role">${esc(p.role)}</span><div class="badge__name">${esc(p.name)}</div></span></div>
        <span class="scr">${esc(p.note)}</span>
        <div class="badge__btns">
          ${p.tel ? `<a class="btn btn--sm btn--cream" href="tel:${esc(p.tel.replace(/[^+\d]/g, ''))}">${I.phone.replace('width="22" height="22"', 'width="15" height="15"')}<span>Позвонить</span></a>` : ''}
          ${p.tg ? `<button type="button" class="btn btn--sm btn--wine" data-link="https://t.me/${esc(p.tg)}">${I.tg}<span>Написать</span></button>` : ''}
        </div></article>`).join('')}</div>
      <div class="note rv"><span>💬</span><span>Не хочешь писать лично? Задай вопрос через приложение — можно анонимно.</span></div>
      <div class="gap"></div>
      <button type="button" class="btn btn--block rv" data-go="form:question"><span class="btn__txt">Задать вопрос</span> <span class="arr">${I.arr}</span></button>
    </div>`;

  S.form = (kind) => {
    const f = FORMS[kind];
    if (!f) return S.home();
    return `<div class="page">
      ${pageHead({ rail: f.rail, title: f.title, acc: f.acc, script: f.script, lead: esc(f.lead) })}
      <div class="sheet-wrap rv">
        ${clip()}
        <div class="sheet">
          <div class="field">
            <span class="label">Как отправить</span>
            <div class="seg" id="seg" data-v="0"><i class="seg__knob"></i>
              <button type="button" data-anon="0" aria-pressed="true">С профилем</button>
              <button type="button" data-anon="1" aria-pressed="false">Анонимно</button>
            </div>
          </div>
          ${f.place ? `<div class="field"><span class="label">Корпус и аудитория</span>
            <input class="inp" id="place" maxlength="200" placeholder="Корпус и аудитория, напр. 206" autocomplete="off"><i class="line"></i></div>` : ''}
          <div class="field">
            <span class="label">${f.place ? 'Что случилось' : 'Текст'}</span>
            <textarea class="inp" id="text" maxlength="3000" placeholder="${esc(f.ph)}"></textarea><i class="line"></i>
            <span class="counter"><span id="cnt">0</span> / 3000</span>
          </div>
          ${f.photos ? `<div class="field" style="margin-top:28px"><span class="label">Фото — до 5 штук</span>
            <div class="photos" id="photos"></div>
            <button type="button" class="ph-add" id="addPhoto"><b>${I.cam}</b>Добавить фото</button>
            <input type="file" id="fileInput" accept="image/*" multiple hidden></div>` : ''}
        </div>
      </div>
      <div class="gap"></div>
      <button type="button" class="btn btn--wine btn--block" id="submitBtn" style="min-height:62px"><span class="btn__txt">${esc(f.btn)} <span class="arr">${I.arr}</span></span><i class="ast spin-ast"></i></button>
      <div class="form-note"><span>🔒</span><span>${kind === 'panic'
        ? 'Сигнал уходит напрямую руководству ССт НАБ. При анонимной отправке твой профиль нигде не отображается.'
        : 'При анонимной отправке руководство не видит, кто написал. Твой Telegram ID не показывается никогда.'}</span></div>
    </div>`;
  };

  S.ok = (kind) => {
    const txt = {
      question: 'Вопрос передан руководству ССт НАБ. Ответ придёт прямо в чат с ботом — следи за уведомлениями.',
      initiative: 'Инициатива передана руководству ССт НАБ. Спасибо, что делаешь НАБ лучше!',
      panic: 'Сигнал SOS передан руководству ССт НАБ. Постараемся помочь в ближайшее время.',
      repair: 'Информация о поломке передана руководству ССт НАБ и начальнику корпуса. Постараемся устранить в ближайшее время.',
    }[kind] || 'Обращение передано руководству ССт НАБ.';
    return `<div class="page">
      <div class="okscr">
        <svg class="ok__mark" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56"/><path d="M36 62l16 16 32-34"/></svg>
        <h1 class="disp ok__title split-mask" data-split>Принято!</h1>
        <span class="scr">спасибо тебе</span>
        <p class="lead">${esc(txt)}</p>
      </div>
      <div class="gap"></div>
      <button type="button" class="btn btn--block" data-go="my"><span class="btn__txt">Мои обращения</span> <span class="arr">${I.arr}</span></button>
      <div class="gap"></div>
      <button type="button" class="btn btn--ghost btn--block" data-home="1"><span class="btn__txt">На главную</span></button>
      <div class="gap"></div>
      <button type="button" class="btn btn--ghost btn--block" data-go="form:${esc(kind)}"><span class="btn__txt">Отправить ещё одно</span></button>
    </div>`;
  };

  /* ================= Живые данные: новости, анонсы, опросы, обращения ================= */

  // Всё, что руководство меняет в Пульте, приходит одним запросом /api/bootstrap.
  let DATA = null;
  const fallbackData = () => ({
    me: {}, news: [], events: [], polls: [], myUnread: 0, myCount: 0,
    links: GROUPS.map((g) => ({ t: g.t, k: g.k, s: g.s, u: g.u })),
    people: PEOPLE.map((p) => ({ ...p })),
    docs: NPB.map(([id, title, sub]) => ({ id, title, sub })),
  });
  const D = () => DATA || fallbackData();
  const isAdmin = () => Boolean(DATA && DATA.me && DATA.me.isAdmin);

  async function loadData() {
    if (!inTelegram) { DATA = null; return null; }
    try {
      const r = await api('/bootstrap', {});
      DATA = r.data;
    } catch (e) {
      if (e.code) showApiError(e);
    }
    onData();
    return DATA;
  }
  const dataReady = loadData();

  function onData() {
    renderMenu();
    const c = current();
    if (c.name === 'home') fillHome();
    else if (['groups', 'contacts', 'npb', 'events', 'polls', 'news'].includes(c.name) && !busy) { remember(); paint(); }
  }

  /* ---------------- Анонимная статистика ---------------- */
  // Считаем только «что открывают и что ищут» — без привязки к человеку.
  const trackQ = [];
  let trackT = null;
  function track(n, k = '') {
    if (!inTelegram) return;
    trackQ.push({ n, k: String(k).slice(0, 80) });
    clearTimeout(trackT);
    trackT = setTimeout(flushTrack, 2500);
  }
  function flushTrack() {
    if (!trackQ.length) return;
    const events = trackQ.splice(0, 40);
    api('/track', { events }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushTrack(); });
  track('open', '');
  track('platform', (tg && tg.platform) || 'web');

  /* ---------------- Мелкие помощники ---------------- */

  const plural = (n, a, b, c) => { const x = Math.abs(n) % 100, y = x % 10; return x > 10 && x < 20 ? c : y > 1 && y < 5 ? b : y === 1 ? a : c; };
  const fmtDate = (ts) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ts * 1000));
  const fmtShort = (ts) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(ts * 1000));
  const nl2br = (t) => esc(t).replace(/\n/g, '<br>');
  const STATUS = { new: ['передано', 'st--new'], work: ['в работе', 'st--work'], done: ['решено', 'st--done'] };
  const starRow = (n, cls = '') => `<span class="stars ${cls}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
  I.search = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', 18);
  I.cal = svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
  I.chart = svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>');
  I.inbox = svg('<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>');
  I.bell = svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>', 16);
  I.panel = svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>');

  /* ---------------- Главная: живые блоки ---------------- */

  function heroChips() {
    const d = D();
    const out = [];
    if (isAdmin()) {
      const n = d.adminNew || 0;
      out.push(`<button type="button" class="kicker kicker--wine hchip" data-go="admin">${I.panel.replace('width="22" height="22"', 'width="12" height="12"')} Пульт${n ? ` · <b>${n}</b>` : ''}</button>`);
    }
    if (d.myCount) {
      out.push(`<button type="button" class="kicker kicker--ghost hchip" data-go="my">Мои обращения${d.myUnread ? ` <b class="dot">${d.myUnread}</b>` : ''}</button>`);
    }
    return out.join('') || '<span class="kicker kicker--ghost">сезон 26/27</span>';
  }

  function eventCard(v, compact = false) {
    const rsvp = v.rsvp ? `<div class="ev__rsvp">
        <button type="button" class="ev__b ${v.my === 'yes' ? 'on' : ''}" data-rsvp="yes" data-id="${v.id}">${v.my === 'yes' ? '✓ ' : ''}Приду</button>
        <button type="button" class="ev__b ev__b--no ${v.my === 'no' ? 'on' : ''}" data-rsvp="no" data-id="${v.id}">Не приду</button>
        <span class="ev__cnt">идут: <b>${v.counts ? v.counts.yes : 0}</b></span></div>`
      : (!v.notifyAll && v.days >= 0 ? `<div class="ev__rsvp"><button type="button" class="ev__b ${v.subscribed ? 'on' : ''}" data-evsub="${v.id}">${I.bell} ${v.subscribed ? 'Напомню' : 'Напомнить'}</button></div>` : '');
    return `<article class="ev ${v.days < 0 ? 'ev--past' : ''} ${compact ? 'ev--compact' : ''}" data-ev="${v.id}">
      <div class="ev__date"><b>${v.day}</b><span>${esc(v.mon)}</span><i>${esc(v.wday)}</i></div>
      <div class="ev__body">
        <span class="ev__kind">${esc(v.kindTitle)} · ${esc(v.when)}</span>
        <h3 class="ev__t">${esc(v.title)}</h3>
        <p class="ev__meta">${v.time ? `🕒 ${esc(v.time)}` : ''}${v.place ? ` 📍 ${esc(v.place)}` : ''}</p>
        ${!compact && v.descr ? `<p class="ev__d">${nl2br(v.descr)}</p>` : ''}
        ${v.url ? `<button type="button" class="ev__link" data-link="${esc(v.url)}">Подробнее ↗</button>` : ''}
        ${v.days >= 0 ? rsvp : ''}
      </div></article>`;
  }

  function pollCard(p) {
    const total = (p.votes || []).reduce((a, b) => a + b, 0) || 1;
    const showRes = p.votes && (p.mine.length || p.closed);
    return `<article class="poll" data-poll="${p.id}">
      <span class="poll__k">${spark('', '--s:11px')} опрос${p.closed ? ' · закрыт' : ''}${p.multi ? ' · можно несколько' : ''}</span>
      <h3 class="poll__q">${esc(p.question)}</h3>
      <div class="poll__opts">${p.options.map((o, i) => {
        const v = p.votes ? p.votes[i] : 0;
        const pct = Math.round((v * 100) / total);
        return `<button type="button" class="poll__o ${p.mine.includes(i) ? 'on' : ''} ${showRes ? 'res' : ''}" data-opt="${i}" ${p.closed ? 'disabled' : ''} style="--p:${showRes ? pct : 0}%">
          <span class="poll__bar"></span><span class="poll__t">${esc(o)}</span>${showRes ? `<span class="poll__pct">${pct}%</span>` : ''}</button>`;
      }).join('')}</div>
      <p class="poll__n">${p.voters ? `Проголосовали: ${p.voters}` : 'Будь первым ✦'} · анонимно</p>
    </article>`;
  }

  function newsCard(n, i = 0) {
    return `<article class="fcard news rv ${['', 'fcard--mint', 'fcard--sand'][i % 3]}" data-go="news:${n.id}">
      ${n.image ? `<div class="fcard__photo"><img src="${esc(n.image)}" alt="" loading="lazy" decoding="async"></div>` : ''}
      <div class="fcard__pills"><span class="kicker ${i % 3 ? 'kicker--wine' : 'kicker--ink'}">${esc(n.tag || 'Новость')}</span>${n.pinned ? spark('', '--s:16px') : ''}<span class="news__date">${esc(n.date)}</span></div>
      <h3 class="disp fcard__title">${esc(n.title)}</h3>
      ${n.body ? `<p class="fcard__text">${esc(n.body.length > 160 ? n.body.slice(0, 158) + '…' : n.body)}</p>` : ''}
      <span class="news__more">Читать ${I.arr}</span>
    </article>`;
  }

  function fillHome() {
    const d = D();
    const chips = $('#heroChips');
    if (chips) chips.innerHTML = heroChips();
    const nb = $('#homeNews');
    if (nb) {
      nb.innerHTML = d.news.slice(0, 4).map(newsCard).join('');
      if (io) $$('.rv', nb).forEach((el) => io.observe(el));
    }
    const live = $('#homeLive');
    if (!live) return;
    const evs = d.events.filter((v) => v.days >= 0).slice(0, 3);
    const polls = d.polls.filter((p) => !p.closed).slice(0, 1);
    if (!evs.length && !polls.length) { live.hidden = true; return; }
    live.hidden = false;
    live.innerHTML = `<div class="sec__head">
        <span class="kicker">${I.cal.replace('width="22" height="22"', 'width="12" height="12"')} Скоро</span>
        <h2 class="disp sec__title" style="margin-top:12px">Анонсы</h2>
        <span class="scr sec__sub">отметься — мы ждём</span>
      </div>
      <div class="evs">${evs.map((v) => eventCard(v, true)).join('')}</div>
      ${evs.length ? '<button type="button" class="btn btn--ghost btn--block" data-go="events" style="margin-top:14px"><span class="btn__txt">Все анонсы</span> <span class="arr">' + I.arr + '</span></button>' : ''}
      ${polls.map(pollCard).join('')}`;
  }

  // кнопки «Приду / Не приду», колокольчик, голос в опросе — работают на любом экране
  document.addEventListener('click', async (e) => {
    const rs = e.target.closest('[data-rsvp]');
    const sub = e.target.closest('[data-evsub]');
    const opt = e.target.closest('.poll__o');
    if (!rs && !sub && !opt) return;
    e.stopPropagation();
    if (!requireTelegram()) return;
    try {
      if (rs) {
        const id = Number(rs.dataset.id);
        const v = D().events.find((x) => x.id === id);
        const answer = v && v.my === rs.dataset.rsvp ? '' : rs.dataset.rsvp;
        haptic(answer === 'yes' ? 'success' : 'select');
        const r = await api('/event-rsvp', { id, answer });
        replaceEvent(r.event);
        toast(answer === 'yes' ? 'Ждём тебя! Напомним накануне ✦' : answer === 'no' ? 'Отметили, что не придёшь' : 'Отметка снята');
      } else if (sub) {
        const id = Number(sub.dataset.evsub);
        const v = D().events.find((x) => x.id === id);
        const on = !(v && v.subscribed);
        haptic('select');
        await api('/event-sub', { id, on });
        if (v) v.subscribed = on;
        replaceEvent(v);
        toast(on ? 'Напомню за день и в день события 🔔' : 'Напоминание выключено');
      } else if (opt && !opt.disabled) {
        const card = opt.closest('[data-poll]');
        const id = Number(card.dataset.poll);
        const p = D().polls.find((x) => x.id === id);
        let options = [Number(opt.dataset.opt)];
        if (p && p.multi) {
          const set = new Set(p.mine);
          set.has(options[0]) ? set.delete(options[0]) : set.add(options[0]);
          options = [...set];
        }
        haptic('success');
        const r = await api('/poll-vote', { id, options });
        if (DATA) DATA.polls = DATA.polls.map((x) => (x.id === id ? r.poll : x));
        $$(`[data-poll="${id}"]`).forEach((el) => { el.outerHTML = pollCard(r.poll); });
      }
    } catch (err) { showApiError(err); }
  }, true);

  function replaceEvent(v) {
    if (!v) return;
    if (DATA) DATA.events = DATA.events.map((x) => (x.id === v.id ? v : x));
    $$(`[data-ev="${v.id}"]`).forEach((el) => { el.outerHTML = eventCard(v, el.classList.contains('ev--compact')); });
  }

  /* ---------------- Экраны: анонсы, опросы, новость ---------------- */

  S.events = () => {
    const evs = D().events;
    const up = evs.filter((v) => v.days >= 0);
    const past = evs.filter((v) => v.days < 0);
    return `<div class="page">
      ${pageHead({ rail: 'Анонсы', title: 'Анонсы', acc: 'и события', script: 'не пропусти',
        lead: 'Собрания, выезды, отборы и дедлайны. Отмечай «Приду» — руководство видит явку заранее, а бот напомнит накануне.' })}
      <div class="evs">${up.length ? up.map((v) => eventCard(v)).join('') : `<div class="empty rv">${I.cal}<p>Пока ничего не запланировано.<br>Как только появится событие — оно будет здесь.</p></div>`}</div>
      ${past.length ? `<h3 class="sub-h">Недавно прошли</h3><div class="evs">${past.map((v) => eventCard(v, true)).join('')}</div>` : ''}
    </div>`;
  };

  S.polls = () => {
    const ps = D().polls;
    return `<div class="page">
      ${pageHead({ rail: 'Опросы', title: 'Твой', acc: 'голос', script: 'каждый важен',
        lead: 'Голосование анонимное: руководство видит только итоги. Результаты появятся сразу после твоего голоса.' })}
      ${ps.length ? ps.map(pollCard).join('') : `<div class="empty rv">${I.chart}<p>Сейчас нет открытых опросов.</p></div>`}
    </div>`;
  };

  S.news = (id) => {
    const n = D().news.find((x) => String(x.id) === String(id));
    if (!n) return `<div class="page">${pageHead({ rail: 'Новости', title: 'Новость', acc: 'не найдена', lead: 'Возможно, её уже убрали.' })}</div>`;
    const btn = n.btnText && n.btnUrl
      ? (n.btnUrl.startsWith('#') ? `<button type="button" class="btn btn--wine btn--block" data-go="${esc(n.btnUrl.replace(/^#\/?/, '').replace('/', ':'))}"><span class="btn__txt">${esc(n.btnText)}</span> <span class="arr">${I.arr}</span></button>`
        : `<button type="button" class="btn btn--wine btn--block" data-link="${esc(n.btnUrl)}"><span class="btn__txt">${esc(n.btnText)}</span> <span class="arr">${I.arr}</span></button>`) : '';
    return `<div class="page">
      ${pageHead({ rail: n.tag || 'Новости', title: n.title, ast: false, script: n.date })}
      ${n.image ? `<figure class="news__img rv"><img src="${esc(n.image)}" alt=""></figure>` : ''}
      <div class="news__body rv">${nl2br(n.body)}</div>
      ${btn}
      <div class="gap"></div>
      <button type="button" class="btn btn--ghost btn--block" data-home="1"><span class="btn__txt">На главную</span></button>
    </div>`;
  };

  /* ---------------- Мои обращения ---------------- */

  let MY = null;
  S.my = () => `<div class="page">
      ${pageHead({ rail: 'Мои обращения', title: 'Мои', acc: 'обращения', script: 'всё под контролем',
        lead: 'Статусы, ответы руководства и переписка. Анонимные обращения видишь только ты.' })}
      <div id="myList"><div class="empty">${I.inbox}<p>Загружаю…</p></div></div>
    </div>`;

  function repCard(r) {
    const [st, cls] = STATUS[r.status] || STATUS.new;
    const msgs = (r.messages || []).map((m) => `<div class="msg msg--${m.author === 'team' ? 'team' : 'me'}">
        <span class="msg__who">${m.author === 'team' ? 'Руководство ССт НАБ' : 'Ты'} · ${fmtShort(m.at)}</span>${nl2br(m.text)}</div>`).join('');
    const rate = r.status === 'done' ? `<div class="rate" data-rate="${r.id}">
        <span class="label">${r.rating ? 'Твоя оценка' : 'Помогло? Оцени решение'}</span>
        <div class="rate__stars">${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="rstar ${i <= (r.rating || 0) ? 'on' : ''}" data-star="${i}" aria-label="${i} из 5">★</button>`).join('')}</div>
        <textarea class="inp rate__txt" maxlength="1000" placeholder="Пара слов: что понравилось, что улучшить (необязательно)">${esc(r.review || '')}</textarea>
        <button type="button" class="btn btn--sm btn--wine" data-rate-send="${r.id}">${r.review ? 'Обновить отзыв' : 'Отправить отзыв'}</button>
      </div>` : '';
    const reply = r.canReply ? `<div class="reply">
        <textarea class="inp" maxlength="3000" placeholder="${r.status === 'done' ? 'Если вопрос не решён — напиши, и обращение снова откроется' : 'Написать руководству по этому обращению…'}"></textarea>
        <button type="button" class="btn btn--sm btn--cream" data-reply="${r.id}">Отправить</button></div>` : '';
    return `<article class="rep ${r.unread ? 'rep--new' : ''}" data-rep="${r.id}">
      <button type="button" class="rep__head" data-open="${r.id}">
        <span class="rep__ico">${r.icon}</span>
        <span class="rep__main"><span class="rep__k">${esc(r.kindTitle)} №${r.id} · ${fmtShort(r.createdAt)}${r.anon ? ' · 🕵️ анонимно' : ''}</span>
          <span class="rep__t">${esc(r.text.length > 90 ? r.text.slice(0, 88) + '…' : r.text)}</span></span>
        <span class="st ${cls}">${st}</span>
        ${r.unread ? '<i class="rep__dot"></i>' : ''}
      </button>
      <div class="rep__more">
        <p class="rep__full">${nl2br(r.text)}${r.location ? `<br><b>📍 ${esc(r.location)}</b>` : ''}</p>
        ${msgs ? `<div class="thread">${msgs}</div>` : '<p class="rep__wait">Ответа пока нет — мы напишем сюда и в чат с ботом.</p>'}
        ${rate}${reply}
      </div></article>`;
  }

  async function setupMy() {
    const box = $('#myList');
    if (!inTelegram) { box.innerHTML = `<div class="empty">${I.inbox}<p>Открой приложение у бота @sprosinab_bot — здесь появятся твои обращения.</p></div>`; return; }
    try {
      const r = await api('/my-reports', {});
      MY = r.data;
      if (DATA) DATA.myUnread = 0;
    } catch (e) { showApiError(e); MY = MY || []; }
    if (current().name !== 'my') return;
    box.innerHTML = MY.length ? MY.map(repCard).join('') : `<div class="empty">${I.inbox}<p>Пока нет обращений.<br>Задай вопрос или сообщи о проблеме — статус будет виден здесь.</p>
      <button type="button" class="btn btn--wine" data-go="form:question"><span class="btn__txt">Задать вопрос</span></button></div>`;
    const open = current().arg;
    const first = $(`[data-rep="${open}"]`) || (MY.length === 1 ? $('[data-rep]') : null);
    if (first) first.classList.add('open');
  }

  document.addEventListener('click', async (e) => {
    const head = e.target.closest('[data-open]');
    const star = e.target.closest('[data-star]');
    const send = e.target.closest('[data-rate-send]');
    const rep = e.target.closest('[data-reply]');
    if (head) { haptic('select'); head.closest('.rep').classList.toggle('open'); return; }
    if (star) {
      const box = star.closest('[data-rate]');
      const n = Number(star.dataset.star);
      const prev = $$('.rstar.on', box).length;
      const paint = (k) => $$('.rstar', box).forEach((b, i) => { b.classList.toggle('on', i < k); b.classList.remove('pop'); });
      paint(n);
      void star.offsetWidth; star.classList.add('pop');
      haptic(n >= 4 ? 'success' : 'select');
      try {
        const r = await api('/rate', { id: Number(box.dataset.rate), rating: n });
        updateRep(r.report, true);
        toast(n >= 4 ? 'Спасибо! Рады, что помогли 💚' : 'Спасибо за честную оценку — разберёмся');
      } catch (err) { paint(prev); showApiError(err); }
      return;
    }
    if (send) {
      const box = send.closest('[data-rate]');
      busyBtn(send, true);
      try {
        const r = await api('/rate', { id: Number(send.dataset.rateSend), review: $('.rate__txt', box).value });
        haptic('success'); toast('Отзыв отправлен ✦'); updateRep(r.report, true, false);
      } catch (err) { showApiError(err); } finally { busyBtn(send, false); }
      return;
    }
    if (rep) {
      const ta = rep.parentNode.querySelector('textarea');
      if (!ta.value.trim()) { ta.focus(); toast('Напиши текст ответа', 'err'); return; }
      busyBtn(rep, true);
      try {
        const r = await api('/report-reply', { id: Number(rep.dataset.reply), text: ta.value });
        haptic('success'); toast('Отправлено руководству ✦'); updateRep(r.report, true, false);
      } catch (err) { showApiError(err); } finally { busyBtn(rep, false); }
    }
  });

  function updateRep(r, keepOpen, keepText = true) {
    if (!r) return;
    MY = (MY || []).map((x) => (x.id === r.id ? r : x));
    const el = $(`[data-rep="${r.id}"]`);
    if (!el) return;
    const draft = keepText ? { review: ($('.rate__txt', el) || {}).value, reply: ($('.reply textarea', el) || {}).value } : {};
    el.outerHTML = repCard(r);
    const nel = $(`[data-rep="${r.id}"]`);
    if (keepOpen) nel.classList.add('open');
    if (draft.review != null && $('.rate__txt', nel) && draft.review !== '') $('.rate__txt', nel).value = draft.review;
    if (draft.reply && $('.reply textarea', nel)) $('.reply textarea', nel).value = draft.reply;
  }

  /* ---------------- Единый поиск ---------------- */

  const SECTIONS = [
    ['form:question', 'Задать вопрос', 'вопрос руководству ответ анонимно спросить'],
    ['form:initiative', 'Инициатива', 'идея предложить запрос'],
    ['form:repair', 'Поломки', 'сломалось ремонт фото корпус розетка дверь батарея проектор'],
    ['form:panic', 'Тревожная кнопка', 'sos срочно помощь конфликт'],
    ['npb', 'НПБ — документы', 'устав правила положение документы нормативно'],
    ['faq', 'FAQ', 'вопросы ответы сессия общежитие стипендия'],
    ['map', 'Карта корпуса', 'аудитория этаж корпус найти где'],
    ['events', 'Анонсы', 'события собрание выезд дедлайн мероприятие'],
    ['polls', 'Опросы', 'голосование опрос'],
    ['my', 'Мои обращения', 'статус ответ мои'],
    ['groups', 'Важные группы', 'канал телеграм вк паблик'],
    ['contacts', 'Наши контакты', 'председатель телефон написать связаться'],
  ];
  let SEARCH_SRC = null;
  async function searchSources() {
    if (SEARCH_SRC) return SEARCH_SRC;
    const [faq, map] = await Promise.all([getJSON('assets/faq/text.json'), mapReady]);
    const docs = await Promise.all(Object.values(DOCS).map(async (d) => ({ d, t: await getJSON(`assets/docs/${d.slug}/text.json`) })));
    SEARCH_SRC = { faq: faq || [], map: map || null, docs };
    return SEARCH_SRC;
  }
  function snippet(text, q) {
    const n = normQ(text);
    const i = n.indexOf(q);
    if (i < 0) return esc(text.slice(0, 90));
    const a = Math.max(0, i - 40);
    const part = text.slice(a, i + q.length + 60);
    const j = normQ(part).indexOf(q);
    return (a ? '…' : '') + esc(part.slice(0, j)) + '<mark>' + esc(part.slice(j, j + q.length)) + '</mark>' + esc(part.slice(j + q.length)) + '…';
  }
  let pendingRoom = '';
  let pendingEvent = '';
  async function runSearch(raw) {
    const q = normQ(raw).trim();
    const box = $('#sres');
    if (!box) return;
    if (q.length < 2) { box.innerHTML = searchHints(); return; }
    const src = await searchSources();
    const d = D();
    const groups = [];
    const add = (title, items) => { if (items.length) groups.push(`<h3 class="sub-h">${title}</h3>` + items.join('')); };
    const res = (go, tag, h, s, extra = '') => `<button type="button" class="res" ${go} ${extra}><span class="res__p">${tag}</span><span class="res__h">${h}</span><span class="res__s">${s}</span></button>`;
    // аудитория по номеру
    const room = q.replace(/\s/g, '').replace(/^(ауд\.?|аудитория|каб\.?)/, '');
    if (/^-?\d{2,3}[абв]?(-1)?$/.test(room) && src.map) {
      const fl = src.map.floors;
      let f = fl.find((x) => x.rooms[room]);
      if (!f) {
        const lvl = room.startsWith('0') || room.startsWith('-') ? '-1' : room[0];
        f = fl.find((x) => x.id === (room.endsWith('-1') ? lvl + 'к' : lvl));
      }
      if (f) add('Аудитория', [res(`data-room="${esc(room)}"`, '📍', `Аудитория ${esc(room)}`, `${esc(f.t)}, ${esc(f.b)} — показать на карте`)]);
    }
    add('Разделы', SECTIONS.filter(([, t, k]) => normQ(t + ' ' + k).includes(q)).slice(0, 4)
      .map(([go, t]) => res(`data-go="${go}"`, '→', esc(t), 'раздел приложения')));
    add('Новости', d.news.filter((n) => normQ(n.title + ' ' + n.body).includes(q)).slice(0, 4)
      .map((n) => res(`data-go="news:${n.id}"`, 'NEW', esc(n.title), snippet(n.body || n.title, q))));
    add('Анонсы', d.events.filter((v) => normQ(v.title + ' ' + v.descr + ' ' + v.place).includes(q)).slice(0, 4)
      .map((v) => res(`data-go="events:${v.id}"`, `${v.day} ${esc(v.mon)}`, esc(v.title), esc(v.when))));
    add('FAQ', src.faq.map((t, i) => ({ t, p: i + 1 })).filter((x) => normQ(x.t).includes(q)).slice(0, 6)
      .map((x) => res(`data-go="faqpage:${x.p}"`, `стр. ${x.p}`, 'FAQ', snippet(x.t, q))));
    const docHits = [];
    d.docs.forEach((doc) => {
      const meta = DOCS[doc.id];
      const texts = (src.docs.find((x) => x.d.id === doc.id) || {}).t || [];
      if (normQ(doc.title + ' ' + (doc.sub || '')).includes(q)) docHits.push(res(meta ? `data-go="doc:${doc.id}"` : `data-senddoc="${doc.id}"`, `№${esc(doc.id)}`, esc(doc.title), esc(doc.sub || 'документ')));
      texts.forEach((t, i) => { if (docHits.length < 8 && normQ(t).includes(q)) docHits.push(res(`data-go="doc:${doc.id}:${i + 1}"`, `стр. ${i + 1}`, esc(doc.title), snippet(t, q))); });
    });
    add('Документы НПБ', docHits.slice(0, 8));
    add('Контакты и группы', [
      ...d.people.filter((p) => normQ(p.name + ' ' + p.role).includes(q)).map((p) => res('data-go="contacts"', esc(p.ini), esc(p.name), esc(p.role))),
      ...d.links.filter((l) => normQ(l.t + ' ' + l.s + ' ' + l.k).includes(q)).map((l) => res(`data-link="${esc(l.u)}"`, '↗', esc(l.t), esc(l.s || l.k))),
    ].slice(0, 5));
    box.innerHTML = groups.length ? groups.join('') : `<div class="empty">${I.search}<p>Ничего не нашли по «${esc(raw)}».<br>Попробуй другое слово — или задай вопрос руководству.</p>
      <button type="button" class="btn btn--wine" data-go="form:question"><span class="btn__txt">Задать вопрос</span></button></div>`;
    lastSearch = { q, found: groups.length > 0 };
  }
  let lastSearch = null;
  let searchTrackT = null;
  function trackSearch() {          // в статистику — только итоговый запрос, а не каждая набранная буква
    clearTimeout(searchTrackT);
    if (lastSearch && lastSearch.q && lastSearch.q !== trackSearch.sent) {
      trackSearch.sent = lastSearch.q;
      track(lastSearch.found ? 'search' : 'search_empty', lastSearch.q);
    }
  }
  function searchHints() {
    const tips = ['стипендия', 'пересдача', 'общежитие', '412', 'личный кабинет', 'староста', 'скидка'];
    return `<p class="sub-h">Попробуй</p><div class="chips chips--hint">${tips.map((t) => `<button type="button" class="chip" data-q="${t}">${t}</button>`).join('')}</div>`;
  }
  S.search = () => `<div class="page">
      ${pageHead({ rail: 'Поиск', title: 'Найти', acc: 'всё', script: 'в одном окне', ast: false,
        lead: 'FAQ, документы, аудитории, анонсы, новости и контакты — пиши слово или номер аудитории.' })}
      <div class="search search--big">
        <span class="search__ico">${I.search}</span>
        <input type="search" id="sq" placeholder="Стипендия, пересдача, 412…" autocomplete="off" enterkeyhint="search">
        <button type="button" class="search__x" id="sqx" aria-label="Очистить" hidden>×</button>
      </div>
      <div class="results" id="sres">${searchHints()}</div>
    </div>`;
  function setupSearchScreen() {
    const q = $('#sq');
    const x = $('#sqx');
    let t = null;
    const go = () => { x.hidden = !q.value; current().arg = q.value; runSearch(q.value);
      clearTimeout(searchTrackT); searchTrackT = setTimeout(trackSearch, 2500); };
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 160); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { q.blur(); go(); setTimeout(trackSearch, 300); } });
    q.addEventListener('blur', () => setTimeout(trackSearch, 300));
    x.addEventListener('click', () => { q.value = ''; go(); q.focus(); });
    $('#sres').addEventListener('click', (e) => {
      if (e.target.closest('.res')) trackSearch();
      const c = e.target.closest('[data-q]');
      if (c) { q.value = c.dataset.q; go(); return; }
      const r = e.target.closest('[data-room]');
      if (r) { pendingRoom = r.dataset.room; nav('map'); }
    });
    if (current().arg) { q.value = current().arg; go(); } else setTimeout(() => q.focus(), 350);
  }

  /* ---------------- Пульт руководства (код грузится только у админов) ---------------- */

  S.admin = () => `<div class="page page--admin"><div id="adminRoot"><div class="empty">${I.panel}<p>Открываю Пульт…</p></div></div></div>`;
  let adminLoaded = null;
  function setupAdmin() {
    if (!isAdmin()) {
      dataReady.then(() => {
        if (current().name !== 'admin') return;
        if (!isAdmin()) { $('#adminRoot').innerHTML = `<div class="empty">${I.panel}<p>Пульт доступен только руководству ССт НАБ.</p></div>`; return; }
        setupAdmin();
      });
      return;
    }
    if (!adminLoaded) {
      adminLoaded = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'admin.js?v=' + (window.APP_VER || '3');
        sc.onload = res; sc.onerror = rej;
        document.head.appendChild(sc);
      });
    }
    adminLoaded.then(() => window.NAB_ADMIN && window.NAB_ADMIN.mount($('#adminRoot'), NAB))
      .catch(() => { $('#adminRoot').innerHTML = '<div class="empty"><p>Не удалось загрузить Пульт. Проверь интернет.</p></div>'; });
  }

  // Общие помощники — для Пульта (admin.js)
  const NAB = { api, esc, toast, haptic, showApiError, busyBtn, nav, goBack, I, spark, plural, fmtDate, fmtShort, nl2br,
    starRow, STATUS, reload: () => loadData(), data: () => D(), compress, initData, track };

  /* ---------------- Меню: пункты зависят от роли ---------------- */
  function renderMenu() {
    const items = MENU.slice();
    if (isAdmin()) items.splice(1, 0, ['admin', 'Пульт руководства', 'is-admin']);
    $('#menuList').innerHTML = items.map(([r, t, cls], i) => {
      const badge = r === 'my' && D().myUnread ? ` <b class="menu__dot">${D().myUnread}</b>` : (r === 'admin' && D().adminNew ? ` <b class="menu__dot">${D().adminNew}</b>` : '');
      return `<li><button type="button" class="${cls || ''}" data-route="${r}" style="--i:${i}"><span class="menu__num">${pad2(i + 1)}</span><span class="menu__t">${esc(t)}${badge}</span></button></li>`;
    }).join('');
  }


  /* ---------------- Роутер ---------------- */

  let stack = [{ name: 'home', arg: '' }];
  const current = () => stack[stack.length - 1];
  let busy = false;
  let booted = false;

  function parse(route) {
    const s = String(route);
    const i = s.indexOf(':');
    return i < 0 ? { name: s, arg: '' } : { name: s.slice(0, i), arg: s.slice(i + 1) };
  }

  function remember() {
    const c = current();
    c.y = window.scrollY;
  }

  async function nav(route) {
    if (busy) return;
    const r = parse(route);
    if (r.name === 'home') return goHome();
    if (r.name === 'family') return goFamily();
    if (r.name === 'faqpage') { r.name = 'faq'; r.page = parseInt(r.arg, 10) || 1; r.arg = ''; }
    if (r.name === 'doc' && r.arg.includes(':')) { const [id, pg] = r.arg.split(':'); r.arg = id; r.page = parseInt(pg, 10) || 1; }
    if (r.name === 'events' && r.arg) { pendingEvent = r.arg; r.arg = ''; }
    const c = current();
    if (c.name === r.name && (c.name === 'map' || (c.arg || '') === (r.arg || '')) && !r.page) {   // уже здесь — просто наверх
      window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      return;
    }
    remember();
    if (c.name === 'ok') stack.pop();       // экран «Принято!» в истории не держим
    stack.push(r);
    await transition('fwd');
  }

  async function goBack() {
    if (document.body.classList.contains('menu-open')) return closeMenu();
    if (tourOn) return endTour();
    if (busy) return;
    if (stack.length > 1) {
      remember();
      stack.pop();
      await transition('back');
    } else if (tg) {
      tg.close();
    }
  }

  async function goHome(opts = {}) {
    if (busy) return;
    if (stack.length === 1 && current().name === 'home') {
      if (opts.scrollTo) scrollToEl(opts.scrollTo);
      else window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      return;
    }
    remember();
    stack = [{ name: 'home', arg: '', y: opts.scrollTo ? -1 : 0 }];
    await transition('back');
    if (opts.scrollTo) scrollToEl(opts.scrollTo, true);
  }

  function goFamily() { goHome({ scrollTo: '#family' }); }

  function scrollToEl(sel, instant) {
    const el = $(sel);
    if (!el) return;
    const extra = sel === '#family' ? -(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 56) : 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + extra, behavior: instant || REDUCED ? 'auto' : 'smooth' });
  }

  // Переход между экранами: короткое затухание содержимого и плавное появление нового.
  // Без шторок и полос сверху — шапка и нижняя панель остаются на месте.
  let transId = 0;
  async function transition(dir) {
    const my = ++transId;
    busy = true;
    if (REDUCED || !booted) { paint(); busy = false; return; }
    view.classList.add('leave');
    await wait(110);
    if (my !== transId) return;
    paint();
    view.dataset.dir = dir;
    view.classList.remove('leave');
    busy = false;
  }

  // Аппаратная «назад» на Android: держим одну запись в истории и возвращаем её.
  try {
    history.replaceState({ app: 0 }, '');
    history.pushState({ app: 1 }, '');
    window.addEventListener('popstate', () => {
      history.pushState({ app: 1 }, '');
      if (document.body.classList.contains('menu-open') || tourOn || stack.length > 1) goBack();
      else if (tg) tg.close();
    });
  } catch (e) {}

  /* ---------------- Отрисовка ---------------- */

  let fx = [];          // эффекты, которые считаются на каждом кадре скролла
  let io = null;        // наблюдатель появления
  let pageIo = null;
  let lazyIo = null;
  let deferReveal = false;

  function paint() {
    const c = current();
    let html;
    if (c.name === 'form') html = S.form(c.arg);
    else if (c.name === 'ok') html = S.ok(c.arg);
    else if (c.name === 'doc') html = S.doc(c.arg);
    else if (S[c.name] && c.name !== 'home') html = S[c.name](c.arg);
    else { c.name = 'home'; html = S.home(); }

    [io, pageIo, lazyIo].forEach((o) => o && o.disconnect());
    fx = [];
    questMark(c.name);
    view.innerHTML = html;
    view.dataset.screen = c.name;

    const isHome = c.name === 'home';
    const title = isHome ? '' : (c.name === 'form' ? FORMS[c.arg]?.rail : (c.name === 'doc' ? (DOCS[c.arg]?.title || 'Документ') : TITLES[c.name])) || '';
    const t = $('#topTitle');
    t.textContent = title;
    t.classList.toggle('on', !isHome);
    $('#top').classList.remove('hide');
    if (tg) { stack.length > 1 ? tg.BackButton.show() : tg.BackButton.hide(); }

    $$('[data-split]', view).forEach(splitText);
    fitTitles();
    setupReveal();
    if (isHome) setupHome();
    if (c.name === 'faq') setupReader(FAQ_PAGES, true, 'assets/faq/');
    if (c.name === 'doc' && DOCS[c.arg]) setupReader(DOCS[c.arg].pages, false, `assets/docs/${DOCS[c.arg].slug}/`);
    if (c.name === 'form') wireForm(c.arg);
    if (c.name === 'map') setupMap();
    if (c.name === 'my') setupMy();
    if (c.name === 'events' && pendingEvent) {
      const el = $(`[data-ev="${pendingEvent}"]`);
      pendingEvent = '';
      if (el) setTimeout(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }, 60);
    }
    if (c.name === 'search') setupSearchScreen();
    if (c.name === 'admin') setupAdmin();
    track('screen', c.name === 'form' ? 'form:' + c.arg : c.name);
    requestAnimationFrame(measure);
    setTimeout(measure, 1200);
    if (c.name === 'ok') burst();

    fx.push(globalFx);
    // вернуть на то же место
    if (c.name === 'faq' || c.name === 'doc') {
      const p = c.page || 1;
      requestAnimationFrame(() => { if (p > 1) jumpToPage(p); else window.scrollTo(0, 0); });
    } else if (c.y > 0) {
      requestAnimationFrame(() => window.scrollTo(0, c.y));
    } else if (c.y !== -1) {
      window.scrollTo(0, 0);
    }
    onScroll();
  }

  /* ---------------- Заголовки не должны вылезать за край ---------------- */
  // Широкий гротеск (TD Mars / Unbounded) не переносит длинные слова —
  // уменьшаем кегль, пока самое длинное слово не влезет в строку.
  const FIT = '.page__title,.hero__title,.sec__title,.fam__title,.cta__title,.fcard__title,.ok__title,.note-card__t,.chant__l,.adm-title,.stk__t';
  function fitTitles(root = view) {
    $$(FIT, root).forEach((el) => {
      el.style.fontSize = '';
      const avail = el.clientWidth - (parseFloat(getComputedStyle(el).paddingRight) || 0);
      if (!avail) return;
      let fs = parseFloat(getComputedStyle(el).fontSize);
      const words = $$('.w', el);
      const widest = () => Math.max(el.scrollWidth - (el.scrollWidth > el.clientWidth ? 0 : el.scrollWidth), ...(words.length ? words.map((w) => w.scrollWidth) : [el.scrollWidth]), ...$$('.noSplit', el).map((w) => w.scrollWidth));
      let guard = 40;
      const minFs = el.classList.contains('stk__t') ? 9 : 15;
      while (widest() > avail && fs > minFs && guard--) {
        fs -= 1.5;
        el.style.fontSize = `${fs}px`;
      }
    });
    $$('.badge__ava > span', root).forEach((sp) => {     // инициалы в квадрате: широкие буквы (ММ, ЖШ) уменьшаем
      const box = sp.parentNode; box.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(box).fontSize), guard = 20;
      while (sp.offsetWidth > box.clientWidth - 12 && fs > 12 && guard--) { fs -= 1; box.style.fontSize = `${fs}px`; }
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitTitles());
  window.addEventListener('resize', () => fitTitles());

  /* ---------------- Появление на скролле ---------------- */

  function setupReveal() {
    const targets = $$('.rv,.rv-l,.rv-clip,.rv-pop,.stk-wrap,[data-split],.fcard,.foot,.hero__script,.sec,.manifesto', view);
    if (REDUCED || !('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('in')); return; }
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    if (deferReveal) return;
    targets.forEach((el) => { if (!el.closest('#chant .chant__l')) io.observe(el); });
  }

  function releaseReveal() {
    deferReveal = false;
    if (!io) return;
    $$('.rv,.rv-l,.rv-clip,.rv-pop,.stk-wrap,[data-split],.fcard,.foot,.hero__script,.sec,.manifesto', view)
      .forEach((el) => { if (!el.closest('#chant .chant__l')) io.observe(el); });
  }

  /* ---------------- Эффекты скролла ---------------- */

  let lastY = 0, ticking = false, maxScroll = 1;
  const measure = () => { maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight); };
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      const vh = window.innerHeight;
      fx.forEach((f) => f(y, vh, dy));
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measure(); onScroll(); });

  const progressEl = $('#progress');
  const topEl = $('#top');
  function globalFx(y, vh, dy) {
    progressEl.style.transform = `scaleX(${clamp(y / maxScroll)})`;
    if (y < 80 || dy < -4) topEl.classList.remove('hide');
    else if (dy > 6) topEl.classList.add('hide');
  }

  function setupQuest() {
    const box = $('#quest');
    if (!box) return;
    const done = questDone();
    const seen = Number(store.get('nab_quest_seen') || 0);
    if (done > seen) {
      // новый шаг пройден — полоска «дорастает» у человека на глазах
      const bars = $$('.stage__bars i', box);
      bars.forEach((b, i) => { if (i >= seen && i < done) b.classList.add('grow'); });
      store.set('nab_quest_seen', String(done));
      setTimeout(() => {
        haptic('success');
        toast(done >= QUEST.length ? '3 из 3! Все разделы открыты — ты в теме ✦' : `Шаг ${done} из ${QUEST.length} пройден ✦`);
        if (done >= QUEST.length) burst();
      }, 900);
    }
  }

  function setupHome() {
    setupQuest();
    fillHome();
    const chant = $('#chant');
    if (chant && 'IntersectionObserver' in window && !REDUCED) {
      const cio = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        chant.classList.add('go');
        $$('[data-split]', chant).forEach((el) => el.classList.add('in'));
        setTimeout(() => haptic('heavy'), 1000);
        cio.disconnect();
      }), { threshold: 0.45 });
      cio.observe(chant);
    } else if (chant) { chant.classList.add('go'); }
    // манифест загорается волной, когда доходит до экрана
    const mf = $('#mf');
    if (mf && 'IntersectionObserver' in window && !REDUCED) {
      const mio = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        $$('.mf__w', mf).forEach((w) => w.classList.add('lit'));
        mio.disconnect();
      }), { threshold: 0.2 });
      mio.observe(mf);
    } else if (mf) { $$('.mf__w', mf).forEach((w) => w.classList.add('lit')); }
    watchAnims();
  }

  // бесконечные анимации (бегущие строки, звёздочка) работают только на экране
  let animIo = null;
  function watchAnims() {
    if (animIo) animIo.disconnect();
    if (!('IntersectionObserver' in window)) return;
    animIo = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('off', !e.isIntersecting)), { rootMargin: '60px 0px' });
    $$('[data-anim]', view).forEach((el) => { el.classList.add('off'); animIo.observe(el); });
  }

  /* ---------------- Читалка ---------------- */

  function jumpToPage(n, flash) {
    const el = $(`.pg[data-p="${n}"]`, view);
    if (!el) return;
    const off = $('#chapters') ? 110 : 70;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off);
    if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  /* ---------------- Живые ссылки и поиск в листалке ---------------- */

  const jsonCache = {};
  function getJSON(url) {
    if (!jsonCache[url]) {
      jsonCache[url] = fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    }
    return jsonCache[url];
  }

  function openHref(href, pageEl) {
    if (href.startsWith('#page=')) {
      const n = parseInt(href.slice(6), 10) || 1;
      haptic('light');
      jumpToPage(n, true);
      return;
    }
    if (href.startsWith('mailto:')) {
      const mail = href.slice(7).split('?')[0];
      const done = () => toast(`Почта ${mail} скопирована — вставь её в своё почтовое приложение`);
      try { navigator.clipboard.writeText(mail).then(done, () => toast(`Почта: ${mail}`)); } catch (e) { toast(`Почта: ${mail}`); }
      haptic('success');
      return;
    }
    haptic('medium');
    openLink(href);
  }

  function linkLabel(href) {
    if (href.startsWith('#page=')) return `Перейти на страницу ${href.slice(6)}`;
    if (href.startsWith('mailto:')) return `Почта ${href.slice(7)}`;
    return `Открыть ${href.replace(/^https?:\/\//, '')}`;
  }

  function addHotspots(links) {
    if (!links) return;
    Object.keys(links).forEach((pageNum) => {
      const pg = $(`.pg[data-p="${pageNum}"]`, view);
      if (!pg) return;
      links[pageNum].forEach(([x, y, w, h, href]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hot' + (href.startsWith('#page=') ? ' hot--nav' : href.startsWith('mailto:') ? ' hot--mail' : ' hot--ext');
        b.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%`;
        b.setAttribute('aria-label', linkLabel(href));
        b.dataset.href = href;
        pg.appendChild(b);
      });
    });
  }

  const normQ = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е');
  function setupSearch(texts, total) {
    const input = $('#rq', view), box = $('#rres', view), x = $('#rqx', view);
    if (!input || !texts) { if (input) input.closest('.search').hidden = true; return; }
    let timer = null;
    const run = () => {
      const q = normQ(input.value).trim();
      x.hidden = !q;
      if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
      const words = q.split(/\s+/).filter(Boolean);
      const hits = [];
      texts.forEach((t, i) => {
        const n = normQ(t);
        if (!words.every((w) => n.includes(w))) return;
        const at = n.indexOf(words[0]);
        const raw = t.replace(/\s+/g, ' ');
        const from = Math.max(0, at - 50);
        let snip = (from ? '…' : '') + raw.slice(from, at + 90) + '…';
        snip = esc(snip);
        words.forEach((w) => {
          const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]'), 'gi');
          snip = snip.replace(re, (m) => `<mark>${m}</mark>`);
        });
        const head = esc((t.split('\n')[0] || '').trim());
        hits.push({ p: i + 1, head, snip });
      });
      box.hidden = false;
      box.innerHTML = hits.length
        ? hits.slice(0, 8).map((h) => `<button type="button" class="res" data-page="${h.p}"><span class="res__p">стр. ${h.p}</span><span class="res__h">${h.head}</span><span class="res__s">${h.snip}</span></button>`).join('')
          + (hits.length > 8 ? `<p class="res__more">и ещё ${hits.length - 8} — уточни запрос</p>` : '')
        : '<p class="res__none">Ничего не нашлось. Попробуй другое слово — например, «пересдача» или «справка».</p>';
      $$('.res', box).forEach((b) => b.addEventListener('click', () => { haptic('light'); jumpToPage(Number(b.dataset.page), true); }));
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 140); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); run(); } });
    x.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
    void total;
  }

  function setupReader(total, isFaq, base) {
    getJSON(base + 'links.json').then((links) => { if (current().name === (isFaq ? 'faq' : 'doc')) addHotspots(links); });
    getJSON(base + 'text.json').then((texts) => { if (current().name === (isFaq ? 'faq' : 'doc')) setupSearch(texts, total); });
    const pagesBox = $('#pages', view);
    pagesBox.addEventListener('click', (e) => {
      const hot = e.target.closest('.hot');
      if (!hot) return;
      hot.classList.add('hit');
      setTimeout(() => hot.classList.remove('hit'), 500);
      openHref(hot.dataset.href, hot.closest('.pg'));
    });

    const pages = $$('.pg', view);
    const pos = $('#hudPos');
    const range = $('#hudRange');
    const chips = isFaq ? $$('#chapters .chip', view) : [];

    const load = (pg) => {
      const img = pg.querySelector('img');
      if (!img || img.src) return;
      img.onload = () => {
        pg.classList.add('ok');
        if (img.naturalWidth) pg.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(4));
        pg.style.aspectRatio = 'auto';
      };
      img.onerror = () => pg.classList.add('ok');
      img.src = img.dataset.src;
    };
    if ('IntersectionObserver' in window) {
      lazyIo = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { load(e.target); lazyIo.unobserve(e.target); } }),
        { rootMargin: '1400px 0px' });
      pages.forEach((p) => lazyIo.observe(p));
    } else pages.forEach(load);

    let cur = 0;
    const setCur = (n) => {
      if (n === cur && pos.textContent.startsWith(n + ' ')) return;
      cur = n;
      current().page = n;
      pos.textContent = `${n} / ${total}`;
      if (document.activeElement !== range) range.value = n;
      if (chips.length) {
        let idx = 0;
        FAQ_CHAPTERS.forEach((c, i) => { if (n >= c.from) idx = i; });
        chips.forEach((ch, i) => {
          const on = i === idx;
          if (on && !ch.classList.contains('on')) ch.scrollIntoView({ inline: 'center', block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
          ch.classList.toggle('on', on);
        });
      }
    };
    if ('IntersectionObserver' in window) {
      pageIo = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setCur(Number(e.target.dataset.p)); }),
        { rootMargin: '-40% 0px -59% 0px' });
      pages.forEach((p) => pageIo.observe(p));
    }
    setCur(current().page || 1);

    range.addEventListener('input', () => { pos.textContent = `${range.value} / ${total}`; haptic('select'); });
    range.addEventListener('change', () => { const n = Number(range.value); jumpToPage(n); setCur(n); });
    chips.forEach((ch) => ch.addEventListener('click', () => { haptic('light'); const n = Number(ch.dataset.page); jumpToPage(n); setCur(n); }));
  }

  /* ---------------- Нажатия: физика кнопок ---------------- */

  const PRESSABLE = '.stk,.btn,.ticket,.chip,.lnk,.dock__pill,.stage__go';
  let pressed = null;

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(PRESSABLE);
    if (!el) return;
    pressed = el;
    el.classList.add('press');
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (el.classList.contains('lnk')) { el.style.setProperty('--cx', `${x}px`); el.style.setProperty('--cy', `${y}px`); }
    if (!REDUCED && (el.classList.contains('stk') || el.classList.contains('btn') || el.classList.contains('ticket'))) {
      const rp = document.createElement('span');
      rp.className = 'ripple';
      rp.style.left = `${x}px`;
      rp.style.top = `${y}px`;
      el.appendChild(rp);
      setTimeout(() => rp.remove(), 750);
    }
  }, { passive: true });

  const release = () => {
    if (!pressed) return;
    const el = pressed;
    pressed = null;
    el.classList.remove('press');
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  // короткая «заливка» перед действием — чтобы нажатие было видно
  function hit(el, fn, delay = 70) {
    el.classList.add('hit');
    haptic(el.classList.contains('stk--sos') ? 'heavy' : 'medium');
    setTimeout(() => { fn(); setTimeout(() => el.classList.remove('hit'), 350); }, REDUCED ? 0 : Math.min(delay, 90));
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go],[data-link],[data-back],[data-home],[data-senddoc],[data-act]');
    if (!el || busy) return;
    if (el.closest('#menu') || el.closest('#tour')) return;
    if (el.dataset.back) { haptic('light'); goBack(); return; }
    if (el.dataset.home) { hit(el, () => goHome()); return; }
    if (el.dataset.go) { hit(el, () => nav(el.dataset.go)); return; }
    if (el.dataset.link) { hit(el, () => openLink(el.dataset.link), 260); return; }
    if (el.dataset.senddoc) { hit(el, () => sendDoc(el.dataset.senddoc, el), 120); return; }
    const act = el.dataset.act;
    if (act === 'faqpdf') hit(el, () => sendFaq(el), 120);
    else if (act === 'top') { haptic('light'); window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }); }
  });

  async function sendDoc(id, el) {
    if (!requireTelegram()) return;
    busyBtn(el, true);
    try {
      const r = await api('/doc', { initData, id });
      haptic('success');
      toast(r.message || 'Документ отправлен в чат с ботом 📄');
    } catch (e) { showApiError(e); } finally { busyBtn(el, false); }
  }

  async function sendFaq(el) {
    if (!requireTelegram()) return;
    busyBtn(el, true);
    try {
      const r = await api('/faq', { initData });
      haptic('success');
      toast(r.message || 'PDF отправлен в чат с ботом 📄');
    } catch (e) { showApiError(e); } finally { busyBtn(el, false); }
  }

  function busyBtn(el, on) {
    if (!el || !el.classList.contains('btn')) return;
    if (on && !el.querySelector('.spin-ast')) el.insertAdjacentHTML('beforeend', '<i class="ast spin-ast"></i>');
    el.classList.toggle('busy', on);
    el.disabled = on;
  }

  /* ---------------- Нижняя панель и меню ---------------- */

  renderMenu();

  function openMenu() {
    document.body.classList.add('menu-open', 'lock');
    $('#menu').setAttribute('aria-hidden', 'false');
    if (tg) tg.BackButton.show();
    haptic('medium');
  }
  function closeMenu() {
    document.body.classList.remove('menu-open', 'lock');
    $('#menu').setAttribute('aria-hidden', 'true');
    if (tg && stack.length === 1) tg.BackButton.hide();
  }
  $('#burger').addEventListener('click', () => (document.body.classList.contains('menu-open') ? closeMenu() : openMenu()));
  $('#menuClose').addEventListener('click', () => { haptic('light'); closeMenu(); });
  $('#menuList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-route]');
    if (!b) return;
    haptic('medium');
    closeMenu();
    setTimeout(() => nav(b.dataset.route), REDUCED ? 0 : 380);
  });
  $('#pill').addEventListener('click', (e) => {
    const el = e.currentTarget;
    if (document.body.classList.contains('menu-open')) closeMenu();
    hit(el, () => goHome(), 160);
  });
  $('#dockNab').addEventListener('click', () => {
    haptic('light');
    if (document.body.classList.contains('menu-open')) closeMenu();
    goFamily();
  });
  $('#topLogo').addEventListener('click', () => { haptic('light'); goHome(); });

  /* ---------------- Онбординг ---------------- */

  const TOUR = [
    { sel: '[data-tour="question"]', text: 'Тут все разделы бота — жми на любую наклейку. Например, задай вопрос руководству ССт: ответ придёт прямо в чат, можно анонимно.' },
    { sel: '[data-tour="repair"]', text: 'Что-то сломалось? Сфоткай, укажи аудиторию — передадим начальнику корпуса.' },
    { sel: '[data-tour="sos"]', text: 'Если случилось что-то серьёзное — жми тревожную кнопку. Сигнал сразу уйдёт руководству.' },
    { sel: '#burger', text: 'Меню всегда под рукой — отсюда можно попасть в любой раздел.' },
  ];
  let tourOn = false, tourStep = 0;

  function startTour() {
    if (tourOn || current().name !== 'home') return;
    tourOn = true;
    tourStep = 0;
    $('#tour').hidden = false;
    document.body.classList.add('lock');
    if (tg) tg.BackButton.show();
    $('#tourDots').innerHTML = TOUR.map(() => '<i></i>').join('');
    showStep();
  }

  async function showStep() {
    const myStep = tourStep;
    const s = TOUR[tourStep];
    const el = $(s.sel);
    if (!el) { endTour(); return; }
    const inDock = !!el.closest('#dock');
    if (!inDock) {
      document.body.classList.remove('lock');
      const r0 = el.getBoundingClientRect();
      const target = window.scrollY + r0.top - Math.max(80, (window.innerHeight - r0.height) / 2 - 60);
      window.scrollTo({ top: Math.max(0, target), behavior: REDUCED ? 'auto' : 'smooth' });
      await wait(REDUCED ? 30 : 520);
      if (!tourOn || tourStep !== myStep) return;   // тур закрыли или уже перешли дальше
    }
    document.body.classList.add('lock');
    const r = el.getBoundingClientRect();
    const pad = 8;
    const hole = $('#tourHole');
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const b = $('#tourBubble');
    $('#tourText').textContent = s.text;
    $$('#tourDots i').forEach((d, i) => d.classList.toggle('on', i === tourStep));
    $('#tourNext').textContent = tourStep === TOUR.length - 1 ? 'Понятно' : 'Дальше';
    const vh = window.innerHeight;
    const above = r.top > vh - r.bottom;
    b.dataset.pos = above ? 'above' : 'below';
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    requestAnimationFrame(() => {
      const bh = b.offsetHeight;
      const top = above ? r.top - pad - bh - 16 : r.bottom + pad + 16;
      b.style.top = `${clamp(top, 60, vh - bh - 10)}px`;
      const br = b.getBoundingClientRect();
      b.style.setProperty('--tx', `${clamp(r.left + r.width / 2 - br.left, 26, br.width - 26)}px`);
    });
    haptic('light');
  }

  function endTour() {
    tourOn = false;
    $('#tour').hidden = true;
    document.body.classList.remove('lock');
    store.set('nab_tour_v2', '1');
    if (tg && stack.length === 1) tg.BackButton.hide();
  }
  $('#tourNext').addEventListener('click', () => {
    if (tourStep < TOUR.length - 1) { tourStep++; showStep(); } else { haptic('success'); endTour(); }
  });
  $('#tourSkip').addEventListener('click', () => { haptic('light'); endTour(); });

  /* ---------------- Формы ---------------- */

  function wireForm(kind) {
    const f = FORMS[kind];
    if (!f) return;
    let anon = false;
    const photos = [];

    const seg = $('#seg', view);
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      anon = b.dataset.anon === '1';
      seg.dataset.v = anon ? '1' : '0';
      $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      haptic('select');
    }));

    const ta = $('#text', view);
    const cnt = $('#cnt', view);
    const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(130, ta.scrollHeight)}px`; };
    ta.addEventListener('input', () => { cnt.textContent = ta.value.length; grow(); });

    if (f.photos) {
      const grid = $('#photos', view);
      const input = $('#fileInput', view);
      const add = $('#addPhoto', view);
      add.addEventListener('click', () => { haptic('light'); input.click(); });
      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        input.value = '';
        for (const file of files) {
          if (photos.length >= 5) { toast('Максимум 5 фото', 'err'); break; }
          if (!file.type.startsWith('image/')) continue;
          try { photos.push(await compress(file)); } catch (e) { toast('Не удалось обработать фото', 'err'); }
        }
        draw();
        haptic('success');
      });
      const draw = () => {
        previewUrls.forEach((u) => URL.revokeObjectURL(u));
        previewUrls = photos.map((b) => URL.createObjectURL(b));
        grid.innerHTML = photos.map((b, i) => `<div class="ph"><img src="${previewUrls[i]}" alt=""><button type="button" data-i="${i}" aria-label="Удалить">×</button></div>`).join('');
        $$('button', grid).forEach((btn) => btn.addEventListener('click', () => { photos.splice(Number(btn.dataset.i), 1); draw(); haptic('light'); }));
        add.style.display = photos.length >= 5 ? 'none' : '';
      };
    }

    const submit = $('#submitBtn', view);
    submit.addEventListener('click', async () => {
      if (submit.classList.contains('busy')) return;
      if (!requireTelegram()) return;
      const text = ta.value.trim();
      const place = f.place ? ($('#place', view).value || '').trim() : '';
      if (!text && photos.length === 0) {
        haptic('error');
        toast(f.photos ? 'Добавь фото или опиши поломку' : 'Напиши текст обращения', 'err');
        ta.focus();
        return;
      }
      if (text && text.length < 5 && photos.length === 0) { haptic('error'); toast('Слишком коротко — опиши подробнее', 'err'); return; }

      const fd = new FormData();
      fd.append('initData', initData);
      fd.append('kind', kind);
      fd.append('text', text);
      fd.append('location', place);
      fd.append('anon', anon ? '1' : '0');
      photos.forEach((b, i) => fd.append('photos', b, `photo_${i + 1}.jpg`));

      submit.classList.add('hit', 'busy');
      haptic('medium');
      const formEntry = current();
      try {
        await api('/report', fd, true);
        haptic('success');
        if (current() === formEntry && !busy) {
          stack.pop();               // форму убираем из стека — «назад» ведёт туда, откуда пришли
          stack.push({ name: 'ok', arg: kind });
          await transition('fwd');
        } else {
          const at = stack.indexOf(formEntry);       // отправленную форму из истории убираем
          if (at > 0) stack.splice(at, 1);
          toast('Обращение отправлено ✦');   // человек уже на другом экране — не выдёргиваем его
        }
      } catch (e) {
        if (submit.isConnected) { showApiError(e); submit.classList.remove('hit', 'busy'); }
        else { haptic('error'); toast(`Обращение не отправлено: ${e.message}`, 'err'); }
      }
    });
  }

  let previewUrls = [];
  function compress(file, max = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  function burst() {
    if (REDUCED) return;
    const box = document.createElement('div');
    box.className = 'burst';
    const colors = ['var(--wine)', 'var(--mint)', 'var(--cream)', 'var(--sand)', 'var(--teal)'];
    let h = '';
    for (let i = 0; i < 26; i++) {
      const a = (Math.PI * 2 * i) / 26 + Math.random() * 0.4;
      const d = 90 + Math.random() * 150;
      h += `<i class="${i % 3 === 0 ? 'sq' : ''}" style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;--s:${10 + Math.random() * 18}px;--c:${colors[i % colors.length]};--rot:${Math.random() * 540 - 270}deg;--d:${0.2 + Math.random() * 0.2}s"></i>`;
    }
    box.innerHTML = h;
    view.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  }

  /* ---------------- Старт ---------------- */

  function startRoute() {
    // 1) deep-link бота: t.me/sprosinab_bot?startapp=faq  или  …/#/faq
    const sp = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
    const hash = (location.hash || '').replace(/^#\/?/, '');
    const raw = String(sp || hash).toLowerCase().replace(/[^a-z0-9_:/-]/g, '');
    const alias = { question: 'form:question', questions: 'form:question', initiative: 'form:initiative', repair: 'form:repair',
      panic: 'form:panic', sos: 'form:panic', npb: 'npb', faq: 'faq', groups: 'groups', contacts: 'contacts', family: 'family', map: 'map',
      my: 'my', events: 'events', polls: 'polls', search: 'search', admin: 'admin' };
    const key = raw.replace('/', ':').replace(/^form_/, '').replace(/^news_/, 'news:');
    if (/^news:\d+$/.test(key)) return key;
    return alias[key] || (FORMS[key.split(':')[1]] ? key : '');
  }

  function boot() {
    const route = startRoute();
    const skipIntro = REDUCED || store.get('nab_intro') === '1' || store.sget('nab_intro') === '1' || (route && route !== 'family');
    if (route && route !== 'family') stack.push(parse(route));

    if (skipIntro) {
      $('#intro').remove();
      paint();
      booted = true;
      if (route === 'family') goFamily();
      else maybeTour();
      return;
    }

    deferReveal = true;
    paint();
    store.sset('nab_intro', '1');
    store.set('nab_intro', '1');
    const cnt = $('#introCount'), bar = $('#introBar');
    const t0 = performance.now(), D = 650;
    const step = (t) => {
      const p = clamp((t - t0) / D);
      const e = 1 - Math.pow(1 - p, 3);
      cnt.textContent = Math.round(e * 100);
      bar.style.transform = `scaleX(${e})`;
      if (p < 1) requestAnimationFrame(step);
      else {
        setTimeout(() => {
          $('#intro').classList.add('out');
          haptic('soft');
          setTimeout(() => {
            releaseReveal();
            booted = true;
            if (route === 'family') goFamily(); else maybeTour();
          }, 250);
          setTimeout(() => $('#intro') && $('#intro').remove(), 600);
        }, 80);
      }
    };
    requestAnimationFrame(step);
  }

  function maybeTour() {
    if (store.get('nab_tour_v2') === '1' || current().name !== 'home') return;
    setTimeout(startTour, 900);
  }

  // для тестов и отладки
  window.__nab = { nav, goBack, goHome, stack: () => stack.map((s) => s.name + (s.arg ? ':' + s.arg : '')), startTour, endTour };

  boot();
})();
