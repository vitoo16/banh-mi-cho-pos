import type {FormEvent} from 'react';
import {ShoppingBag} from 'lucide-react';

type Props={
 remote:boolean; pin:string; busy:boolean; error:string;
 onPinChange:(next:string)=>void;onSignIn:(event:FormEvent<HTMLFormElement>)=>void;
};
/** Keep the auth UI outside the authenticated app tree. */
export function OwnerLogin({remote,pin,busy,error,onPinChange,onSignIn}:Props){
 return <main className="login">
  <section className="loginbox" aria-label="Đăng nhập chủ tiệm">
   <div className="logo" aria-hidden="true"><ShoppingBag/></div>
   <p className="eyebrow">BÁNH MÌ CHỢ</p>
   <h1>Dành cho chủ tiệm</h1>
   <p className="muted">Theo dõi hoạt động bán hàng, kiểm soát dòng tiền.</p>
   <form onSubmit={onSignIn}>
    <label htmlFor="owner-pin">{remote?'Mật khẩu quản trị từ xa':'Mã PIN chủ tiệm'}</label>
    <input id="owner-pin" name="pin" autoComplete="current-password" type="password" autoFocus
      value={pin} onChange={e=>onPinChange(e.target.value)} minLength={remote?16:6} required
      aria-invalid={Boolean(error)} aria-describedby={error?'owner-login-error':undefined}/>
    <button className="primary" disabled={busy||pin.length<(remote?16:6)} type="submit">
     {busy?'Đang xác thực…':'Đăng nhập'}
    </button>
   </form>
   {error&&<p id="owner-login-error" className="alert" role="alert">{error}</p>}
   <small className="muted">{remote?'Dữ liệu từ Cloud, có thể trễ khi tiệm mất mạng.':'Dữ liệu Store Hub tại tiệm; không phải báo cáo Cloud.'}</small>
  </section>
 </main>;
}
