/* =========================================================================
   «Спроси ССт НАБ» — Telegram Mini App Студсовета НАБ
   ─ Навигация: собственный стек экранов (history не используется для
     переходов — так «назад» работает внутри Telegram всегда).
   ─ Анимации: только transform / opacity / clip-path, всё на rAF.
   ─ API бота: /api/report, /api/doc, /api/faq (см. репозиторий nab-bot).
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
    const res = await fetch(`${API}/api${path}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
    });
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
    ['home', 'Главная'], ['npb', 'НПБ'], ['faq', 'FAQ'], ['form:question', 'Вопросы'],
    ['form:initiative', 'Инициатива'], ['form:repair', 'Поломки'], ['form:panic', 'Тревожная кнопка', 'is-sos'],
    ['map', 'Карта корпуса'], ['groups', 'Важные группы'], ['contacts', 'Контакты'], ['family', 'Больше, чем семья'],
  ];

  const TITLES = { npb: 'Нормативно-правовая база', faq: 'FAQ', doc: 'Документ', groups: 'Важные группы',
    contacts: 'Наши контакты', ok: 'Готово', map: 'Карта корпуса' };

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
      if (n === 'npb' || n === 'doc') paint();
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
      <div class="stk-wob"><button type="button" class="stk ${o.cls || ''}" data-go="${o.go}" ${o.tour ? `data-tour="${o.tour}"` : ''}>
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
      return `<div class="mq ${cls}"><div class="mq__skew"><div class="mq__track"><div class="mq__item">${one}</div><div class="mq__item">${one}</div></div></div></div>`;
    };

    const manifesto = 'Почему стоит пойти в ССт? Многие из нас задавались этим вопросом перед анкетой — и сомневались. А в итоге получили море эмоций, смеха и незабываемых моментов, опыт настоящих проектов, кучу новых знакомств и самое главное — *людей.* ССт — это место, которое навсегда запомнится счастливыми годами студенчества. Место, где можно учиться на ошибках и бесконечно пробовать новое. Место, где тебя *слышат,* и ты знаешь: с любой проблемой можно прийти к своим. Попробовать не страшно — страшно упустить свою возможность. Потому что это *семья.*';
    let acc = false;
    const mfHtml = manifesto.split(/\s+/).map((w) => {
      const start = w.startsWith('*');
      if (start) acc = true;
      const clean = w.replace(/\*/g, '');
      const html = `<span class="mf__w${acc ? ' acc' : ''}">${esc(clean)}</span>`;
      if (w.endsWith('*') || (w.includes('*') && !start)) acc = false;
      if (start && w.slice(1).includes('*')) acc = false;
      return html;
    }).join(' ');

    return `
    <section class="hero" id="hero">
      <div class="hero__grid"></div>
      <div class="hero__bgphoto" id="heroPhoto"></div>
      <div class="pix">
        <i style="--x:8%;--y:14%;--s:10px;--o:.22"></i><i style="--x:84%;--y:9%;--s:14px;--o:.14;--d:-2s"></i>
        <i style="--x:74%;--y:46%;--s:9px;--o:.2;--d:-4s"></i><i style="--x:6%;--y:58%;--s:16px;--o:.1;--d:-1s"></i>
        <i style="--x:90%;--y:70%;--s:12px;--o:.16;--d:-3s"></i>
      </div>
      <div class="hero__ast" id="heroAst"><i class="ast"></i></div>
      <div class="hero__row rv">
        <span class="kicker">${spark('', '--s:11px')} @sprosinab_bot</span>
        <span class="kicker kicker--ghost">сезон 26/27</span>
      </div>
      <h1 class="disp hero__title split-mask" data-split>Спроси<br><span class="line2">ССт НАБ</span></h1>
      <div class="hero__script rv" style="--d:.5s">
        <span class="scr hl">Здесь можно:</span>
        <i class="brush hero__brush"></i>
      </div>
      <p class="lead hero__lead rv" style="--d:.65s">Документы, FAQ, вопросы руководству, идеи и сообщения о поломках — всё в одном окне, прямо в Telegram.</p>
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

    <section class="sec sec--night">
      <div class="sec__head">
        <span class="kicker rv">${spark('', '--s:10px')} Главное</span>
        <h2 class="disp sec__title split-mask" data-split style="margin-top:12px">Что нового</h2>
      </div>
      <div class="fcards">
        <article class="fcard rv">
          <div class="fcard__photo"><img src="assets/brand/dance.webp" alt="Команда Студсовета НАБ танцует у корпуса" loading="lazy"></div>
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
            <img src="${faqThumb(1)}" alt="" style="--i:0;--x:-70px;--r:-12deg" loading="lazy">
            <img src="${faqThumb(14)}" alt="" style="--i:2;--x:70px;--r:11deg" loading="lazy">
            <img src="${faqThumb(3)}" alt="" style="--i:1;--x:0px;--r:-1deg" loading="lazy">
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
      <div class="fam__sticky" id="famSticky">
        <div class="fam__photo">
          <img class="bw" src="assets/brand/stage-bw.webp" alt="" loading="lazy">
          <img class="col" src="assets/brand/stage.webp" alt="Студенческий совет НАБ на сцене" loading="lazy">
          <div class="fam__shade"></div>
        </div>
        <div class="fam__frame"></div>
        <span class="fam__lbl">ССт НАБ · Финансовый университет</span>
        <div class="fam__ast"><i class="ast ast--spin"></i></div>
        <div class="fam__text">
          <span class="kicker fam__kick">${I.heart.replace('width="22" height="22"', 'width="12" height="12"')} наша команда</span>
          <h2 class="disp fam__title split-mask" id="famTitle" data-split>Студенческий совет НАБ —</h2>
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
        <img src="assets/brand/selfie.webp" alt="Команда ССт НАБ за кулисами" loading="lazy">
        <span class="scr">за кулисами ♡</span>
      </div>
      <div class="gap"></div><div class="gap"></div>
      <button type="button" class="btn btn--block rv" data-link="https://t.me/NABLABFU"><span class="btn__txt">Стать частью семьи</span> <span class="arr">${I.arr}</span></button>
    </section>

    <section class="chant" id="chant">
      <div class="chant__photo">
        <img class="bw" src="assets/brand/scene-bw.webp" alt="" loading="lazy">
        <img class="col" src="assets/brand/scene.webp" alt="Студсовет НАБ на сцене" loading="lazy">
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
          .map(([f, c], i) => `<figure class="gph${f === 'scene' ? ' gph--tall' : ''}" style="--r:${[-3, 2.5, -2, 3, -1.5][i]}deg">${i % 2 ? '' : '<i class="tape"></i>'}<img src="assets/brand/${f}.webp" alt="" loading="lazy"><figcaption class="scr">${c}</figcaption></figure>`).join('')}
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
    const rows = NPB.map(([id, title, sub], i) => {
      const d = DOCS[id];
      const has = d && d.pages;
      return `<button type="button" class="ticket ${i % 3 === 1 ? 'ticket--mint' : ''} rv" style="--d:${i * 0.05}s" ${has ? `data-go="doc:${id}"` : `data-senddoc="${id}"`}>
        <span class="ticket__n">${has ? `<img src="${docThumb(d.slug, 1)}" alt="" loading="lazy">` : pad2(id)}</span>
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
        <input type="search" id="roomQ" inputmode="text" placeholder="Номер аудитории: 412, 105-1…" autocomplete="off" enterkeyhint="search">
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
    window.addEventListener('resize', () => { if (current().name === 'map') cover(false); });

    mapReady.then((m) => {
      if (!m || current().name !== 'map') return;
      floors = m.floors;
      const start = floors.find((f) => f.id === current().arg) || floors.find((f) => f.id === '1') || floors[0];
      show(start.id);
    });
  }

  S.groups = () => `<div class="page">
      ${pageHead({ rail: 'Ресурсы', title: 'Важные', acc: 'группы', script: 'будь в курсе',
        lead: 'Все официальные ресурсы факультета и Студсовета — подписывайся, чтобы ничего не пропустить.' })}
      <div class="links">${GROUPS.map((g, i) => `<button type="button" class="lnk rv" style="--d:${i * 0.08}s" data-link="${g.u}">
        <span class="lnk__k">${esc(g.k)}</span>
        <span class="lnk__t">${esc(g.t)}</span>
        <span class="lnk__s">${esc(g.s)}</span>
        <span class="lnk__arr">${I.arr}</span></button>`).join('')}</div>
    </div>`;

  S.contacts = () => `<div class="page">
      ${pageHead({ rail: 'Контакты', title: 'Наши', acc: 'контакты', script: 'пиши смело',
        lead: 'Руководство Студенческого совета НАБ — можно написать напрямую.' })}
      <div class="badges">${PEOPLE.map((p, i) => `<article class="badge rv" style="--i:${i};--d:${i * 0.12}s">
        <div class="badge__row"><span class="badge__ava">${esc(p.ini)}</span>
          <span><span class="badge__role">${esc(p.role)}</span><div class="badge__name">${esc(p.name)}</div></span></div>
        <span class="scr">${esc(p.note)}</span>
        <div class="badge__btns">
          <a class="btn btn--sm btn--cream" href="tel:${p.tel.replace(/[^+\d]/g, '')}">${I.phone.replace('width="22" height="22"', 'width="15" height="15"')} Позвонить</a>
          <button type="button" class="btn btn--sm btn--wine" data-link="https://t.me/${p.tg}">${I.tg} Написать</button>
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
            <input class="inp" id="place" maxlength="200" placeholder="Например: Кибальчича, ауд. 206" autocomplete="off"><i class="line"></i></div>` : ''}
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
      <button type="button" class="btn btn--block" data-home="1"><span class="btn__txt">На главную</span></button>
      <div class="gap"></div>
      <button type="button" class="btn btn--ghost btn--block" data-go="form:${esc(kind)}"><span class="btn__txt">Отправить ещё одно</span></button>
    </div>`;
  };

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
    remember();
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
    const extra = sel === '#family' ? window.innerHeight * 0.95 : 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + extra, behavior: instant || REDUCED ? 'auto' : 'smooth' });
  }

  const curtain = $('#curtain');
  async function transition(dir) {
    busy = true;
    if (REDUCED || !booted) { paint(); busy = false; return; }
    curtain.className = 'curtain' + (dir === 'back' ? ' back' : '');
    void curtain.offsetWidth;
    curtain.classList.add('cover');
    await wait(360);
    paint();
    curtain.classList.remove('cover');
    curtain.classList.add('uncover');
    busy = false;
    await wait(440);
    curtain.className = 'curtain';
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
  const FIT = '.page__title,.hero__title,.sec__title,.fam__title,.cta__title,.fcard__title,.ok__title,.note-card__t';
  function fitTitles(root = view) {
    $$(FIT, root).forEach((el) => {
      el.style.fontSize = '';
      const avail = el.clientWidth - (parseFloat(getComputedStyle(el).paddingRight) || 0);
      if (!avail) return;
      let fs = parseFloat(getComputedStyle(el).fontSize);
      const words = $$('.w', el);
      const widest = () => (words.length ? Math.max(...words.map((w) => w.scrollWidth)) : el.scrollWidth);
      let guard = 40;
      while (widest() > avail && fs > 15 && guard--) {
        fs -= 1.5;
        el.style.fontSize = `${fs}px`;
      }
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
    targets.forEach((el) => { if (el.id !== 'famTitle' && !el.closest('#chant .chant__l')) io.observe(el); });
  }

  function releaseReveal() {
    deferReveal = false;
    if (!io) return;
    $$('.rv,.rv-l,.rv-clip,.rv-pop,.stk-wrap,[data-split],.fcard,.foot,.hero__script,.sec,.manifesto', view)
      .forEach((el) => { if (el.id !== 'famTitle' && !el.closest('#chant .chant__l')) io.observe(el); });
  }

  /* ---------------- Эффекты скролла ---------------- */

  let lastY = 0, vel = 0, ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      vel = lerp(vel, y - lastY, 0.35);
      const dy = y - lastY;
      lastY = y;
      const vh = window.innerHeight;
      fx.forEach((f) => f(y, vh, dy));
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  const progressEl = $('#progress');
  const topEl = $('#top');
  function globalFx(y, vh, dy) {
    const max = document.documentElement.scrollHeight - vh;
    progressEl.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;
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
    const chant = $('#chant');
    const gallery = $('#gallery');
    if (chant && 'IntersectionObserver' in window && !REDUCED) {
      const cio = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        chant.classList.add('go');
        $$('[data-split]', chant).forEach((el) => el.classList.add('in'));
        setTimeout(() => haptic('heavy'), 2300);
        cio.disconnect();
      }), { threshold: 0.45 });
      cio.observe(chant);
    } else if (chant) { chant.classList.add('go'); }
    if (gallery) {
      const tiltGallery = () => {
        const mid = window.innerWidth / 2;
        $$('.gph', gallery).forEach((f) => {
          const r = f.getBoundingClientRect();
          const k = clamp(((r.left + r.width / 2) - mid) / window.innerWidth, -1, 1);
          f.style.setProperty('--k', k.toFixed(3));
        });
      };
      gallery.addEventListener('scroll', () => requestAnimationFrame(tiltGallery), { passive: true });
      tiltGallery();
    }

    const heroAst = $('#heroAst');
    const heroPhoto = $('#heroPhoto');
    const tracks = $$('.mq__skew', view);
    const fam = $('#family');
    const sticky = $('#famSticky');
    const famTitle = $('#famTitle');
    const mf = $('#mf');
    const words = $$('.mf__w', mf);
    const cards = $$('.note-card', view);

    fx.push((y, vh) => {
      if (y < vh * 1.3) {
        heroAst.style.transform = `translateY(${y * 0.35}px) rotate(${y * 0.12}deg)`;
        heroPhoto.style.transform = `translateY(${y * -0.12}px) scale(${1 + y * 0.0002})`;
      }
      const sk = clamp(vel * 0.35, -10, 10);
      tracks.forEach((t) => { t.style.transform = `skewX(${-sk}deg)`; });

      // «Больше, чем семья»: фото раскрывается и оживает в цвете
      const r = fam.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        const p = clamp(-r.top / (r.height - vh));
        const open = smooth(0, 0.42, p);
        sticky.style.setProperty('--ci', `${lerp(24, 0, open)}%`);
        sticky.style.setProperty('--cx', `${lerp(9, 0, open)}%`);
        sticky.style.setProperty('--cr', `${lerp(30, 0, open)}px`);
        sticky.style.setProperty('--ps', lerp(1.18, 1.02, p).toFixed(3));
        sticky.style.setProperty('--py', `${lerp(0, -3, p)}%`);
        sticky.style.setProperty('--co', smooth(0.5, 0.8, p).toFixed(3));
        sticky.style.setProperty('--so', lerp(0.45, 1, smooth(0.2, 0.5, p)).toFixed(3));
        sticky.style.setProperty('--t1', smooth(0.28, 0.4, p).toFixed(3));
        sticky.style.setProperty('--t2', smooth(0.34, 0.55, p).toFixed(3));
        sticky.style.setProperty('--t3', smooth(0.5, 0.72, p).toFixed(3));
        famTitle.classList.toggle('in', p > 0.32);
      }

      // манифест: слова загораются по мере чтения
      const mr = mf.getBoundingClientRect();
      if (mr.top < vh && mr.bottom > 0) {
        const p = clamp((vh * 0.82 - mr.top) / (mr.height + vh * 0.1));
        const lit = Math.round(p * words.length);
        words.forEach((w, i) => w.classList.toggle('lit', i < lit));
      }

      // стопка карточек: предыдущая уходит вглубь
      for (let i = 0; i < cards.length - 1; i++) {
        const a = cards[i].getBoundingClientRect();
        const b = cards[i + 1].getBoundingClientRect();
        const k = clamp(1 - (b.top - a.top) / Math.max(a.height, 1));
        cards[i].style.transform = `scale(${1 - k * 0.07})`;
        cards[i].style.filter = `brightness(${1 - k * 0.28})`;
      }
    });
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
    if (el.classList.contains('stk')) tilt(el, e);
  }, { passive: true });

  function tilt(el, e) {
    if (REDUCED) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty('--tx', `${nx * 7}deg`);
    el.style.setProperty('--ty', `${-ny * 7}deg`);
  }
  document.addEventListener('pointermove', (e) => { if (pressed && pressed.classList.contains('stk')) tilt(pressed, e); }, { passive: true });
  const release = () => {
    if (!pressed) return;
    const el = pressed;
    pressed = null;
    el.classList.remove('press');
    el.style.removeProperty('--tx');
    el.style.removeProperty('--ty');
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  // «магнит» для наклеек на компьютере
  if (window.matchMedia && matchMedia('(hover: hover)').matches && !REDUCED) {
    document.addEventListener('mousemove', (e) => {
      const el = e.target.closest('.stk');
      $$('.stk.mag', view).forEach((s) => { if (s !== el) { s.classList.remove('mag'); s.style.removeProperty('--px'); s.style.removeProperty('--py'); } });
      if (!el || el.classList.contains('press')) return;
      const r = el.getBoundingClientRect();
      el.classList.add('mag');
      el.style.setProperty('--px', `${((e.clientX - r.left) / r.width - 0.5) * 8}px`);
      el.style.setProperty('--py', `${((e.clientY - r.top) / r.height - 0.5) * 8}px`);
    });
  }

  // короткая «заливка» перед действием — чтобы нажатие было видно
  function hit(el, fn, delay = 190) {
    el.classList.add('hit');
    haptic(el.classList.contains('stk--sos') ? 'heavy' : 'medium');
    setTimeout(() => { fn(); setTimeout(() => el.classList.remove('hit'), 450); }, REDUCED ? 0 : delay);
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

  $('#menuList').innerHTML = MENU.map(([r, t, cls], i) =>
    `<li><button type="button" class="${cls || ''}" data-route="${r}" style="--i:${i}"><span class="menu__num">${pad2(i + 1)}</span><span class="menu__t">${esc(t)}</span></button></li>`).join('');

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
      document.body.classList.add('lock');
    }
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
        grid.innerHTML = photos.map((b, i) => `<div class="ph"><img src="${URL.createObjectURL(b)}" alt=""><button type="button" data-i="${i}" aria-label="Удалить">×</button></div>`).join('');
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
      try {
        await api('/report', fd, true);
        haptic('success');
        stack.pop();                 // форму убираем из стека — «назад» ведёт туда, откуда пришли
        stack.push({ name: 'ok', arg: kind });
        await transition('fwd');
      } catch (e) {
        showApiError(e);
        submit.classList.remove('hit', 'busy');
      }
    });
  }

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
    const raw = String(sp || hash).toLowerCase().replace(/[^a-z_:/-]/g, '');
    const alias = { question: 'form:question', questions: 'form:question', initiative: 'form:initiative', repair: 'form:repair',
      panic: 'form:panic', sos: 'form:panic', npb: 'npb', faq: 'faq', groups: 'groups', contacts: 'contacts', family: 'family', map: 'map' };
    const key = raw.replace('/', ':').replace(/^form_/, '');
    return alias[key] || (FORMS[key.split(':')[1]] ? key : '');
  }

  function boot() {
    const route = startRoute();
    const skipIntro = REDUCED || store.sget('nab_intro') === '1' || (route && route !== 'family');
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
    const cnt = $('#introCount'), bar = $('#introBar');
    const t0 = performance.now(), D = 1500;
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
          }, 380);
          setTimeout(() => $('#intro') && $('#intro').remove(), 1000);
        }, 250);
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
