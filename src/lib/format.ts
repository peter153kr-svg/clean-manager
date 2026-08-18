export const won=(v:number|null)=>v==null?'-':`${new Intl.NumberFormat('ko-KR').format(v)}원`;
export const date=(v:string)=>new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium'}).format(new Date(v));
export const status:Record<string,string>={new:'신규',consulting:'상담중',quote_sent:'견적발송',reserved:'예약',completed:'완료',cancelled:'취소',hold:'보류'};
