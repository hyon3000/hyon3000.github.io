# Polycube 시리즈

3가지 차원의 테트리스 게임 모음. 폴리오미노/폴리큐브/폴리테서렉트 블록을 쌓아 면(또는 초면)을 채우는 퍼즐 게임입니다.

## 게임 목록

| 게임 | 차원 | 블록 | 폴더 |
|------|------|------|------|
| **Polynomino** | 2D | 폴리오미노 (평면 블록) | `polynomino/` |
| **Polycube** | 3D | 폴리큐브 (큐브 블록) | `polycube/` |
| **Polytesseract** | 4D | 폴리테서렉트 (초입방체 블록) | `polytesseract/` |

메뉴 > 게임 > 테마에서 세 게임 간 전환이 가능합니다.

---

## Polynomino (2D)

클래식 테트리스 스타일의 2D 퍼즐 게임.

- 7종 테트로미노 블록 + 펜토미노, 헥소미노
- XY 평면 회전, 좌우 이동
- 아이템 시스템

## Polycube (3D)

3D 공간에서 큐브 블록을 조작하는 테트리스.

- **3D 블록 조작**: XY, YZ, XZ 평면 회전 및 3축 이동
- **다양한 블록**: 모노큐브(1)부터 헥사큐브(6)까지
- **아이템 시스템**: 23종의 특수 아이템 블록 (줄 삭제, 폭탄, 거울, 장애물 등)
- **미니맵**: 상단에서 내려다보는 보드 미리보기
- **한국어/영어 자동 전환**

## Polytesseract (4D)

4차원 초입방체(테서렉트) 블록을 사용하는 테트리스. Polycube의 4D 확장.

- **4D 블록**: 테서렉트 (16꼭짓점, 24면, 32변)
- **6평면 회전**: XY, YZ, XZ, XW, YW, ZW
- **4D→3D 투영**: XW/YW 회전 + 직교 W 투영
- **W 깊이 색상**: W축 위치에 따른 무지개 색상 토글
- **XYZ/XYW 카메라 모드 전환**
- **26종 펜타테서렉트** (수학적으로 열거한 자유 4D 폴리하이퍼큐브)
- 키보드 12키: Z/X(XY), C/V(YZ), R/T(XZ), A/S(XW), D/F(YW), G/H(ZW)

---

## 조작법

### 터치/마우스 (공통)
- **방향패드**: 블록 이동
- **회전 버튼**: 회전 (2D: 1축, 3D: 3축, 4D: 6축)
- **드래그**: 카메라 회전
- **더블탭 드래그**: 카메라 확대/축소
- **미니맵 탭**: 바닥면 높이 전환

### 키보드 (공통)
- **방향키**: 블록 이동
- **스페이스**: 하드드롭
- **Shift**: 홀드

---

## 프로젝트 구조

```
polycube/              ← 이 README
├── polycube/          3D Polycube 게임
│   ├── game.html      게임 본체
│   ├── index.html     Win98 윈도우 런처 (테마 전환 포함)
│   └── web/           JS 소스 (app.js, fixed-pipeline.js 등)
├── polynomino/        2D Polynomino 게임
│   ├── game.html
│   ├── index.html
│   └── web/
└── polytesseract/     4D Polytesseract 게임
    ├── game.html
    ├── assets/blocks/  블록 이미지 (about 페이지용)
    └── web/            JS 소스 (app.js, fixed-pipeline.js, rawblock-data.js 등)
```

### 공유 의존성 (상위 디렉토리)

세 게임은 상위 디렉토리의 공유 리소스에 의존합니다:

| 파일 | 용도 |
|------|------|
| `win98.css` | Windows 98 UI 테마 |
| `mine-win98.css` | 추가 Win98 스타일 |
| `jquery.mswin.js` | Win98 윈도우 동작 (드래그, 최소화 등) |
| `jquery.mswin.menu.js` | Win98 메뉴바 |
| `vendor/jquery.min.js` | jQuery |
| `vendor/jquery-ui.min.js` | jQuery UI |

> **참고**: 상위 디렉토리에는 지뢰찾기 게임(index.html, mine.js 등)도 함께 있습니다. Polycube 시리즈는 위 공유 의존성만 사용하며, 지뢰찾기 코드와는 독립적입니다.

## 실행 방법

```bash
# 프로젝트 루트(상위 디렉토리)에서 웹 서버 실행
cd ..
python3 -m http.server 8080

# 브라우저에서 접속
# http://localhost:8080/polycube/index.html
```

`polycube/index.html`이 메인 진입점이며, 메뉴에서 세 게임 간 전환이 가능합니다.

## 기술 스택

- **순수 JavaScript + WebGL** (프레임워크 없음)
- **고정 파이프라인 에뮬레이션**: OpenGL 1.x 스타일 API를 WebGL로 구현 (`fixed-pipeline.js`)
- **배치 렌더링**: 동일 MVP 행렬의 쿼드를 한 번에 그리기 (Polytesseract)
- **4D→3D 투영**: XW/YW 회전 + 직교 투영 (Polytesseract)
- **Win98 UI**: [fake-mswin](http://github.com/puzzlet/fake-mswin/) 테마 기반
