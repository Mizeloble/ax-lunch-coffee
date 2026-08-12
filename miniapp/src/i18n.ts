// 미니앱 전용 문자열. 공유 문자열은 계속 @/lib/i18n의 ko를 쓴다.
export const miniKo = {
  badge: '앱인토스',
  exit: {
    title: '복불복을 닫을까요?',
    desc: '진행 중인 방이 있으면 나가게 돼요.',
    stay: '계속하기',
    leave: '닫기',
  },
  sound: {
    turnOn: '소리 켜기',
    turnOff: '소리 끄기',
  },
  deepLink: {
    title: '입장 경로 실측',
    help: '토스 공유 링크 QR을 폰 기본 카메라로 찍어서 미니앱의 해당 방으로 바로 들어오는지 확인하세요. 방 코드를 비우면 앱 홈으로 연결됩니다.',
    placeholder: '방 코드 (없으면 앱 홈)',
    shareLink: '① 토스 공유 링크 (실제 초대용)',
    loading: '공유 링크 생성 중…',
    sdkUnavailable: '토스 웹뷰 밖에서는 생성 불가 — 샌드박스에서 확인하세요',
    httpsOk: 'https 링크 → 기본 카메라로 스캔 가능',
    httpsNo: 'https가 아님 → 기본 카메라 인식 여부 반드시 확인',
    rawTitle: '② 원시 스킴 (대조용)',
    live: '실서비스 intoss://',
    priv: '테스트 intoss-private://',
  },
} as const;
