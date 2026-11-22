'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { LogOut, Trash2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { AuthUser } from '@/lib/auth';
import api from '@/lib/api';

function errorMessage(error: unknown) {
  const message = (error as {response?:{data?:{message?:unknown}}})?.response?.data?.message;
  return typeof message === 'string' ? message : 'Could not schedule account deletion. Please try again.';
}

export function AccountActions({user}: {user: AuthUser}) {
  const {logout} = useAuth();
  const modal = useRef<HTMLDialogElement>(null);
  const [view,setView] = useState<'logout'|'delete'|'scheduled'|null>(null);
  const [email,setEmail] = useState('');
  const deletion = useMutation({
    mutationFn: async () => (await api.post<{data:{scheduledAt:string}}>('/gdpr/request-deletion')).data.data,
    onSuccess: () => setView('scheduled'),
  });
  const busy = logout.isPending || deletion.isPending;
  useEffect(() => {
    const dialog = modal.current;
    if (view && dialog && !dialog.open) dialog.showModal();
    if (!view && dialog?.open) dialog.close();
  },[view]);
  const close = () => {if (!busy) setView(null);};
  const open = () => {deletion.reset();setEmail('');setView('logout');};
  const scheduledDate = deletion.data?.scheduledAt
    ? new Date(deletion.data.scheduledAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})
    : null;

  return <>
    <button type="button" onClick={open} className="ml-1 rounded-lg p-1.5 transition hover:bg-accent" title="Account actions" aria-label="Log out or manage your account">
      <LogOut className="h-4 w-4 text-muted-foreground"/>
    </button>
    <dialog ref={modal} aria-labelledby="account-action-title"
      onCancel={event=>{if(busy)event.preventDefault();else close();}} onClose={close}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm">
      <div className="p-6">
        <div className={'mb-4 flex h-11 w-11 items-center justify-center rounded-xl '+(view==='delete'?'bg-red-500/10 text-red-500':'bg-violet-500/10 text-violet-500')}>
          {view==='delete'?<Trash2 className="h-5 w-5"/>:view==='scheduled'?<ShieldCheck className="h-5 w-5"/>:<LogOut className="h-5 w-5"/>}
        </div>
        <h2 id="account-action-title" className="text-xl font-semibold">{view==='delete'?'Delete your personal account?':view==='scheduled'?'Deletion scheduled':'Are you sure you want to log out?'}</h2>
        <p className="mt-2 break-all text-sm font-medium">{user.name || user.email}<span className="mt-1 block text-xs font-normal text-muted-foreground">{user.email}</span></p>
        {view==='logout' && <>
          <p className="mt-4 text-sm text-muted-foreground">You can sign back in to return to your workspace. Your company and workflows will keep running.</p>
          <div className="mt-6 flex justify-end gap-3">
            <button autoFocus type="button" onClick={close} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
            <button type="button" onClick={()=>logout.mutate()} disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{logout.isPending?'Logging out…':'Log out'}</button>
          </div>
          <div className="mt-6 border-t border-border pt-4"><button type="button" disabled={busy} onClick={()=>setView('delete')} className="flex items-center gap-2 text-sm text-red-500"><Trash2 className="h-4 w-4"/>Delete my account</button><p className="mt-1 text-xs text-muted-foreground">Personal account only. Company deletion is managed separately.</p></div>
        </>}
        {view==='delete' && <form onSubmit={event=>{event.preventDefault();if(email.trim().toLowerCase()===user.email.toLowerCase()&&!busy)deletion.mutate();}}>
          <p className="mt-4 text-sm text-muted-foreground">Your personal account will be deleted after a 30-day grace period. Your company, shared records and workflow definitions will be preserved. If you are the last owner, transfer ownership first.</p>
          <p className="mt-3 text-xs text-muted-foreground">You can cancel during the grace period in <Link href="/security/governance" onClick={close} className="underline">Security &amp; Governance → Personal data</Link>.</p>
          <label htmlFor="delete-account-email" className="mt-5 block text-sm font-medium">Type your email to confirm</label>
          <input id="delete-account-email" type="email" required autoComplete="off" value={email} onChange={event=>setEmail(event.target.value)} disabled={busy} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          {deletion.isError&&<p role="alert" className="mt-3 text-sm text-red-500">{errorMessage(deletion.error)}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy || email.trim().toLowerCase()!==user.email.toLowerCase()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{deletion.isPending?'Scheduling…':'Schedule personal deletion'}</button>
          </div>
        </form>}
        {view==='scheduled'&&<>
          <p role="status" className="mt-4 text-sm text-muted-foreground">Your personal account deletion is scheduled{scheduledDate?' for '+scheduledDate:''}. Your company and workflow definitions remain in place. You can cancel during the grace period.</p>
          <div className="mt-6 flex justify-end gap-3"><button type="button" autoFocus onClick={close} className="rounded-lg border border-border px-4 py-2 text-sm">Close</button><button type="button" onClick={()=>logout.mutate()} disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Log out</button></div>
        </>}
      </div>
    </dialog>
  </>;
}
