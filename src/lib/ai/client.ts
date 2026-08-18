import "server-only";
import OpenAI from "openai";
export function getOpenAI(){const key=process.env.OPENAI_API_KEY;if(!key)throw new Error('AI 기능을 사용하려면 OPENAI_API_KEY를 설정해 주세요.');return new OpenAI({apiKey:key});}
export const model=()=>process.env.OPENAI_MODEL||'gpt-5.4';
