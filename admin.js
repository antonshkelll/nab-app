/* =========================================================================
   Пульт руководства ССт НАБ — грузится только у администраторов.
   Обзор и метрики · обращения · новости · анонсы с явкой · опросы ·
   группы, контакты и документы · рассылка, сводка, выгрузка, настройки.
   ========================================================================= */
(() => {
  'use strict';

  let N = null;            // общие помощники из app.js
  let root = null;
  const st = { tab: 'overview', filter: 'open', kind: '', q: '', days: 30, edit: null };
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => Array.from(r.querySelectorAll(s));

  const TABS = [
    ['overview', 'Обзор'], ['reports', 'Обращения'], ['news', 'Новости'], ['events', 'Анонсы'],
    ['polls', 'Опросы'], ['content', 'Группы и документы'], ['more', 'Рассылка и отчёты'],
  ];
  const KIND = { question: ['❓', 'Вопросы'], initiative: ['💡', 'Инициативы'], panic: ['🚨', 'SOS'], repair: ['🛠', 'Поломки'] };
  const SCREEN = { home: 'Главная', faq: 'FAQ', npb: 'НПБ', doc: 'Документ', map: 'Карта', search: 'Поиск', my: 'Мои обращения',
    events: 'Анонсы', polls: 'Опросы', news: 'Новость', groups: 'Группы', contacts: 'Контакты', admin: 'Пульт', ok: 'Отправлено',
    'form:question': 'Форма вопроса', 'form:initiative': 'Форма инициативы', 'form:repair': 'Форма поломки', 'form:panic': 'Тревожная кнопка' };
  const PLATFORM = { ios: 'iPhone', android: 'Android', tdesktop: 'Telegram Desktop', macos: 'Mac', weba: 'Веб', webk: 'Веб', web: 'Браузер' };

  function mount(el, helpers) {
    N = helpers;
    root = el;
    root.innerHTML = `
      <div class="adm-head">
        <button type="button" class="back" data-back="1">${N.I.back} Назад</button>
        <h1 class="disp adm-title">Пульт <span>ССт НАБ</span></h1>
        <span class="scr adm-script">всё под рукой</span>
      </div>
      <nav class="adm-tabs" id="admTabs">${TABS.map(([id, t]) => `<button type="button" class="adm-tab${id === st.tab ? ' on' : ''}" data-tab="${id}">${t}</button>`).join('')}</nav>
      <div id="adm"></div>`;
    $('#admTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b || b.classList.contains('on')) return;
      N.haptic('select');
      st.tab = b.dataset.tab;
      st.edit = null;
      $$('.adm-tab').forEach((x) => x.classList.toggle('on', x === b));
      b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      render();
    });
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    render();
  }

  const box = () => $('#adm');
  const loading = () => { box().innerHTML = '<div class="adm-load"><i class="ast"></i></div>'; };
  const esc = (s) => N.esc(s);
  const fail = (e) => N.showApiError(e);

  async function call(path, body, btn) {
    if (btn) N.busyBtn(btn, true);
    try { return await N.api(path, body || {}); } catch (e) { fail(e); return null; } finally { if (btn) N.busyBtn(btn, false); }
  }

  function render() {
    window.scrollTo(0, 0);
    loading();
    N.track('screen', 'admin:' + st.tab);
    ({ overview, reports, news, events, polls, content, more })[st.tab]();
  }

  /* ---------------------------------------------------------------- обзор */

  async function overview() {
    const r = await call('/admin/summary', { days: st.days });
    if (!r || st.tab !== 'overview') return;
    const d = r.data;
    const rp = d.reports;
    const max = Math.max(1, ...d.series.map((x) => x.n));
    const fmtH = (h) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} мин` : h < 48 ? `${h} ч` : `${Math.round(h / 24)} дн`);
    const bars = (list, total, label = (k) => k) => list.length ? list.map((x) => `
        <div class="hbar"><span class="hbar__k">${esc(label(x.key) || '—')}</span><span class="hbar__v">${x.n}</span>
        <i style="--w:${Math.round((x.n * 100) / Math.max(1, total || list[0].n))}%"></i></div>`).join('') : '<p class="adm-mute">Пока нет данных</p>';
    const ratingsTotal = Object.values(rp.ratings).reduce((a, b) => a + b, 0);
    box().innerHTML = `
      <div class="seg3" id="days">${[7, 30, 90].map((n) => `<button type="button" class="${n === st.days ? 'on' : ''}" data-days="${n}">${n} дней</button>`).join('')}</div>
      <div class="kpis">
        ${kpi('Пользователей', d.users.total, `+${d.users.new7} за неделю`)}
        ${kpi('Сегодня', d.active.today, 'уникальных')}
        ${kpi('За неделю', d.active.week, 'уникальных')}
        ${kpi('За месяц', d.active.month, 'уникальных')}
        ${kpi('Открыто', rp.open, rp.unowned ? `${rp.unowned} без ответственного` : 'все разобраны', rp.unowned ? 'warn' : '')}
        ${kpi('Просрочено', rp.overdue, `дольше ${r.settings.slaHours} ч`, rp.overdue ? 'bad' : '')}
        ${kpi('Оценка', rp.avgRating == null ? '—' : rp.avgRating.toFixed(1), `${ratingsTotal} оценок`, '', rp.avgRating ? N.starRow(Math.round(rp.avgRating), 'stars--sm') : '')}
        ${kpi('До ответа', fmtH(rp.avgTakeH), `решено в ср. за ${fmtH(rp.avgSolveH)}`)}
      </div>

      <section class="acard">
        <h3 class="acard__h">Активность в приложении</h3>
        <p class="adm-mute">Уникальные посетители по дням · всего открытий за период: <b>${d.series.reduce((a, x) => a + x.opens, 0)}</b></p>
        <div class="vbars">${d.series.map((x) => `<i style="--h:${Math.round((x.n * 100) / max)}%" title="${x.day}: ${x.n}"><b>${x.n || ''}</b></i>`).join('')}</div>
        <div class="vbars__axis"><span>${d.series[0].day.slice(5).split('-').reverse().join('.')}</span><span>сегодня</span></div>
      </section>

      <section class="acard">
        <h3 class="acard__h">Обращения за ${d.days} дней · ${rp.total}</h3>
        <div class="kinds">${Object.entries(KIND).map(([k, [ic, t]]) => `<div><b>${ic} ${rp.byKind[k] || 0}</b><span>${t}</span></div>`).join('')}</div>
        <div class="kinds kinds--st"><div><b>${rp.byStatus.new}</b><span>новые</span></div><div><b>${rp.byStatus.work}</b><span>в работе</span></div>
          <div><b>${rp.byStatus.done}</b><span>решено</span></div><div><b>${rp.anon}</b><span>анонимно</span></div></div>
        ${ratingsTotal ? `<h4 class="acard__sub">Оценки после решения</h4>${[5, 4, 3, 2, 1].map((i) => `<div class="hbar"><span class="hbar__k">${N.starRow(i, 'stars--sm')}</span><span class="hbar__v">${rp.ratings[i]}</span><i style="--w:${Math.round((rp.ratings[i] * 100) / ratingsTotal)}%"></i></div>`).join('')}` : ''}
        ${rp.reviews.length ? `<h4 class="acard__sub">Последние отзывы</h4>${rp.reviews.map((v) => `<blockquote class="review">${N.starRow(v.rating || 0, 'stars--sm')} <b>№${v.id}</b><br>${esc(v.text)}</blockquote>`).join('')}` : ''}
      </section>

      <section class="acard"><h3 class="acard__h">Что открывают</h3>${bars(d.screens, 0, (k) => SCREEN[k] || k)}</section>
      <section class="acard"><h3 class="acard__h">Что ищут</h3>${bars(d.searches)}
        ${d.searchEmpty.length ? `<h4 class="acard__sub">Искали, но не нашли — стоит добавить в FAQ</h4>${bars(d.searchEmpty)}` : ''}</section>
      <section class="acard"><h3 class="acard__h">Кнопки в чате с ботом</h3>${bars(d.botButtons)}</section>
      <section class="acard"><h3 class="acard__h">Устройства</h3>${bars(d.platforms, 0, (k) => PLATFORM[k] || k)}
        <p class="adm-mute" style="margin-top:12px">Явка: «приду» отмечали ${d.rsvp.yes} раз, «не приду» — ${d.rsvp.no}. Голосов в опросах: ${d.pollVotes}.</p></section>
      <p class="adm-note">🔒 Статистика анонимная: хранятся только счётчики и обезличенные отпечатки посетителей за день/неделю/месяц — узнать по ним человека нельзя.</p>`;
  }

  function kpi(t, v, s, cls = '', extra = '') {
    return `<div class="kpi ${cls}"><span class="kpi__t">${t}</span><b class="kpi__v">${v}</b>${extra}<span class="kpi__s">${s}</span></div>`;
  }

  /* ---------------------------------------------------------------- обращения */

  async function reports() {
    const r = await call('/admin/reports', { filter: st.filter, kind: st.kind, q: st.q });
    if (!r || st.tab !== 'reports') return;
    const F = [['open', 'Открытые'], ['new', 'Без ответственного'], ['work', 'В работе'], ['done', 'Решённые'], ['all', 'Все']];
    box().innerHTML = `
      <div class="achips">${F.map(([f, t]) => `<button type="button" class="achip ${f === st.filter ? 'on' : ''}" data-filter="${f}">${t}${r.counts[f] != null ? ` <b>${r.counts[f]}</b>` : ''}</button>`).join('')}</div>
      <div class="achips achips--kinds"><button type="button" class="achip ${!st.kind ? 'on' : ''}" data-kind="">Все типы</button>${Object.entries(KIND).map(([k, [ic, t]]) => `<button type="button" class="achip ${st.kind === k ? 'on' : ''}" data-kind="${k}">${ic} ${t}</button>`).join('')}</div>
      <div class="search"><span class="search__ico">${N.I.search}</span><input type="search" id="aq" value="${esc(st.q)}" placeholder="Поиск: текст, место или №" enterkeyhint="search"></div>
      <div id="alist">${r.data.length ? r.data.map(repCard).join('') : '<div class="empty"><p>Здесь пусто ✦</p></div>'}</div>`;
    $('#aq').addEventListener('keydown', (e) => { if (e.key === 'Enter') { st.q = e.target.value.trim(); e.target.blur(); render(); } });
  }

  function repCard(x) {
    const [stt, cls] = N.STATUS[x.status] || N.STATUS.new;
    const age = Math.round((Date.now() / 1000 - x.createdAt) / 3600);
    const msgs = (x.messages || []).map((m) => m.author === 'note'
      ? `<div class="msg msg--note">${esc(m.who)} ${esc(m.text)} · ${N.fmtShort(m.at)}</div>`
      : `<div class="msg msg--${m.author === 'team' ? 'team' : 'me'}"><span class="msg__who">${m.author === 'team' ? 'Руководство' : 'Автор'} · ${N.fmtShort(m.at)}</span>${N.nl2br(m.text)}</div>`).join('');
    const acts = x.status === 'done'
      ? `<button type="button" class="btn btn--sm btn--ghost" data-ract="reopen" data-id="${x.id}">↩ Вернуть в работу</button>`
      : `${x.status === 'new' ? `<button type="button" class="btn btn--sm btn--cream" data-ract="take" data-id="${x.id}">✦ Взять в работу</button>` : ''}
         <button type="button" class="btn btn--sm btn--wine" data-ract="done" data-id="${x.id}">✓ Решено</button>`;
    return `<article class="arep" data-arep="${x.id}">
      <div class="arep__top"><span class="arep__k">${x.icon} ${esc(x.kindTitle)} №${x.id}</span><span class="st ${cls}">${stt}</span></div>
      <p class="arep__meta">${x.anon ? '🕵️ анонимно' : '👤 ' + esc(x.from)} · ${N.fmtDate(x.createdAt)} · ${age < 48 ? age + ' ч назад' : Math.round(age / 24) + ' дн назад'}${x.source === 'app' ? ' · из приложения' : ''}</p>
      ${x.location ? `<p class="arep__loc">📍 ${esc(x.location)}</p>` : ''}
      <p class="arep__text">${N.nl2br(x.text)}</p>
      ${x.photos ? `<p class="adm-mute">📎 Фото: ${x.photos} — смотри в рабочем чате</p>` : ''}
      ${x.takenBy ? `<p class="adm-mute">${x.status === 'done' ? `✅ Решил(а): ${esc(x.resolvedBy || x.takenBy)}` : `⏳ Взял(а): ${esc(x.takenBy)}`}</p>` : ''}
      ${x.rating ? `<p class="arep__rate">${N.starRow(x.rating, 'stars--sm')} ${x.review ? '«' + esc(x.review) + '»' : ''}</p>` : ''}
      ${msgs ? `<div class="thread">${msgs}</div>` : ''}
      ${x.canReply ? `<div class="reply"><textarea class="inp" placeholder="Ответ автору${x.anon ? ' — он получит его анонимно, через бота' : ''}…"></textarea>
        <button type="button" class="btn btn--sm btn--cream" data-ract="reply" data-id="${x.id}">Отправить ответ</button></div>`
        : '<p class="adm-mute">Автор отправил без обратной связи — ответить нельзя.</p>'}
      <div class="arep__acts">${acts}${x.link ? `<button type="button" class="btn btn--sm btn--ghost" data-alink="${esc(x.link)}">В чате ↗</button>` : ''}</div>
    </article>`;
  }

  /* ---------------------------------------------------------------- новости */

  async function news() {
    const r = await call('/admin/news');
    if (!r || st.tab !== 'news') return;
    st.news = r.data;
    const e = st.edit && st.edit.type === 'news' ? st.edit.v : {};
    box().innerHTML = `
      <section class="aform" id="newsForm" data-id="${e.id || ''}">
        <h3 class="acard__h">${e.id ? 'Изменить новость' : 'Новая новость'}</h3>
        ${field('Метка', `<input class="inp" name="tag" maxlength="30" value="${esc(e.tag || '')}" placeholder="Главное, Набор, Событие…">`)}
        ${field('Заголовок', `<input class="inp" name="title" maxlength="140" value="${esc(e.title || '')}" placeholder="Например: открыт набор в актив">`)}
        ${field('Текст', `<textarea class="inp" name="body" maxlength="4000" placeholder="Подробности…">${esc(e.body || '')}</textarea>`)}
        <div class="afield"><span class="label">Картинка</span>
          <div class="aimg" id="aimg">${e.image ? `<img src="${esc(e.image)}" alt="">` : '<span>Без картинки</span>'}</div>
          <input type="hidden" name="image" value="${esc(e.image ? e.image.split('/').pop() : '')}">
          <div class="arow"><button type="button" class="btn btn--sm btn--cream" data-act2="pickimg">Выбрать фото</button>
          ${e.image ? '<button type="button" class="btn btn--sm btn--ghost" data-act2="noimg">Убрать</button>' : ''}</div>
          <input type="file" id="imgFile" accept="image/*" hidden></div>
        <div class="arow2">${field('Текст кнопки', `<input class="inp" name="btnText" maxlength="40" value="${esc(e.btnText || '')}" placeholder="Анкета">`)}
        ${field('Ссылка кнопки', `<input class="inp" name="btnUrl" maxlength="500" value="${esc(e.btnUrl || '')}" placeholder="https://… или #/faq">`)}</div>
        ${toggle('pinned', 'Закрепить наверху', e.pinned)}
        ${toggle('hidden', 'Скрыть из приложения', e.hidden)}
        ${e.id ? '' : toggle('send', 'Сразу разослать всем в бота', false)}
        <div class="arow"><button type="button" class="btn btn--wine" data-act2="newsSave">${e.id ? 'Сохранить' : 'Опубликовать'}</button>
          ${e.id ? '<button type="button" class="btn btn--ghost" data-act2="cancel">Отмена</button>' : ''}</div>
      </section>
      <h3 class="sub-h">Опубликовано · ${st.news.length}</h3>
      ${st.news.map((n) => `<article class="aitem">
        ${n.image ? `<img class="aitem__img" src="${esc(n.image)}" alt="">` : ''}
        <div class="aitem__b"><span class="aitem__k">${esc(n.tag || 'Новость')} · ${esc(n.date)}${n.pinned ? ' · 📌' : ''}${n.hidden ? ' · скрыта' : ''}${n.sent ? ` · разослано ${n.sent}` : ''}</span>
          <b class="aitem__t">${esc(n.title)}</b></div>
        <div class="aitem__acts"><button type="button" class="mini" data-news="edit" data-id="${n.id}">Изменить</button>
          <button type="button" class="mini" data-news="send" data-id="${n.id}">Разослать</button>
          <button type="button" class="mini mini--del" data-news="del" data-id="${n.id}">Удалить</button></div></article>`).join('') || '<p class="adm-mute">Новостей пока нет — опубликуй первую, она появится на главной.</p>'}`;
    $('#imgFile').addEventListener('change', uploadImage);
  }

  async function uploadImage(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const blob = await N.compress(f, 1600, 0.84);
      const fd = new FormData();
      fd.append('file', blob, 'image.jpg');
      $('#aimg').innerHTML = '<span>Загружаю…</span>';
      const r = await N.api('/admin/upload-image', fd, true);
      $('#newsForm [name=image]').value = r.name;
      $('#aimg').innerHTML = `<img src="${esc(r.url)}" alt="">`;
      N.haptic('success');
    } catch (err) { fail(err); $('#aimg').innerHTML = '<span>Не получилось загрузить</span>'; }
  }

  /* ---------------------------------------------------------------- анонсы */

  async function events() {
    const r = await call('/admin/events');
    if (!r || st.tab !== 'events') return;
    st.events = r.data;
    const e = st.edit && st.edit.type === 'event' ? st.edit.v : { rsvp: true, kind: 'event' };
    const kinds = r.kinds;
    box().innerHTML = `
      <section class="aform" id="evForm" data-id="${e.id || ''}">
        <h3 class="acard__h">${e.id ? 'Изменить анонс' : 'Новый анонс'}</h3>
        ${field('Название', `<input class="inp" name="title" maxlength="120" value="${esc(e.title || '')}" placeholder="Общее собрание актива">`)}
        <div class="afield"><span class="label">Тип</span><div class="achips" data-pick="kind">${Object.entries(kinds).map(([k, t]) => `<button type="button" class="achip ${(e.kind || 'event') === k ? 'on' : ''}" data-v="${k}">${t}</button>`).join('')}</div></div>
        <div class="arow2">${field('Дата', `<input class="inp" type="date" name="date" value="${esc(e.date || '')}">`)}
          ${field('Время', `<input class="inp" type="time" name="time" value="${esc(e.time || '')}">`)}</div>
        ${field('Место', `<input class="inp" name="place" maxlength="120" value="${esc(e.place || '')}" placeholder="Ауд. 412, Масловка">`)}
        ${field('Описание', `<textarea class="inp" name="descr" maxlength="1500" placeholder="Что будет, что взять с собой…">${esc(e.descr || '')}</textarea>`)}
        ${field('Ссылка (необязательно)', `<input class="inp" name="url" maxlength="500" value="${esc(e.url || '')}" placeholder="https://…">`)}
        ${toggle('rsvp', 'Кнопки «Приду / Не приду» — видеть явку', e.rsvp)}
        ${toggle('notifyAll', 'Напомнить всем пользователям (а не только отметившимся)', e.notifyAll)}
        ${toggle('hidden', 'Скрыть из приложения', e.hidden)}
        ${toggle('announce', e.id ? 'Разослать обновлённый анонс в бота' : 'Сразу разослать анонс всем в бота', false)}
        <div class="arow"><button type="button" class="btn btn--wine" data-act2="evSave">${e.id ? 'Сохранить' : 'Добавить анонс'}</button>
          ${e.id ? '<button type="button" class="btn btn--ghost" data-act2="cancel">Отмена</button>' : ''}</div>
        <p class="adm-note">Напоминания приходят за сутки и за 2 часа (без времени — в 9:00 в день события) тем, кто отметил «Приду» или нажал «Напомнить».</p>
      </section>
      <h3 class="sub-h">Анонсы · ${st.events.length}</h3>
      ${st.events.map((v) => `<article class="aitem aitem--ev">
        <div class="ev__date"><b>${v.day}</b><span>${esc(v.mon)}</span></div>
        <div class="aitem__b"><span class="aitem__k">${esc(v.kindTitle)} · ${esc(v.when)}${v.hidden ? ' · скрыт' : ''}</span>
          <b class="aitem__t">${esc(v.title)}</b>
          ${v.rsvp ? `<button type="button" class="rsvp-sum" data-people="${v.id}">✅ придут <b>${v.counts.yes}</b> · ❌ не придут <b>${v.counts.no}</b> — список</button>
            <div class="people" id="people${v.id}" hidden>${v.people.yes.length ? '<b>Придут:</b> ' + v.people.yes.map(esc).join(', ') : 'Пока никто не отметился'}${v.people.no.length ? '<br><b>Не придут:</b> ' + v.people.no.map(esc).join(', ') : ''}</div>`
            : `<span class="adm-mute">напоминание включили: ${v.subs}</span>`}
        </div>
        <div class="aitem__acts"><button type="button" class="mini" data-evt="edit" data-id="${v.id}">Изменить</button>
          <button type="button" class="mini mini--del" data-evt="del" data-id="${v.id}">Удалить</button></div></article>`).join('') || '<p class="adm-mute">Анонсов пока нет.</p>'}`;
  }

  /* ---------------------------------------------------------------- опросы */

  async function polls() {
    const r = await call('/admin/polls');
    if (!r || st.tab !== 'polls') return;
    st.polls = r.data;
    box().innerHTML = `
      <section class="aform" id="pollForm">
        <h3 class="acard__h">Новый опрос</h3>
        ${field('Вопрос', '<input class="inp" name="question" maxlength="200" placeholder="Куда поедем на выезд?">')}
        <div class="afield"><span class="label">Варианты (2–8)</span><div id="opts">${['', ''].map(optRow).join('')}</div>
          <button type="button" class="mini" data-act2="addOpt">+ вариант</button></div>
        ${toggle('multi', 'Можно выбрать несколько вариантов', false)}
        ${toggle('send', 'Сразу разослать всем в бота', true)}
        <button type="button" class="btn btn--wine" data-act2="pollSave">Запустить опрос</button>
        <p class="adm-note">Голосование анонимное: в Пульте видны только итоги.</p>
      </section>
      <h3 class="sub-h">Опросы · ${st.polls.length}</h3>
      ${st.polls.map((p) => {
        const tot = Math.max(1, (p.votes || []).reduce((a, b) => a + b, 0));
        return `<article class="acard apoll">
          <span class="aitem__k">${p.closed ? 'закрыт' : 'идёт'} · проголосовали ${p.voters}${p.multi ? ' · несколько вариантов' : ''}</span>
          <b class="aitem__t">${esc(p.question)}</b>
          ${p.options.map((o, i) => `<div class="hbar"><span class="hbar__k">${esc(o)}</span><span class="hbar__v">${(p.votes || [])[i] || 0}</span><i style="--w:${Math.round((((p.votes || [])[i] || 0) * 100) / tot)}%"></i></div>`).join('')}
          <div class="aitem__acts"><button type="button" class="mini" data-poll2="${p.closed ? 'open' : 'close'}" data-id="${p.id}">${p.closed ? 'Открыть снова' : 'Закрыть'}</button>
            ${p.closed ? '' : `<button type="button" class="mini" data-poll2="send" data-id="${p.id}">Разослать</button>`}
            <button type="button" class="mini mini--del" data-poll2="del" data-id="${p.id}">Удалить</button></div></article>`;
      }).join('') || '<p class="adm-mute">Опросов пока нет.</p>'}`;
  }
  const optRow = (v) => `<div class="opt"><input class="inp" maxlength="80" value="${esc(v)}" placeholder="Вариант"><button type="button" class="mini mini--del" data-act2="delOpt">×</button></div>`;

  /* ---------------------------------------------------------------- группы, контакты, документы */

  async function content() {
    const [d, docs] = await Promise.all([N.reload(), call('/admin/docs')]);
    if (st.tab !== 'content') return;
    const data = N.data();
    st.docs = docs ? docs.data : [];
    box().innerHTML = `
      <section class="aform" id="linksForm"><h3 class="acard__h">Важные группы</h3>
        <div id="links">${data.links.map(linkRow).join('')}</div>
        <div class="arow"><button type="button" class="mini" data-act2="addLink">+ ссылка</button>
          <button type="button" class="btn btn--sm btn--wine" data-act2="linksSave">Сохранить группы</button></div></section>

      <section class="aform" id="peopleForm"><h3 class="acard__h">Контакты руководства</h3>
        <div id="people">${data.people.map(personRow).join('')}</div>
        <div class="arow"><button type="button" class="mini" data-act2="addPerson">+ контакт</button>
          <button type="button" class="btn btn--sm btn--wine" data-act2="peopleSave">Сохранить контакты</button></div></section>

      <section class="aform" id="docsForm"><h3 class="acard__h">Документы НПБ</h3>
        ${st.docs.map((x) => `<div class="adoc ${x.hidden ? 'adoc--hidden' : ''}" data-doc="${esc(x.id)}">
          <span class="adoc__n">${esc(x.id)}</span>
          <div class="adoc__b"><input class="inp" data-f="title" value="${esc(x.title)}" maxlength="120">
            <input class="inp inp--sm" data-f="sub" value="${esc(x.sub)}" maxlength="80" placeholder="Подпись">
            <span class="adm-mute">${x.file ? esc(x.file) + ' · ' + Math.max(1, Math.round(x.size / 1024)) + ' КБ' : '⚠️ файла нет на сервере'}${x.hidden ? ' · скрыт' : ''}</span></div>
          <div class="adoc__acts"><button type="button" class="mini" data-doc2="save" data-id="${esc(x.id)}">Сохранить</button>
            <button type="button" class="mini" data-doc2="${x.hidden ? 'show' : 'hide'}" data-id="${esc(x.id)}">${x.hidden ? 'Показать' : 'Скрыть'}</button>
            ${x.custom ? `<button type="button" class="mini mini--del" data-doc2="del" data-id="${esc(x.id)}">Удалить</button>` : ''}</div></div>`).join('')}
        <div class="aform aform--inner"><h4 class="acard__sub">Добавить PDF</h4>
          ${field('Название', '<input class="inp" id="docTitle" maxlength="100" placeholder="Положение о стипендии">')}
          ${field('Подпись', '<input class="inp" id="docSub" maxlength="80" placeholder="Как получить и сколько">')}
          <input type="file" id="docFile" accept="application/pdf" hidden>
          <button type="button" class="btn btn--sm btn--cream" data-act2="pickDoc">Выбрать PDF и загрузить</button>
          <p class="adm-note">Бот сразу начнёт отправлять документ, а страницы для листания в приложении соберутся сами за минуту.</p></div>
      </section>`;
    $('#docFile').addEventListener('change', uploadDoc);
  }
  const linkRow = (l) => `<div class="lrow" data-id="${esc(l.id || '')}">
      <input class="inp" data-f="t" value="${esc(l.t)}" placeholder="Название" maxlength="60">
      <input class="inp inp--sm" data-f="u" value="${esc(l.u)}" placeholder="https://t.me/… или @канал" maxlength="500">
      <input class="inp inp--sm" data-f="k" value="${esc(l.k || '')}" placeholder="Метка: Telegram · главный" maxlength="40">
      <input class="inp inp--sm" data-f="s" value="${esc(l.s || '')}" placeholder="Короткое описание" maxlength="120">
      <div class="lrow__acts"><button type="button" class="mini" data-move="-1">↑</button><button type="button" class="mini" data-move="1">↓</button>
        <button type="button" class="mini mini--del" data-act2="delRow">Удалить</button></div></div>`;
  const personRow = (p) => `<div class="lrow" data-id="${esc(p.id || '')}">
      <input class="inp" data-f="name" value="${esc(p.name)}" placeholder="Имя и фамилия" maxlength="60">
      <input class="inp inp--sm" data-f="role" value="${esc(p.role || '')}" placeholder="Должность" maxlength="100">
      <div class="arow2"><input class="inp inp--sm" data-f="tel" value="${esc(p.tel || '')}" placeholder="+7 …" maxlength="30">
        <input class="inp inp--sm" data-f="tg" value="${esc(p.tg || '')}" placeholder="ник в Telegram" maxlength="40"></div>
      <input class="inp inp--sm" data-f="note" value="${esc(p.note || '')}" placeholder="Подпись: пиши — ответит" maxlength="40">
      <div class="lrow__acts"><button type="button" class="mini" data-move="-1">↑</button><button type="button" class="mini" data-move="1">↓</button>
        <button type="button" class="mini mini--del" data-act2="delRow">Удалить</button></div></div>`;

  async function uploadDoc(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const title = $('#docTitle').value.trim() || f.name.replace(/\.pdf$/i, '');
    const fd = new FormData();
    fd.append('file', f, 'doc.pdf');
    fd.append('title', title);
    fd.append('sub', $('#docSub').value.trim());
    N.toast('Загружаю PDF…');
    try {
      const r = await N.api('/admin/doc-upload', fd, true);
      N.haptic('success'); N.toast(r.message || 'Документ добавлен');
      N.reload(); content();
    } catch (err) { fail(err); }
  }

  /* ---------------------------------------------------------------- рассылка и отчёты */

  async function more() {
    const r = await call('/admin/summary', { days: 7 });
    if (!r || st.tab !== 'more') return;
    const s = r.settings;
    const now = new Date();
    const months = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push([d.getFullYear(), d.getMonth() + 1, d.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })]);
    }
    box().innerHTML = `
      <section class="aform"><h3 class="acard__h">Рассылка всем</h3>
        <p class="adm-mute">Сообщение получат все, кто запускал бота (${r.data.users.reachable}).</p>
        <textarea class="inp" id="bcText" maxlength="3500" placeholder="Текст рассылки…"></textarea>
        <button type="button" class="btn btn--wine" data-act2="broadcast">Разослать</button></section>

      <section class="aform"><h3 class="acard__h">Отчёт в Excel</h3>
        <p class="adm-mute">Все обращения за месяц: статусы, кто взял, время ответа, оценки и отзывы, явка на анонсы, итоги опросов. Таблица придёт тебе в чат с ботом.</p>
        <div class="achips" data-pick="month">${months.map(([y, m, t], i) => `<button type="button" class="achip ${i === 1 ? 'on' : ''}" data-v="${y}-${m}">${t}</button>`).join('')}</div>
        <button type="button" class="btn btn--cream" data-act2="export">Прислать таблицу</button></section>

      <section class="aform"><h3 class="acard__h">Сводка обращений</h3>
        <p class="adm-mute">Каждый понедельник в 10:00 бот сам присылает сводку в рабочий чат.</p>
        <div class="arow"><button type="button" class="btn btn--sm btn--ghost" data-act2="digestPreview">Предпросмотр</button>
          <button type="button" class="btn btn--sm btn--wine" data-act2="digestSend">Отправить в группу</button></div>
        <div id="dgPrev"></div></section>

      <section class="aform" id="setForm"><h3 class="acard__h">Автоматика</h3>
        ${toggle('slaOn', 'Напоминать в группе об обращениях без ответственного', s.slaOn)}
        ${field('Через сколько часов напоминать', `<input class="inp" type="number" min="1" max="336" name="slaHours" value="${s.slaHours}">`)}
        ${toggle('digestOn', 'Сводка по понедельникам в 10:00', s.digestOn)}
        ${toggle('exportOn', 'Отчёт Excel 1-го числа каждого месяца — всем админам', s.exportOn)}
        <button type="button" class="btn btn--sm btn--wine" data-act2="settings">Сохранить</button>
        <p class="adm-note">Рабочий чат: <code>${esc(r.target.chat)}</code>${r.target.topic ? `, тема <code>${esc(r.target.topic)}</code>` : ''}. Меняется в .env на сервере.</p></section>`;
  }

  /* ---------------------------------------------------------------- общие элементы форм */

  function field(label, input) { return `<label class="afield"><span class="label">${label}</span>${input}</label>`; }
  function toggle(name, label, on) {
    return `<label class="atoggle"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><i></i><span>${label}</span></label>`;
  }
  function formData(form) {
    const o = {};
    $$('input[name],textarea[name]', form).forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    $$('[data-pick]', form).forEach((g) => { const on = $('.achip.on', g); o[g.dataset.pick] = on ? on.dataset.v : ''; });
    return o;
  }
  const confirmAsk = (text) => new Promise((res) => {
    const tg = window.Telegram && window.Telegram.WebApp;
    try { if (tg && tg.showConfirm && tg.initData) { tg.showConfirm(text, (ok) => res(Boolean(ok))); return; } } catch (e) {}
    res(window.confirm(text));
  });

  /* ---------------------------------------------------------------- клики */

  function onChange(e) {
    if (e.target.closest('[data-days]')) return;
  }

  async function onClick(e) {
    const t = e.target;
    let b;
    if ((b = t.closest('[data-days]'))) { st.days = Number(b.dataset.days); N.haptic('select'); return render(); }
    if ((b = t.closest('[data-filter]'))) { st.filter = b.dataset.filter; N.haptic('select'); return render(); }
    if ((b = t.closest('[data-kind]'))) { st.kind = b.dataset.kind; N.haptic('select'); return render(); }
    if ((b = t.closest('[data-pick] .achip'))) { $$('.achip', b.parentNode).forEach((x) => x.classList.toggle('on', x === b)); N.haptic('select'); return; }
    if ((b = t.closest('[data-alink]'))) { const tg = window.Telegram && window.Telegram.WebApp; if (tg && tg.openTelegramLink) tg.openTelegramLink(b.dataset.alink); else window.open(b.dataset.alink); return; }
    if ((b = t.closest('[data-people]'))) { const p = $('#people' + b.dataset.people); p.hidden = !p.hidden; N.haptic('select'); return; }

    if ((b = t.closest('[data-ract]'))) {
      const id = Number(b.dataset.id);
      const act = b.dataset.ract;
      const body = { id, action: act };
      if (act === 'reply') {
        const ta = b.parentNode.querySelector('textarea');
        if (!ta.value.trim()) { ta.focus(); return N.toast('Напиши текст ответа', 'err'); }
        body.text = ta.value.trim();
      }
      const r = await call('/admin/report-action', body, b);
      if (!r) return;
      N.haptic('success');
      N.toast({ take: 'Взято в работу ✦', done: 'Отмечено решённым — автор получил звёзды для оценки', reopen: 'Снова в работе', reply: 'Ответ доставлен автору ✦' }[act]);
      const el = $(`[data-arep="${id}"]`);
      if (el) el.outerHTML = repCard(r.report);
      return;
    }

    if ((b = t.closest('[data-news]'))) {
      const n = (st.news || []).find((x) => x.id === Number(b.dataset.id));
      if (!n) return;
      if (b.dataset.news === 'edit') { st.edit = { type: 'news', v: n }; return news(); }
      if (b.dataset.news === 'del' && await confirmAsk(`Удалить новость «${n.title}»?`)) { await call('/admin/news-del', { id: n.id }); N.reload(); return news(); }
      if (b.dataset.news === 'send' && await confirmAsk('Разослать новость всем пользователям бота?')) { const r = await call('/admin/news-send', { id: n.id }, b); if (r) N.toast(r.message); }
      return;
    }
    if ((b = t.closest('[data-evt]'))) {
      const v = (st.events || []).find((x) => x.id === Number(b.dataset.id));
      if (!v) return;
      if (b.dataset.evt === 'edit') { st.edit = { type: 'event', v }; return events(); }
      if (b.dataset.evt === 'del' && await confirmAsk(`Удалить анонс «${v.title}»?`)) { await call('/admin/event-del', { id: v.id }); N.reload(); return events(); }
      return;
    }
    if ((b = t.closest('[data-poll2]'))) {
      const id = Number(b.dataset.id);
      const a = b.dataset.poll2;
      if (a === 'close' || a === 'open') await call('/admin/poll-close', { id, closed: a === 'close' }, b);
      if (a === 'send' && await confirmAsk('Разослать опрос всем пользователям бота?')) { const r = await call('/admin/poll-send', { id }, b); if (r) N.toast(r.message); return; }
      if (a === 'del' && !(await confirmAsk('Удалить опрос вместе с голосами?'))) return;
      if (a === 'del') await call('/admin/poll-del', { id });
      N.reload();
      return polls();
    }
    if ((b = t.closest('[data-doc2]'))) {
      const row = b.closest('[data-doc]');
      const id = b.dataset.id;
      const a = b.dataset.doc2;
      if (a === 'del' && !(await confirmAsk('Удалить документ с сервера?'))) return;
      const r = a === 'del' ? await call('/admin/doc-del', { id }, b)
        : await call('/admin/doc-save', a === 'save' ? { id, title: $('[data-f=title]', row).value, sub: $('[data-f=sub]', row).value }
          : { id, hidden: a === 'hide' }, b);
      if (r) { N.haptic('success'); N.toast(a === 'save' ? 'Сохранено' : a === 'del' ? 'Удалено' : a === 'hide' ? 'Документ скрыт' : 'Документ снова виден'); N.reload(); content(); }
      return;
    }
    if ((b = t.closest('[data-move]'))) {
      const row = b.closest('.lrow');
      const d = Number(b.dataset.move);
      const sib = d < 0 ? row.previousElementSibling : row.nextElementSibling;
      if (sib) { d < 0 ? row.parentNode.insertBefore(row, sib) : row.parentNode.insertBefore(sib, row); N.haptic('select'); }
      return;
    }

    if (!(b = t.closest('[data-act2]'))) return;
    const a = b.dataset.act2;
    if (a === 'cancel') { st.edit = null; return render(); }
    if (a === 'pickimg') return $('#imgFile').click();
    if (a === 'noimg') { $('#newsForm [name=image]').value = ''; $('#aimg').innerHTML = '<span>Без картинки</span>'; return; }
    if (a === 'pickDoc') return $('#docFile').click();
    if (a === 'addOpt') { if ($$('#opts .opt').length < 8) $('#opts').insertAdjacentHTML('beforeend', optRow('')); return; }
    if (a === 'delOpt') { if ($$('#opts .opt').length > 2) b.closest('.opt').remove(); return; }
    if (a === 'delRow') { b.closest('.lrow').remove(); return; }
    if (a === 'addLink') { $('#links').insertAdjacentHTML('beforeend', linkRow({ t: '', u: '' })); return; }
    if (a === 'addPerson') { $('#people').insertAdjacentHTML('beforeend', personRow({ name: '' })); return; }

    if (a === 'newsSave') {
      const f = $('#newsForm');
      const o = formData(f);
      o.id = f.dataset.id ? Number(f.dataset.id) : undefined;
      if (o.send && !(await confirmAsk('Опубликовать и сразу разослать всем пользователям бота?'))) return;
      const r = await call('/admin/news-save', o, b);
      if (!r) return;
      N.haptic('success'); N.toast(o.id ? 'Новость сохранена' : 'Новость опубликована ✦');
      st.edit = null; N.reload(); return news();
    }
    if (a === 'evSave') {
      const f = $('#evForm');
      const o = formData(f);
      o.id = f.dataset.id ? Number(f.dataset.id) : undefined;
      if (o.announce && !(await confirmAsk('Разослать анонс всем пользователям бота?'))) return;
      const r = await call('/admin/event-save', o, b);
      if (!r) return;
      N.haptic('success'); N.toast(o.announce ? 'Сохранено, анонс рассылается ✦' : 'Анонс сохранён');
      st.edit = null; N.reload(); return events();
    }
    if (a === 'pollSave') {
      const f = $('#pollForm');
      const o = formData(f);
      o.options = $$('#opts input').map((i) => i.value.trim()).filter(Boolean);
      if (o.send && !(await confirmAsk('Запустить опрос и разослать всем в бота?'))) return;
      const r = await call('/admin/poll-save', o, b);
      if (!r) return;
      N.haptic('success'); N.toast('Опрос запущен ✦'); N.reload(); return polls();
    }
    if (a === 'linksSave') {
      const items = $$('#links .lrow').map((row) => ({ id: row.dataset.id, t: $('[data-f=t]', row).value, u: $('[data-f=u]', row).value, k: $('[data-f=k]', row).value, s: $('[data-f=s]', row).value }));
      const r = await call('/admin/links-save', { items }, b);
      if (r) { N.haptic('success'); N.toast('Группы сохранены — уже в приложении и в боте'); N.reload(); }
      return;
    }
    if (a === 'peopleSave') {
      const items = $$('#people .lrow').map((row) => ({ id: row.dataset.id, name: $('[data-f=name]', row).value, role: $('[data-f=role]', row).value,
        tel: $('[data-f=tel]', row).value, tg: $('[data-f=tg]', row).value, note: $('[data-f=note]', row).value }));
      const r = await call('/admin/people-save', { items }, b);
      if (r) { N.haptic('success'); N.toast('Контакты сохранены'); N.reload(); }
      return;
    }
    if (a === 'broadcast') {
      const text = $('#bcText').value.trim();
      if (text.length < 2) return N.toast('Напиши текст рассылки', 'err');
      if (!(await confirmAsk('Разослать сообщение всем пользователям бота?'))) return;
      const r = await call('/admin/broadcast', { text }, b);
      if (r) { N.haptic('success'); N.toast(r.message); $('#bcText').value = ''; }
      return;
    }
    if (a === 'export') {
      const on = $('[data-pick=month] .achip.on');
      const [y, m] = (on ? on.dataset.v : '').split('-').map(Number);
      const r = await call('/admin/export', { year: y, month: m }, b);
      if (r) { N.haptic('success'); N.toast(r.message); }
      return;
    }
    if (a === 'digestPreview') {
      const r = await call('/admin/digest', { preview: true }, b);
      if (r) $('#dgPrev').innerHTML = `<div class="dgprev">${r.text.replace(/<(?!\/?(b|i|a)\b)[^>]*>/g, '').replace(/\n/g, '<br>')}</div>`;
      return;
    }
    if (a === 'digestSend') {
      if (!(await confirmAsk('Отправить сводку в рабочий чат?'))) return;
      const r = await call('/admin/digest', {}, b);
      if (r) { N.haptic('success'); N.toast('Сводка отправлена в группу ✦'); }
      return;
    }
    if (a === 'settings') {
      const o = formData($('#setForm'));
      const r = await call('/admin/settings', o, b);
      if (r) { N.haptic('success'); N.toast('Настройки сохранены'); }
    }
  }

  window.NAB_ADMIN = { mount };
})();
