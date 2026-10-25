export const scheduleStatusLabels: Record<string, string> = {
  pending_review: "확인 필요",
  reviewed: "확인 완료",
  ignored: "제외",
  error: "처리 오류",
};

export function koreaDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
