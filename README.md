# Auto PiP for Safari

Mac Safari에서 **재생 중인 영상 탭을 벗어나면 PIP**, 돌아오면 원래 화면으로 복귀하는 확장 프로그램입니다. Chrome의 자동 PIP 사용 흐름을 참고해 Safari의 네이티브 영상 API로 구현했습니다.

## 바로 사용하기

[최신 릴리스에서 Mac 앱과 Safari 임시 설치용 ZIP 다운로드](https://github.com/sib-proejct/auto_pip_safari/releases/latest)

- `Auto-PiP-Mac.zip`: 압축을 풀고 앱을 실행합니다.
- `Auto-PiP-Safari.zip`: Safari의 임시 확장 프로그램 추가에서 선택합니다.

### 방법 1: 확장 ZIP 불러오기

현재 Mac의 Safari 27.0.1에서는 Xcode 없이 임시 확장 프로그램을 불러올 수 있습니다.

1. **Safari → 설정 → 고급 → 웹 개발자용 기능 보기**를 켭니다.
2. **설정 → 개발자 → 임시 확장 프로그램 추가…**를 누릅니다.
3. 이 프로젝트의 `dist/Auto-PiP-Safari.zip` 또는 `extension` 폴더를 선택합니다. Safari가 요청하면 서명되지 않은 확장 프로그램을 허용합니다.
4. **확장 프로그램**에서 Auto PiP를 켜고, 사용할 웹사이트의 접근을 **허용**합니다. 여러 사이트에서 쓰려면 모든 웹사이트에 허용합니다.
5. 열어 둔 영상 페이지를 새로고침하고, 재생 버튼을 직접 누른 다음 다른 탭으로 이동합니다.

**임시 설치는 Safari 종료 또는 24시간 후 제거됩니다.** 계속 사용할 로컬 앱은 아래 방법을 이용하세요. 메뉴 이름은 Safari 표시 언어에 따라 다를 수 있습니다.

### 방법 2: Mac 앱 사용

빌드된 앱은 `build/Build/Products/Release/Auto PiP.app`에 있습니다. 전달용 압축 파일 `dist/Auto-PiP-Mac.zip`을 풀어도 같은 앱을 사용할 수 있습니다. 앱을 한 번 실행한 뒤 앱의 **Safari 설정 열기**를 누르세요.

1. Safari 설정 → 개발자 → **서명되지 않은 확장 프로그램 허용**을 켭니다.
2. Safari 설정 → 확장 프로그램 → **Auto PiP**를 켜고 웹사이트 접근을 허용합니다.
3. 기존 영상 페이지를 새로고침합니다.

이 앱은 로컬 개발용 임시 서명(ad-hoc)을 사용합니다. **Safari를 종료했다가 켜면 서명되지 않은 확장 프로그램 허용을 다시 켜야 합니다.** App Store 배포/공증용 서명은 포함되어 있지 않습니다. 앱은 macOS 27 SDK로 빌드되어 macOS 27 이상을 대상으로 합니다.

## 동작과 설정

Safari 도구 막대의 Auto PiP 아이콘을 누르면 다음 설정을 바꿀 수 있습니다.

| 설정 | 기본값 | 동작 |
| --- | --- | --- |
| 자동 PIP | 켜짐 | 다른 탭으로 이동할 때 자동 전환 |
| 이 사이트에서 사용 | 켜짐 | 현재 페이지의 정확한 호스트 단위로 제외/허용 |
| 돌아오면 원래 화면으로 | 켜짐 | 확장이 자동으로 연 PIP만 복귀 |
| 음소거 영상도 포함 | 꺼짐 | 음소거 자동 재생 광고 등의 불필요한 전환 감소 |
| 전환 대기 시간 | 0.15초 | 바로 / 0.15초 / 0.4초 / 0.8초 |
| 지금 PIP로 열기 | 버튼 | 현재 탭의 재생 중인 영상을 직접 PIP로 열기 |

- 여러 영상이 있으면 소리가 나고 화면이 큰 영상을 우선합니다. HTTP(S) iframe과 열린 Shadow DOM도 탐색합니다.
- Safari에서 **탭을 바꾸는 경우**에 반응합니다. 다른 앱에 초점만 옮기고 같은 탭이 선택되어 있으면 자동 전환하지 않습니다.
- 정지/종료/준비되지 않은 영상, 작은 미리보기, 전체 화면, AirPlay, PIP 비활성화 영상은 제외합니다.
- 사용자가 직접 연 PIP는 자동 복귀하지 않습니다. 확장이 연 창을 직접 닫으면 그 탭으로 돌아오기 전까지 다시 열지 않습니다.
- iframe의 제외 설정은 임베드 제공자 대신 **최상위 웹사이트**를 따릅니다.

## Safari 및 플레이어 제한

Safari는 영상 조작 이력과 플레이어 정책에 따라 PIP 요청을 거부할 수 있습니다. 특히 자동 재생만 된 영상은 **재생 버튼을 직접 눌러 본 뒤** 탭을 바꿔 보세요. 실패하면 확장 팝업에 상태가 표시되고, 원래 탭으로 돌아왔을 때 **PIP 열기** 안내가 나타납니다. 수동 열기가 가능해도 해당 플레이어의 자동 전환을 보장하지는 않습니다.

DRM, 사이트 자체 재생 중단 정책, 닫힌 Shadow DOM, `about:blank`/`srcdoc` iframe, Safari 내부 페이지는 제한될 수 있습니다. 여러 Safari 창 중 하나에서 해당 탭이 계속 선택되어 있으면 자동 전환 대상이 아닙니다.

## 개발과 검증

Node.js 18 이상. 외부 npm 의존성은 없습니다.

```sh
npm test               # 전환/복귀, 빠른 왕복, iframe 선택, 설정 등 동작 테스트
npm run check          # manifest, 리소스, JavaScript 문법 검사
npm run package        # dist/Auto-PiP-Safari.zip 생성
npm run build:safari   # Xcode로 Mac 앱 빌드
npm run preview        # http://127.0.0.1:4178 에서 설정 UI 미리보기 (가상 상태)
```

Xcode가 다른 위치에 있다면 `DEVELOPER_DIR`로 경로를 지정하세요. 시스템의 기본 Xcode 설정은 변경하지 않습니다. `macos/Auto PiP/Auto PiP.xcodeproj`는 원본 `extension` 파일을 참조하므로 코드를 고친 뒤 앱을 다시 빌드하면 됩니다. 임시 확장 방식은 Safari 설정에서 다시 불러오기 후 페이지를 새로고침하세요.

자동 테스트와 앱 빌드는 로컬에서 검증합니다. **Safari에서 확장을 켠 뒤 실제 네이티브 PIP 창이 뜨는지는 아래 절차로 확인해야 합니다.**

1. 소리 있는 YouTube 영상 재생 → 다른 탭 이동 → PIP 열림 → 원래 탭 복귀 → PIP 닫힘.
2. 정지한 영상, 음소거 영상(기본 설정)에서 탭 이동 → 열리지 않음.
3. 빠르게 다른 탭에 갔다가 복귀 → 뒤늦게 PIP가 남지 않음.
4. 사이트에서 직접 PIP를 열고 탭 왕복 → 수동 PIP 유지.
5. 자동 PIP 창을 직접 닫기 → 같은 비활성 구간에 다시 열리지 않음.
6. 현재 사이트 제외 → iframe 영상에도 적용. Safari 재시작 후 설정 유지.
7. 실제 사용하는 영상 서비스와 iframe에서 같은 흐름 확인. 서비스별 DRM 정책은 별도 확인.

## 개인정보와 권한

확장은 네트워크 요청, 분석, 원격 코드, 방문 기록 저장을 사용하지 않습니다. 설정과 제외 호스트만 `storage.local`에 저장하고 영상/탭 상태는 실행 중 메모리에 둡니다. 웹사이트 접근 권한은 페이지의 영상 요소 탐색과 PIP 전환에 쓰며 `activeTab`은 도구 막대에서 현재 사이트를 확인하는 데 사용합니다.

## 참고한 공식 자료

- [Chrome의 자동 PIP](https://developer.chrome.com/blog/automatic-picture-in-picture-initiated-by-the-browser)
- [Apple: Safari 영상 PIP 제어](https://developer.apple.com/documentation/webkitjs/adding_picture_in_picture_to_your_safari_media_controls)
- [Apple: Safari 확장 불러오기와 서명 설정](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
- [Apple: 확장 앱 패키징](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
