// ==UserScript==
// @name         Frontia Episode Extractor
// @name:ko      프론티아 에피소드 추출기
// @namespace    https://github.com/Knotmoon23/frontia-episode-extractor
// @version      0.1.0
// @description  Export the episode you are editing in Frontia Studio to a single Markdown file.
// @description:ko 프론티아 스튜디오에서 편집 중인 에피소드를 md 파일 하나로 내려받습니다.
// @match        https://frontia.ai/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @homepageURL  https://github.com/Knotmoon23/frontia-episode-extractor
// @supportURL   https://github.com/Knotmoon23/frontia-episode-extractor/issues
// @updateURL    https://raw.githubusercontent.com/Knotmoon23/frontia-episode-extractor/main/episode-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/Knotmoon23/frontia-episode-extractor/main/episode-extractor.user.js
// ==/UserScript==

(function () {
  'use strict';

  // #region config
  const CONFIG = {
    pageWaitMs: 15000,          // 화면이 준비되기를 기다리는 한도
    pollMs: 100,                // 준비 확인 간격
    humanMin: 500, humanMax: 1000, // 클릭 사이 쉬는 시간(무작위)
    urlWatchMs: 500,            // 주소 확인 간격
    // 장 → 세부 항목 (설정 창·md 순서). 세부 항목이 없는 장은 빈 배열
    sections: [
      ['world', ['basePrompt', 'endingPrompt']],
      ['character', ['charInfo', 'charImage']],
      ['media', ['bg', 'sit', 'video']],
      ['prologue', []],
      ['story', ['main', 'mainEnding', 'sub', 'subEnding']],
      ['keyword', []],
      ['status', ['pinned', 'playerStatus', 'charStatus']],
      ['protagonist', []],
    ],
  };
  // #endregion config

  // #region i18n
  const I18N = {
    ko: {
      ui: { extract: '추출', settings: '설정', cancel: '취소', reading: '{name} 읽는 중… ({i}/{n})', done: '완료', failed: '읽지 못한 칸: {list}', lang: '언어', include: '담을 내용', details: '세부 항목', save: '저장', close: '닫기', title: '에피소드 추출기 설정', cancelled: '취소했습니다', notStudio: '작품 설정 화면에서 실행하세요' },
      ch: { world: '세계관', character: '캐릭터', media: '미디어', prologue: '프롤로그', story: '스토리 설계', keyword: '키워드북', status: '상태값', protagonist: '주인공' },
      sub: { basePrompt: '기본 프롬프트', endingPrompt: '엔딩 프롬프트', charInfo: '캐릭터 정보', charImage: '캐릭터 이미지', emotion: '감정', situation: '상황', bg: '배경 에셋', sit: '상황 에셋', video: '비디오', main: '메인 이벤트', mainEnding: '메인 엔딩', sub: '서브 이벤트', subEnding: '서브 엔딩', pinned: '플레이용 상태값', playerStatus: '주인공 상태', charStatus: '캐릭터 상태' },
      f: { title: '제목', defaultPrologue: '대표 프롤로그', desc: '설명', scene: '연출 씬', sceneGuide: '연출 방향', heroes: '주인공 프로필 선택', choices: '플레이 선택지', heroChoices: '주인공 선택지', mission: '주인공 미션', guide: '진행 가이드', prev: '이전 연결', direction: '디렉터의 연출', auto: '자동 생성', manual: '직접 연출', trigger: '이벤트 트리거', activeAt: '활성 가능한 시점', allSelected: '전체 선택', kwTrigger: '호출 트리거', kwDesc: '키워드 설명', statusType: '유형', number: '숫자', text: '문자', standard: '표준', free: '자유', rule: '출력 규칙', initial: '시작값', unit: '단위', range: '범위', heroName: '주인공 이름', useUserName: '플레이어 이름 사용', gender: '성별', male: '남성', female: '여성', noGender: '선택 안 함', heroIntro: '주인공 소개', heroTraits: '특징' },
    },
    // 'zh-Hant','th','id','pt','en','es','ja' — 2단계에서 채운다. 비어 있는 키는 ko로 대신한다.
  };
  // #endregion i18n

  // #region md
  const isEmpty = v => v == null || String(v).trim() === '';
  function fenceFor(text) {
    let n = 4;
    for (const m of String(text).match(/`{4,}/g) || []) n = Math.max(n, m.length + 1);
    return '`'.repeat(n);
  }
  function codeBlock(text) { const f = fenceFor(text); return f + 'text\n' + text + '\n' + f; }
  // 코드 블록 밖에 쓰는 작품 값(이름·제목·선택지·트리거 등)은 md 기호를 글자로 만든다. 줄바꿈은 공백으로.
  function esc(v) {
    let t = String(v == null ? '' : v).split(/\r?\n/).join(' ').replace(/[\\`*_\[\]<>!#]/g, '\\$&');
    t = t.replace(/^(\d+)\./, '$1\\.').replace(/^[-+]/, '\\$&');
    return t;
  }

  // 읽은 자료(D) → md 글자. D에 없는 장·항목은 아예 쓰지 않는다.
  function buildMd(D, T) {
    const out = [];
    const push = s => { if (s !== '' && s != null) out.push(s); };
    const long = (label, text) => { if (!isEmpty(text)) { push(label); push(codeBlock(text)); } };
    const numbered = (label, arr) => {
      const rows = (arr || []).map((v, i) => isEmpty(v) ? null : `${i + 1}. ${esc(v)}`).filter(Boolean);
      if (rows.length) { push(label); push(rows.join('\n')); }
    };
    const bullets = rows => { rows = rows.filter(Boolean); if (rows.length) push(rows.join('\n')); };
    const f = T.f, s = T.sub;

    push('# ' + esc(D.title));

    if (D.world) {
      const w = D.world, parts = [];
      if (!isEmpty(w.basePrompt)) parts.push(() => { push('### ' + s.basePrompt); push(codeBlock(w.basePrompt)); });
      if ((w.endings || []).some(e => !isEmpty(e.text))) parts.push(() => {
        push('### ' + s.endingPrompt);
        for (const e of w.endings) if (!isEmpty(e.text)) { push('#### ' + esc(e.name)); push(codeBlock(e.text)); }
      });
      if (parts.length) { push('## ' + T.ch.world); parts.forEach(p => p()); }
    }

    if (D.character) {
      const c = D.character, parts = [];
      if ((c.info || []).some(x => !isEmpty(x.text))) parts.push(() => {
        push('### ' + s.charInfo);
        for (const x of c.info) if (!isEmpty(x.text)) { push('#### ' + esc(x.name)); push(codeBlock(x.text)); }
      });
      if ((c.emotions || []).length || (c.situations || []).length) parts.push(() => {
        push('### ' + s.charImage);
        if ((c.emotions || []).length) { push('#### ' + s.emotion); push(c.emotions.map(x => '- ' + esc(x)).join('\n')); }
        if ((c.situations || []).length) { push('#### ' + s.situation); push(c.situations.map(x => '- ' + esc(x)).join('\n')); }
      });
      if (parts.length) { push('## ' + T.ch.character); parts.forEach(p => p()); }
    }

    if (D.media) {
      const parts = [];
      for (const [k, key] of [['bg', 'bg'], ['sit', 'sit'], ['video', 'video']]) {
        const names = D.media[key] || [];
        if (names.length) parts.push(() => { push('### ' + s[k]); push(names.map(x => '- ' + esc(x)).join('\n')); });
      }
      if (parts.length) { push('## ' + T.ch.media); parts.forEach(p => p()); }
    }

    if ((D.prologue || []).length) {
      push('## ' + T.ch.prologue);
      for (const p of D.prologue) {
        push('### ' + esc(p.title) + (p.isDefault ? ` (${f.defaultPrologue})` : ''));
        bullets([(p.heroes || []).length ? `- ${f.heroes}: ${p.heroes.map(esc).join(', ')}` : '']);
        long(f.desc, p.desc);
        long(f.scene, p.scene);
        numbered(f.choices, p.choices);
        long(f.mission, p.mission);
        long(f.guide, p.guide);
      }
    }

    if (D.story) {
      const st = D.story, parts = [];
      const ev = (e, withHero, subKind) => {
        push('#### ' + esc(e.name));
        const b = [];
        if ((e.prev || []).length) b.push(`- ${f.prev}: ${e.prev.map(esc).join(', ')}`);
        if (subKind && e.activeAt) b.push(`- ${f.activeAt}: ${e.activeAt === 'all' ? f.allSelected : e.activeAt.map(esc).join(', ')}`);
        b.push(`- ${f.direction}: ${e.manual ? f.manual : f.auto}`);
        bullets(b);
        long(f.trigger, e.trigger);
        long(e.manual ? f.scene : f.sceneGuide, e.scene);
        if (withHero) numbered(f.heroChoices, e.choices);
        long(f.mission, e.mission);
        long(f.guide, e.guide);
      };
      for (const [key, withHero, subKind] of [['main', true, false], ['mainEnding', false, false], ['sub', true, true], ['subEnding', false, true]]) {
        if ((st[key] || []).length) parts.push(() => { push('### ' + s[key]); st[key].forEach(e => ev(e, withHero, subKind)); });
      }
      if (parts.length) { push('## ' + T.ch.story); parts.forEach(p => p()); }
    }

    if ((D.keyword || []).length) {
      push('## ' + T.ch.keyword);
      for (const k of D.keyword) {
        push('### ' + esc(k.title));
        bullets([(k.triggers || []).length ? `- ${f.kwTrigger}: ${k.triggers.map(esc).join(', ')}` : '']);
        long(f.kwDesc, k.desc);
      }
    }

    if (D.status) {
      const st = D.status, parts = [];
      const typeName = t => ({ number: f.number, text: f.text, standard: f.standard, free: f.free }[t] || t);
      const card = x => {
        push('#### ' + esc(x.name));
        const rng = (x.range || []).map(v => isEmpty(v) ? '' : String(v).trim());
        bullets([isEmpty(x.type) ? '' : `- ${f.statusType}: ${typeName(x.type)}`, isEmpty(x.unit) ? '' : `- ${f.unit}: ${esc(x.unit)}`, rng.some(Boolean) ? `- ${f.range}: ${esc(rng[0])} ~ ${esc(rng[1])}` : '']);
        long(f.rule, x.rule);
        long(f.initial, x.initial);
        const rows = (x.initials || []).filter(v => !isEmpty(v.value)).map(v => `- ${esc(v.who)}: ${esc(v.value)}`);
        if (rows.length) { push(f.initial); push(rows.join('\n')); }
      };
      if ((st.pinned || []).length) parts.push(() => { push('### ' + s.pinned); push(st.pinned.map(x => '- ' + esc(x)).join('\n')); });
      if ((st.player || []).length) parts.push(() => { push('### ' + s.playerStatus); st.player.forEach(card); });
      if ((st.char || []).length) parts.push(() => { push('### ' + s.charStatus); st.char.forEach(card); });
      if (parts.length) { push('## ' + T.ch.status); parts.forEach(p => p()); }
    }

    if ((D.protagonist || []).length) {
      push('## ' + T.ch.protagonist);
      for (const h of D.protagonist) {
        push('### ' + esc(h.name));
        bullets((h.short || []).filter(x => !isEmpty(x.value)).map(x => `- ${x.label}: ${esc(x.value)}`));
        for (const x of h.long || []) long(x.label, x.value);
      }
    }

    return out.join('\n\n') + '\n';
  }

  function safeFileName(title) {
    const trim = x => x.replace(/^[\s.]+|[\s.]+$/g, '');
    let n = trim(String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'));
    n = trim(Array.from(n).slice(0, 120).join(''));          // 120자(코드 포인트 기준)로 자른 뒤 끝의 공백·마침표를 다시 뗀다
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(n.split('.')[0])) n = '_' + n;   // Windows 예약 이름(점 앞부분 기준)
    return (n || 'episode') + '.md';
  }
  // #endregion md

  // #region dom
  class Cancelled extends Error {}
  const run = { cancelled: false };       // 실행 상태(취소 표시)
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const checkCancel = () => { if (run.cancelled) throw new Cancelled('cancelled'); };
  const pause = async () => { checkCancel(); await sleep(CONFIG.humanMin + Math.random() * (CONFIG.humanMax - CONFIG.humanMin)); checkCancel(); };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const txt = el => (el ? (el.innerText || el.textContent || '') : '').trim();
  async function waitFor(fn, limit) {
    const end = Date.now() + (limit || CONFIG.pageWaitMs);
    while (Date.now() < end) {
      checkCancel();
      let v = null;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      await sleep(CONFIG.pollMs);
    }
    return null;
  }
  // 누르면 안 되는 것은 여기서 막는다(막히면 throw → 그 단계가 '읽지 못한 칸'으로 기록됨).
  //  ① 스위치·체크 박스·라디오·파일 칸은 늘 막는다.
  //  ② 버튼(button·[role=button])의 '자기 글자'에 추가·삭제·저장·발행·복사·업로드·복제 뜻의 낱말이 들어 있으면 막는다.
  //     한국어는 글자가 들어 있으면, 영어는 낱말 경계를 두고 대소문자 무시. 나머지 언어(zh-Hant·th·id·pt·es·ja)는 2단계에서 FORBIDDEN_WORDS에 넣는다.
  //  ③ 글자 검사는 `content: true`(프롤로그 탭·엔딩 칩·이벤트 노드·목록 항목처럼 글자가 '작품 내용'인 곳)에서는 건너뛴다.
  //     작품 이름에 '복사본' 같은 낱말이 들어갈 수 있기 때문이다. 이런 곳은 구조(②가 아닌 ①)로만 지킨다.
  const FORBIDDEN_WORDS = {
    ko: /추가|삭제|저장|발행|복사|업로드|복제/,
    en: /\b(add|delete|remove|save|publish|copy|duplicate|upload)\b/i,
  };
  const forbiddenText = t => Object.values(FORBIDDEN_WORDS).some(re => re.test(t));
  function clickSafe(el, content) {
    if (!el) throw new Error('누를 곳 없음');
    if (el.closest('[role=switch],[role=checkbox],[role=radio],input[type=checkbox],input[type=radio],input[type=file]')) throw new Error('누르면 안 되는 칸');
    if (!content) {
      const btn = el.closest('button,[role=button]');      // 이름을 보여 주는 p를 누를 때는 그 p가 든 가장 가까운 버튼의 글자를 본다
      if (btn && forbiddenText(txt(btn))) throw new Error('누르면 안 되는 버튼: ' + txt(btn).slice(0, 20));
    }
    el.click();
  }
  // 글 편집기(ProseMirror) 칸: innerText는 줄바꿈이 틀어져서 문단별 textContent를 잇는다.
  const textOfEditor = el => [...el.children].map(p => p.textContent).join('\n');
  // 화면 글자로 눌러야 할 곳 찾기: 글자가 같은 요소 중 가장 안쪽 것의 눌리는 조상
  function byText(root, text, sel) {
    const els = $$(sel || 'a,button,[role=tab],[role=button],li,div,span,p,h1,h2,h3', root).filter(e => visible(e) && txt(e) === text);
    els.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    const el = els[0];
    return el ? (el.closest('a,button,[role=tab],[role=button],li') || el) : null;
  }
  // 화면이 값을 다 채울 때까지(글자·입력 칸 값이 3번 연속 같을 때까지) 기다린다. 값이 늦게 채워지는 칸(글 편집기·선택지·키워드 설명 등)을 빈 채로 읽지 않으려는 것.
  const fingerprint = root => root ? (txt(root).length + '|' + $$('input,textarea', root).map(e => e.value).join('|')) : '';
  async function settle(rootFn, limit) {
    let last = null, same = 0;
    const end = Date.now() + (limit || 6000);
    while (Date.now() < end) {
      checkCancel();
      let cur = '';
      try { cur = fingerprint(rootFn()); } catch (e) { cur = ''; }
      if (cur === last) same++; else { same = 0; last = cur; }
      if (same >= 3) return;
      await sleep(300);
    }
  }
  // #endregion dom

  // #region nav
  // 사이트 언어(화면 글자)의 왼쪽 메뉴 이름. 1단계는 한국어만. 못 찾으면 메뉴 순서(위치)로 찾는다.
  const SITE_NAMES = {
    ko: { world: '세계관', character: '캐릭터', media: '미디어', prologue: '프롤로그', story: '스토리 설계', keyword: '키워드북', status: '상태값', protagonist: '주인공' },
  };
  // 묶음 메뉴를 펼쳐 놓은 상태의 버튼 순서: 세계관·캐릭터·미디어·프롤로그·(에피소드 설정)·스토리 설계·키워드북·상태값·주인공
  const NAV_POSITION = { world: 0, character: 1, media: 2, prologue: 3, story: 5, keyword: 6, status: 7, protagonist: 8 };

  const ROUTES = {
    world: { path: 'general', menu: 'world', ready: () => $('textarea[name=worldPrompt]') },
    charInfo: { path: 'characters', type: 'info', menu: 'character', tab: 0, ready: () => $('main textarea[name=description]'), emptyOk: true },
    charImage: { path: 'characters', type: 'image', menu: 'character', tab: 1, ready: () => $('main h3'), emptyOk: true },
    bg: { path: 'media-assets', type: 'background', menu: 'media', tab: 0, ready: () => mediaReady(), emptyOk: true },
    sit: { path: 'media-assets', type: 'situation', menu: 'media', tab: 1, ready: () => mediaReady(), emptyOk: true },
    video: { path: 'media-assets', type: 'video', menu: 'media', tab: 2, ready: () => mediaReady(), emptyOk: true },
    prologue: { path: 'prologue', menu: 'prologue', ready: () => $('main input[name=name]') || $('main [contenteditable=true]') },
    story: { path: 'events', menu: 'story', ready: () => $('main .react-flow__node') },
    keyword: { path: 'keywords', menu: 'keyword', ready: () => $('main input[name=keyword]') || $('main div.rounded-lg div.cursor-pointer p.typography-body1-2'), emptyOk: true },
    playerStatus: { path: 'status', type: 'player', menu: 'status', tab: 0, ready: () => $('main input[name=name]'), emptyOk: true },
    charStatus: { path: 'status', type: 'character', menu: 'status', tab: 1, ready: () => $('main input[name=name]'), emptyOk: true },
    protagonist: { path: 'protagonists', menu: 'protagonist', ready: () => $('main fieldset'), emptyOk: true },
  };

  const siteLang = () => document.documentElement.lang || 'ko';
  const where = () => ({ p: (location.pathname.split('/settings/')[1] || '').split('/')[0], t: new URLSearchParams(location.search).get('type') });
  const pageHead = () => $$('main h1').find(visible);
  // 미디어 화면은 목록 위 '등록한 ○○ N개' 글자의 숫자와 카드 수가 같아지면 준비된 것(0개는 emptyOk 대기로 처리)
  function mediaReady() {
    const n = mediaCards().length;
    if (!n) return null;
    return $$('main p.typography-body2-3.text-text-ui-tertiary').some(p => (txt(p).match(/\d+/) || [])[0] === String(n)) ? true : null;
  }
  const mediaCards = () => $$('main div[role=presentation] > div.rounded-3xl');

  function menuButtons() { return $$('nav button.cursor-pointer.rounded-xl').filter(visible); }
  function findMenu(key) {
    const names = SITE_NAMES[siteLang()] || SITE_NAMES.ko;
    const btns = menuButtons();
    const byName = btns.find(b => txt(b) === names[key]);
    if (byName) return byName;
    return btns.length === 9 ? btns[NAV_POSITION[key]] : null;
  }
  async function menuButton(key) {
    let b = findMenu(key);
    if (!b) {                                   // 묶음이 접혀 있으면 묶음 머리를 눌러 펼친다(화면 이동 없음)
      const head = $$('nav div.cursor-pointer').find(d => visible(d) && !d.querySelector('button') && txt(d));
      if (head) { await pause(); clickSafe(head); await waitFor(() => findMenu(key), 3000); b = findMenu(key); }
    }
    return b;
  }

  // 주소의 경로(와 ?type=)가 맞아질 때까지 메뉴·탭을 사람처럼 눌러 이동한다.
  async function goTo(key) {
    const r = ROUTES[key];
    const onPath = () => where().p === r.path;
    const onType = () => !r.type || where().t === r.type;
    if (!(onPath() && onType())) {
      if (!onPath()) {
        const b = await menuButton(r.menu);
        if (!b) throw new Error('메뉴를 못 찾음: ' + r.menu);
        await pause(); clickSafe(b);
        if (!await waitFor(onPath)) throw new Error('화면이 바뀌지 않음: ' + r.path);
      }
      if (!onType()) {
        await waitFor(() => $$('main h1.cursor-pointer').filter(visible).length > r.tab);
        const tab = $$('main h1.cursor-pointer').filter(visible)[r.tab];
        if (!tab) throw new Error('탭을 못 찾음: ' + key);
        await pause(); clickSafe(tab);
        if (!await waitFor(onType)) throw new Error('탭이 바뀌지 않음: ' + key);
      }
    }
    const t0 = Date.now();
    const ok = await waitFor(() => r.ready() || (r.emptyOk && pageHead() && Date.now() - t0 > 4000 ? 'empty' : null));
    if (!ok) throw new Error('화면이 준비되지 않음: ' + key);
    await settle(() => $('main'));
  }
  const routeKeyOfUrl = () => {
    const w = where();
    return Object.keys(ROUTES).find(k => ROUTES[k].path === w.p && (!ROUTES[k].type || ROUTES[k].type === w.t)) || null;
  };
  // #endregion nav

  // #region readers
  // 장마다 읽기 함수 하나. 반환값은 순수한 자료이고 md 글자는 만들지 않는다. 화면에서 읽기만 한다.
  const X = { T: null, fails: [] };       // 실행 중 공유: 출력 언어 문구, 읽지 못한 칸 목록
  const val = el => (el ? el.value : '');
  const norm = s => String(s == null ? '' : s).trim();
  const addFail = path => X.fails.push(path.join(' > '));
  // 한 칸이 실패해도 나머지는 계속 읽는다(취소는 그대로 위로 던진다).
  async function safe(path, fn, fallback) {
    try { return await fn(); } catch (e) { if (e instanceof Cancelled) throw e; addFail(path); return fallback; }
  }

  // 5-1. 세계관
  async function readWorld(opt) {
    const T = X.T, out = { basePrompt: '', endings: [] };
    await goTo('world');
    const tabs = () => $$('main button > h3').map(h => h.parentElement).filter(visible);
    if (opt.basePrompt) out.basePrompt = val($('textarea[name=worldPrompt]'));
    if (opt.endingPrompt && tabs().length >= 2) {
      await safe([T.ch.world, T.sub.endingPrompt], async () => {
        await pause(); clickSafe(tabs()[1]);
        const chips = () => $$('main button.cursor-pointer.rounded-full').filter(b => visible(b) && !b.getAttribute('role') && $('p', b));
        const area = () => $$('main textarea:not([name])').find(visible);
        if (!await waitFor(() => chips().length && area())) throw new Error('엔딩 칸 없음');
        const n = chips().length;
        for (let i = 0; i < n; i++) {
          const chip = chips()[i], name = txt(chip);
          await pause(); clickSafe(chip, true);
          await settle(() => $('main'));
          out.endings.push({ name, text: val(area()) });
        }
      });
      await pause(); clickSafe(tabs()[0]);
    }
    return out;
  }

  // 5-2. 캐릭터
  async function readCharInfo() {
    await goTo('charInfo');
    return $$('main textarea[name=description]').map(ta => {
      let a = ta.parentElement;
      while (a && !a.querySelector('h3')) a = a.parentElement;
      return { name: a ? txt($('h3', a)) : '', text: ta.value };
    });
  }
  async function readCharImage() {
    await goTo('charImage');
    const out = { emotions: [], situations: [] };
    // 맨 위 '감정 및 상황 설정' 영역을 펼치면 작품 전체의 감정·상황 이름이 나온다(첫 캐릭터 영역에는 그 캐릭터 것만 보임).
    const head = $$('main div.cursor-pointer.flex-col').find(d => $('div.rounded-md', d) && !$('h3', d));
    if (!head) return out;
    const titles = () => $$('main h3.typography-subtitle-2.text-text-ui-secondary');
    let opened = false;
    if (titles().length < 2) {
      await pause(); clickSafe($('p', head)); opened = true;
      if (!await waitFor(() => titles().length >= 2)) throw new Error('감정·상황 영역이 펼쳐지지 않음');
    }
    await settle(() => $('main'));
    const namesOf = h => $$('p.typography-body3-2', h.parentElement.nextElementSibling).map(txt);
    out.emotions = namesOf(titles()[0]);
    out.situations = namesOf(titles()[1]);
    if (opened) { await pause(); clickSafe($('p', head)); }
    return out;
  }

  // 5-3. 미디어 (이름만)
  async function readMedia(key) {
    await goTo(key);
    return mediaCards().map(c => txt($('p', c)));
  }

  // 5-4. 프롤로그
  function readPrologueNow() {
    const sw = $('main [role=switch]');
    const ed = $('main [contenteditable=true]');
    return {
      title: $('main input[name=name]') ? val($('main input[name=name]')) : X.T.ch.prologue,   // 프롤로그가 하나뿐이면 화면에 제목 칸이 없다
      isDefault: !!sw && sw.getAttribute('aria-checked') === 'true',
      desc: val($('main textarea[name=description]')),
      scene: ed ? textOfEditor(ed) : '',
      heroes: $$('main [role=checkbox][aria-checked=true]').map(c => { const nm = $('p.typography-body2-2', c.parentElement); return nm ? txt(nm) : (c.getAttribute('aria-label') || ''); }),
      choices: [0, 1, 2].map(i => val($(`main [name=choice_${i}]`))),
      mission: val($('main [name=mission]')),
      guide: val($('main textarea[name=storyGuide]')),
    };
  }
  async function readPrologue() {
    const T = X.T;
    await goTo('prologue');
    const tabsOf = () => $$('main button.rounded-lg.cursor-pointer[type=button]').filter(b => visible(b) && !b.getAttribute('role') && /text-text-ui-(primary|tertiary)/.test((($('p', b)) || {}).className || ''));
    const n = tabsOf().length, out = [];
    if (!n) {                                   // 프롤로그가 하나뿐: 탭 줄 없이 연출 화면만 보인다
      out.push(readPrologueNow());
      return out;
    }
    for (let i = 0; i < n; i++) {
      const tab = tabsOf()[i], name = txt($('p', tab));
      const one = await safe([T.ch.prologue, name], async () => {
        await pause(); clickSafe(tab, true);
        await waitFor(() => norm(val($('main input[name=name]'))) === norm(name), 5000);
        await settle(() => $('main'));
        return readPrologueNow();
      }, null);
      if (one) out.push(one);
    }
    if (n > 1) { await pause(); clickSafe(tabsOf()[0], true); }
    return out;
  }

  // 5-5. 스토리 설계
  const nodeEls = () => $$('main .react-flow__node');
  const nodeType = el => (String(el.className).match(/react-flow__node-(\w+)/) || [])[1];
  const nodeName = el => txt($('p.typography-body1-2.text-text-ui-secondary', el));
  function panelNow(kind) {
    const a = $('aside');
    const radios = $$('[role=radio]', a);
    const manual = radios.length === 2 && radios[1].getAttribute('aria-checked') === 'true';
    const ed = $('[contenteditable=true]', a);
    const e = { name: val($('input[name=name]', a)), manual, trigger: val($('input[name=condition]', a)), scene: ed ? textOfEditor(ed) : '' };
    if (kind === 'main' || kind === 'sub') e.choices = manual ? [0, 1, 2].map(i => val($(`[name=choice_${i}]`, a))) : [];
    if (kind === 'main') { e.mission = val($('[name=mission]', a)); e.guide = val($('textarea[name=storyGuide]', a)); }
    if (kind === 'sub') e.guide = val($('textarea[name=subStoryGuide]', a));
    if (kind === 'sub' || kind === 'subEnding') {
      const boxes = $$('[role=checkbox]', a);
      if (boxes.length) {
        const all = boxes[0].getAttribute('aria-checked') === 'true';
        e.activeAt = all ? 'all' : boxes.slice(1).filter(c => c.getAttribute('aria-checked') === 'true').map(c => txt($('p', c.parentElement)));
      }
    }
    return e;
  }
  async function openPanelAndRead(clickTarget, name, kind) {
    await pause(); clickSafe(clickTarget, true);
    await waitFor(() => norm(val($('aside input[name=name]'))) === norm(name), 6000);
    await settle(() => $('aside'));
    return panelNow(kind);
  }
  async function readStory(opt) {
    const T = X.T, out = { main: [], mainEnding: [], sub: [], subEnding: [] };
    await goTo('story');
    const nodes = nodeEls().map(el => ({ id: el.getAttribute('data-id'), type: nodeType(el), name: nodeName(el), el }));
    const nameById = Object.fromEntries(nodes.map(n => [n.id, n.name]));
    const edges = $$('main g.react-flow__edge').map(g => (g.getAttribute('aria-label') || '').match(/^Edge from (\S+) to (\S+)$/)).filter(Boolean).map(m => ({ from: m[1], to: m[2] }));
    for (const [key, type] of [['main', 'main'], ['mainEnding', 'main_ending']]) {
      if (!opt[key]) continue;
      for (const nd of nodes.filter(n => n.type === type)) {
        const e = await safe([T.ch.story, T.sub[key], nd.name], () => openPanelAndRead($('p', nd.el), nd.name, key === 'main' ? 'main' : 'mainEnding'), null);
        if (e) { e.prev = edges.filter(x => x.to === nd.id).map(x => nameById[x.from]).filter(Boolean); out[key].push(e); }
      }
    }
    const boxes = () => $$('main div.absolute.flex-col > div.flex-col.rounded-lg');
    for (const [key, idx] of [['sub', 0], ['subEnding', 1]]) {
      if (!opt[key]) continue;
      await safe([T.ch.story, T.sub[key]], async () => {
        const box = () => boxes()[idx];
        if (!box()) return;
        const head = () => $('.cursor-pointer', box());
        const count = Number(txt($$('p', head()).pop()));
        if (!count) return;
        const items = () => $$('div.rounded-xl.cursor-pointer', box());
        let opened = false;
        if (!items().length) { await pause(); clickSafe($('p', head())); opened = true; await waitFor(() => items().length, 4000); }
        const n = items().length;
        for (let i = 0; i < n; i++) {
          const it = items()[i], name = txt($('p', it));
          const e = await safe([T.ch.story, T.sub[key], name], () => openPanelAndRead($('p', it), name, key), null);
          if (e) out[key].push(e);
        }
        if (opened && box() && items().length) { await pause(); clickSafe($('p', head())); }
      });
    }
    return out;
  }

  // 5-6. 키워드북
  async function readKeywords() {
    const T = X.T;
    await goTo('keyword');
    const headers = () => $$('main div.rounded-lg div.cursor-pointer').filter(d => d.querySelector(':scope > button') && (d.querySelector('p.typography-body1-2') || d.querySelector('input[name=keyword]')));
    const titleOf = h => { const i = $('input[name=keyword]', h); return i ? i.value : txt($('p.typography-body1-2', h)); };
    const n = headers().length, out = [];
    for (let i = 0; i < n; i++) {
      const title = titleOf(headers()[i]);
      const one = await safe([T.ch.keyword, title], async () => {
        if (!$('input[name=keyword]', headers()[i])) {
          await pause(); clickSafe($('p.typography-body1-2', headers()[i]), true);
          if (!await waitFor(() => $('input[name=keyword]', headers()[i]))) throw new Error('펼쳐지지 않음');
        }
        const card = headers()[i].closest('div.rounded-lg');
        await settle(() => card);
        return { title: val($('input[name=keyword]', card)), triggers: $$('div.rounded-md > p', card).map(txt), desc: val($('textarea[name=description]', card)) };
      }, null);
      if (one) out.push(one);
    }
    return out;
  }

  // 5-7. 상태값
  const statusCards = () => $$('main [class~="rounded-[12px]"]').filter(c => $('input[name=name]', c));
  // 인물별 시작값 줄: 카드 안에서 인물 사진(img.rounded-full)과 이름 글자를 함께 가진 가장 가까운 묶음
  function statusRowOf(inp, card) {
    let a = inp.parentElement;
    while (a && a !== card && !a.querySelector('img.rounded-full')) a = a.parentElement;
    return a && a !== card ? a : null;
  }
  function statusCardNow(card, withInitials) {
    const radios = $$('[role=radio]', card);
    const idx = radios.findIndex(r => r.getAttribute('aria-checked') === 'true');
    const isTime = !!$('input[name=initialValue]', card);
    const x = { name: val($('input[name=name]', card)), type: isTime ? ['standard', 'free'][idx] : ['number', 'text'][idx], rule: val($('textarea[name=condition]', card)) };
    const loose = $$('input:not([name]):not([type])', card);
    if (x.type === 'number') {
      x.unit = val($('input[name=unit]', card));
      x.range = loose.filter(i => !statusRowOf(i, card)).slice(0, 2).map(i => i.value);   // 범위: 최소·최대
    }
    if (!withInitials) x.initial = val($('input[name=initialValue]', card) || $('textarea[placeholder]:not([name])', card));
    else x.initials = loose.map(inp => ({ inp, row: statusRowOf(inp, card) })).filter(r => r.row).map(r => ({ who: txt($('p', r.row)), value: r.inp.value }));
    return x;
  }
  async function readStatus(opt) {
    const out = { pinned: [], player: [], char: [] };
    if (opt.pinned || opt.playerStatus) {
      await goTo('playerStatus');
      if (opt.pinned) out.pinned = $$('main [class~="rounded-[4px]"] p.typography-body1-3').map(txt);
      if (opt.playerStatus) out.player = statusCards().map(c => statusCardNow(c, false));
    }
    if (opt.charStatus) {
      await goTo('charStatus');
      out.char = statusCards().map(c => statusCardNow(c, true));
    }
    return out;
  }

  // 5-8. 주인공
  async function readProtagonists() {
    const f = X.T.f;
    await goTo('protagonist');
    return $$('main fieldset').map(fs => {
      const card = fs.closest('div.rounded-xl') || fs.parentElement;
      const radios = $$('[role=radio]', fs);
      const direct = radios.length > 1 && radios[1].getAttribute('aria-checked') === 'true';
      const genders = $$('[role=group] button[aria-pressed]', fs);
      const gi = genders.findIndex(b => b.getAttribute('aria-pressed') === 'true');
      return {
        name: txt($('p', card)),
        short: [
          { label: f.heroName, value: direct ? val($('input[name=name]', fs)) : f.useUserName },
          { label: f.gender, value: gi < 0 ? '' : [f.male, f.female, f.noGender][gi] },
        ],
        long: [{ label: f.heroIntro, value: val($('textarea[name=introduction]', fs)) }, { label: f.heroTraits, value: val($('textarea[name=description]', fs)) }],
      };
    });
  }
  // #endregion readers

  // #region ui
  // 버튼·설정 창·진행 막. Shadow DOM 안에 그려 사이트 스타일과 섞이지 않게 한다.
  const UI_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
    .fab { position: fixed; right: 20px; bottom: 20px; display: flex; gap: 8px; z-index: 2147483646; }
    .fab button { border: 0; border-radius: 999px; padding: 10px 16px; font-size: 14px; cursor: pointer; background: #2b2d33; color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.45); }
    .fab button.main { background: #5b6cff; font-weight: 600; }
    .fab button:hover { filter: brightness(1.15); }
    .veil { position: fixed; inset: 0; background: rgba(8,8,12,.72); z-index: 2147483647; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 14px; color: #fff; font-size: 16px; }
    .veil.on { display: flex; }
    .veil button, .dlg button { border: 0; border-radius: 8px; padding: 8px 18px; font-size: 14px; cursor: pointer; background: #3a3d46; color: #fff; }
    .veil button.primary, .dlg button.primary { background: #5b6cff; }
    .dlg-wrap { position: fixed; inset: 0; background: rgba(8,8,12,.6); z-index: 2147483647; display: none; align-items: center; justify-content: center; }
    .dlg-wrap.on { display: flex; }
    .dlg { background: #1d1f25; color: #eee; border-radius: 12px; padding: 20px 24px; width: 380px; max-height: 80vh; overflow: auto; font-size: 14px; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
    .dlg h2 { margin: 0 0 14px; font-size: 16px; }
    .dlg label { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
    .dlg .row { display: flex; align-items: center; justify-content: space-between; }
    .dlg .sub { margin-left: 26px; }
    .dlg .twist { background: none; padding: 2px 8px; color: #9aa; }
    .dlg select { background: #2b2d33; color: #fff; border: 1px solid #444; border-radius: 6px; padding: 4px 8px; }
    .dlg .btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .toast { position: fixed; right: 20px; bottom: 76px; max-width: 420px; background: #1d1f25; color: #fff; border-radius: 10px; padding: 12px 16px; font-size: 14px; z-index: 2147483647; display: none; box-shadow: 0 4px 20px rgba(0,0,0,.5); white-space: pre-wrap; }
    .toast.on { display: block; }
  `;
  const LANG_NAMES = { ko: '한국어', 'zh-Hant': '繁體中文', th: 'ไทย', id: 'Bahasa Indonesia', pt: 'Português', en: 'English', es: 'Español', ja: '日本語' };

  function createUi(handlers) {
    const host = document.createElement('div');
    host.id = 'frontia-episode-extractor';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${UI_CSS}</style>
      <div class="fab" hidden><button class="main" data-a="extract"></button><button data-a="settings">⚙</button></div>
      <div class="veil"><div class="msg"></div><button class="primary" data-a="cancel"></button></div>
      <div class="dlg-wrap"><div class="dlg"></div></div>
      <div class="toast"></div>`;
    document.documentElement.appendChild(host);
    const q = s => root.querySelector(s);
    const fab = q('.fab'), veil = q('.veil'), wrap = q('.dlg-wrap'), dlg = q('.dlg'), toastEl = q('.toast');
    root.addEventListener('click', ev => {
      const a = ev.target.closest && ev.target.closest('[data-a]');
      if (a && handlers[a.dataset.a]) handlers[a.dataset.a](ev);
    });
    let toastTimer = null;
    return {
      setTexts(T) { q('[data-a=extract]').textContent = '⬇ ' + T.ui.extract; q('[data-a=cancel]').textContent = T.ui.cancel; q('[data-a=settings]').title = T.ui.settings; },
      showFab(on) { fab.hidden = !on; fab.style.display = on ? 'flex' : 'none'; },
      progress(text, on) { q('.msg').textContent = text || ''; veil.classList.toggle('on', !!on); },
      toast(text, ms) {
        toastEl.textContent = text; toastEl.classList.add('on'); clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms || 8000);
      },
      // 설정 창. state = { lang, sections: { 장: { on, items: { 세부: bool } } } }
      openSettings(state, T, onSave) {
        const langs = Object.keys(I18N);
        const html = [`<h2>${T.ui.title}</h2>`,
          `<div class="row"><span>${T.ui.lang}</span><select data-k="lang">${langs.map(l => `<option value="${l}"${l === state.lang ? ' selected' : ''}>${LANG_NAMES[l] || l}</option>`).join('')}</select></div>`,
          `<p style="margin:14px 0 6px;color:#9aa">${T.ui.include}</p>`];
        for (const [ch, subs] of CONFIG.sections) {
          const s = state.sections[ch];
          html.push(`<div class="row"><label><input type="checkbox" data-ch="${ch}"${s.on ? ' checked' : ''}> ${T.ch[ch]}</label>${subs.length ? `<button class="twist" data-twist="${ch}" title="${T.ui.details}">▸</button>` : ''}</div>`);
          if (subs.length) html.push(`<div class="sub" data-sub="${ch}" hidden>${subs.map(k => `<label><input type="checkbox" data-ch="${ch}" data-it="${k}"${s.items[k] ? ' checked' : ''}> ${T.sub[k]}</label>`).join('')}</div>`);
        }
        html.push(`<div class="btns"><button class="primary" data-s="save">${T.ui.save}</button><button data-s="close">${T.ui.close}</button></div>`);
        dlg.innerHTML = html.join('');
        wrap.classList.add('on');
        dlg.onclick = ev => {
          const t = ev.target;
          if (t.dataset.twist) { const box = dlg.querySelector(`[data-sub="${t.dataset.twist}"]`); box.hidden = !box.hidden; t.textContent = box.hidden ? '▸' : '▾'; }
          else if (t.dataset.s === 'close') wrap.classList.remove('on');
          else if (t.dataset.s === 'save') {
            const next = { lang: dlg.querySelector('[data-k=lang]').value, sections: {} };
            for (const [ch, subs] of CONFIG.sections) {
              const items = {};
              for (const k of subs) items[k] = dlg.querySelector(`[data-ch="${ch}"][data-it="${k}"]`).checked;
              next.sections[ch] = { on: dlg.querySelector(`input[data-ch="${ch}"]:not([data-it])`).checked, items };
            }
            wrap.classList.remove('on'); onSave(next);
          }
        };
      },
    };
  }
  // #endregion ui

  // #region main
  const gmGet = (k, d) => { try { return typeof GM_getValue === 'function' ? GM_getValue(k, d) : d; } catch (e) { return d; } };
  const gmSet = (k, v) => { try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (e) { /* 저장 못 해도 계속 */ } };

  const SETTINGS_PATH = /^\/studio\/episodes\/[0-9a-f]{24}\/settings\//;
  const episodeId = () => (location.pathname.match(/^\/studio\/episodes\/([0-9a-f]{24})\//) || [])[1] || null;
  const langKey = () => { const l = gmGet('lang', null) || document.documentElement.lang || 'ko'; return I18N[l] ? l : 'ko'; };
  const texts = () => {                      // 출력 언어 문구. 비어 있는 키는 ko로 대신한다.
    const l = I18N[langKey()], ko = I18N.ko, out = {};
    for (const g of Object.keys(ko)) out[g] = Object.assign({}, ko[g], l[g] || {});
    return out;
  };
  function loadSettings() {
    const saved = gmGet('sections', null) || {};
    const sections = {};
    for (const [ch, subs] of CONFIG.sections) {
      const s = saved[ch] || {};
      const items = {};
      for (const k of subs) items[k] = !s.items || s.items[k] !== false;
      sections[ch] = { on: s.on !== false, items };
    }
    return { lang: langKey(), sections };
  }
  const chapterOn = (cfg, ch) => cfg.sections[ch].on && (CONFIG.sections.find(c => c[0] === ch)[1].length === 0 || Object.values(cfg.sections[ch].items).some(Boolean));

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  let ui = null, running = false, lastEpisode = null;

  // 실행 중에는 키보드·붙여넣기를 막아 사용자가 칸에 글을 넣어 작품이 고쳐지는 일(사이트는 자동 저장)을 막는다. Esc는 취소.
  const KEY_EVENTS = ['keydown', 'keypress', 'keyup', 'paste', 'beforeinput'];
  const keyBlocker = e => {
    if (e.type === 'keydown' && e.key === 'Escape') run.cancelled = true;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  };
  const blockKeys = on => KEY_EVENTS.forEach(t => on ? window.addEventListener(t, keyBlocker, true) : window.removeEventListener(t, keyBlocker, true));

  async function extract() {
    if (running || !episodeId()) return;
    running = true; run.cancelled = false; X.fails = [];
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* 무시 */ }
    blockKeys(true);
    try { await extractInner(); } finally { blockKeys(false); running = false; ui.progress('', false); }
  }
  async function extractInner() {
    const cfg = loadSettings(), T = texts(); X.T = T;
    const startKey = routeKeyOfUrl();
    const steps = CONFIG.sections.filter(([ch]) => chapterOn(cfg, ch));
    const D = { title: txt($('nav p.typography-body1-2.text-text-ui-primary')) };
    let cancelled = false;
    try {
      for (let i = 0; i < steps.length; i++) {
        const [ch] = steps[i], o = cfg.sections[ch].items;
        ui.progress(T.ui.reading.replace('{name}', T.ch[ch]).replace('{i}', i + 1).replace('{n}', steps.length), true);
        await safe([T.ch[ch]], async () => {
          if (ch === 'world') D.world = await readWorld(o);
          else if (ch === 'character') {
            D.character = { info: [], emotions: [], situations: [] };
            if (o.charInfo) D.character.info = await readCharInfo();
            if (o.charImage) Object.assign(D.character, await readCharImage());
          } else if (ch === 'media') {
            D.media = { bg: [], sit: [], video: [] };
            for (const k of ['bg', 'sit', 'video']) if (o[k]) D.media[k] = await readMedia(k);
          } else if (ch === 'prologue') D.prologue = await readPrologue();
          else if (ch === 'story') D.story = await readStory(o);
          else if (ch === 'keyword') D.keyword = await readKeywords();
          else if (ch === 'status') D.status = await readStatus(o);
          else if (ch === 'protagonist') D.protagonist = await readProtagonists();
        });
      }
    } catch (e) {
      if (e instanceof Cancelled) cancelled = true; else { addFail([String(e && e.message || e)]); }
    }
    try {                                      // 처음 보던 화면으로 돌아간다(취소해도)
      ui.progress('…', true);
      const was = run.cancelled; run.cancelled = false;
      if (startKey && routeKeyOfUrl() !== startKey) await goTo(startKey);
      run.cancelled = was;
    } catch (e) { /* 돌아가지 못해도 결과는 낸다 */ }
    ui.progress('', false);
    if (cancelled) { ui.toast(T.ui.cancelled); return; }
    download(safeFileName(D.title), buildMd(D, T));
    ui.toast(X.fails.length ? T.ui.failed.replace('{list}', X.fails.join(', ')) : T.ui.done);
  }

  function openSettings() {
    ui.openSettings(loadSettings(), texts(), next => {
      gmSet('lang', next.lang); gmSet('sections', next.sections);
      ui.setTexts(texts());
    });
  }

  function start() {
    if (window.__frontiaEpisodeExtractor) return;
    window.__frontiaEpisodeExtractor = true;
    ui = createUi({
      extract: () => { extract(); },
      settings: openSettings,
      cancel: () => { run.cancelled = true; },
    });
    ui.setTexts(texts());
    try { if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(texts().ui.settings, openSettings); } catch (e) { /* 메뉴 등록은 선택 */ }
    // 사이트가 한 페이지 안에서 화면을 바꾸므로 주소를 500ms마다 확인한다.
    setInterval(() => {
      const id = episodeId();
      if (id !== lastEpisode) { lastEpisode = id; run.cancelled = false; }
      ui.showFab(SETTINGS_PATH.test(location.pathname));
    }, CONFIG.urlWatchMs);
  }
  start();
  // #endregion main
})();
