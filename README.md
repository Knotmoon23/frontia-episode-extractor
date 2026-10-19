# 프론티아 에피소드 추출기 (Frontia Episode Extractor)

프론티아 스튜디오에서 편집 중인 에피소드의 설정을 버튼 한 번으로 `<작품 제목>.md` 파일 하나로 내려받는 Tampermonkey 스크립트입니다.

> 비공식 도구입니다. 프론티아(딥그로브 주식회사)와 관계없으며, 사용에 따른 책임은 사용자에게 있습니다.

## 설치

1. 브라우저에 [Tampermonkey](https://www.tampermonkey.net/)를 설치합니다.
2. 아래 링크를 엽니다. Tampermonkey 설치 화면이 뜨면 **설치**를 누릅니다.

   **[episode-extractor.user.js 설치](https://raw.githubusercontent.com/Knotmoon23/frontia-episode-extractor/main/episode-extractor.user.js)**

3. 새 버전이 올라오면 Tampermonkey가 자동으로 업데이트합니다(기본 하루 한 번 확인).

## 사용법

1. 프론티아 스튜디오에서 추출할 작품에 들어갑니다.
2. 화면 오른쪽 아래의 **⬇ 추출** 버튼을 누릅니다.
3. 스크립트가 메뉴를 차례로 열며 내용을 읽습니다. 끝나면 md 파일이 내려받아집니다. 진행 중에는 화면이 잠기고, **취소** 버튼이나 Esc로 멈출 수 있습니다.
4. **⚙** 버튼에서 담을 내용(세계관·캐릭터·미디어·프롤로그·스토리 설계·키워드북·상태값·주인공)과 언어를 고를 수 있습니다.

## 동작 방식

- 화면에 보이는 글자만 읽습니다. 사이트에 따로 요청을 보내거나 외부로 데이터를 전송하지 않습니다.
- 글을 입력하거나 저장·삭제·발행 버튼을 누르지 않습니다.
- 이미지·음악 파일은 받지 않고 이름만 적습니다.
- 자기가 편집할 수 있는 작품의 스튜디오 화면에서만 동작합니다.

## 지원 언어

현재 한국어 스튜디오를 지원합니다. 다른 언어는 순차적으로 추가할 예정입니다.

---

## English

A Tampermonkey userscript that exports the episode you are editing in Frontia Studio to a single Markdown file with one click.
It reads only what is shown on screen, sends no network requests, and never types or clicks save/delete/publish.
Unofficial; not affiliated with Frontia or its operator. Currently supports the Korean studio UI.
