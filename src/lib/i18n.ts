export const ko = {
  app: {
    title: '점심 커피내기',
    subtitle: '옆자리 동료들과 같이, 폰으로',
  },
  landing: {
    createRoom: '방 만들기',
    description: 'QR을 찍어 모인 사람들끼리 게임으로 커피값 정해요',
  },
  lobby: {
    waiting: '참가자를 기다리는 중',
    invite: '초대하기',
    inviteScan: '옆자리 사람이 스캔하면 같은 방 입장',
    copyLink: '링크 복사',
    share: '공유하기',
    linkCopied: '링크가 복사되었어요',
    chooseGame: '게임 선택',
    loserCount: '커피값 낼 사람 수',
    start: '시작',
    needMorePlayers: '2명 이상 모이면 시작할 수 있어요',
    nicknameBadge: (name: string) => `${name}(으)로 입장됨`,
    changeNickname: '바꾸기',
    comingSoon: '준비 중',
  },
  join: {
    title: '닉네임 입력',
    placeholder: '예: 김철수',
    submit: '입장',
    rules: '2~10자, 다른 참가자와 겹치지 않게',
    duplicate: '같은 닉네임이 이미 있어요',
  },
  game: {
    countdown: '시작!',
    inProgress: '이미 게임 진행 중이에요',
  },
  result: {
    losers: (n: number) => `오늘 커피는 ${n}명이!`,
    again: '다시 하기',
    changeGame: '게임 바꾸기',
    youLost: '오늘은 내가 산다 ☕',
    youWon: '운 좋게 면제!',
  },
  errors: {
    roomNotFound: '방을 찾을 수 없어요',
    raceInProgress: '이미 진행 중인 게임이 있어요',
    full: '방이 꽉 찼어요',
  },
} as const;

export type Strings = typeof ko;
