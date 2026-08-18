"use client";
import { deleteCustomer } from "@/app/actions";
export function ConfirmDeleteCustomer({id}:{id:string}){return <form action={deleteCustomer} onSubmit={(event)=>{if(!window.confirm("이 고객을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다."))event.preventDefault()}}><input type="hidden" name="id" value={id}/><button className="ui-button border-red-100 text-red-600 hover:bg-red-50">삭제</button></form>}
