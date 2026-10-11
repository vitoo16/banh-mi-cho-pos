import React from 'react';
import {LayoutDashboard,ClipboardList,Tags,Wallet,Settings,LogOut,ShoppingBag,AlertCircle,RefreshCcw} from 'lucide-react';

export type OwnerPage='dashboard'|'sales'|'orders'|'catalog'|'finance'|'staff';
const nav:[OwnerPage,string,React.ReactNode][]=[['dashboard','Tổng quan',<LayoutDashboard size={19}/>],['sales','Sản lượng',<Tags size={19}/>],['orders','Đơn hàng',<ClipboardList size={19}/>],['finance','Tài chính',<Wallet size={19}/>],['catalog','Sản phẩm',<Tags size={19}/>],['staff','Nhân viên',<Settings size={19}/>]];

/** Presentational Owner shell; auth, refresh and page-state remain in the controller. */
export function AppShell({
 userName,page,remote,children,onSidebarNavigate,onBottomNavigate,onLogout,onRefresh,
}:{
 userName:string;page:OwnerPage;remote:boolean;children:React.ReactNode;
 onSidebarNavigate:(page:OwnerPage)=>void;
 onBottomNavigate:(page:OwnerPage)=>void;
 onLogout:()=>void|Promise<unknown>;onRefresh:()=>void;
}){
 return <div className="layout"><aside className="sidebar"><div className="brand"><span className="logo"><ShoppingBag size={23}/></span><div><b>Bánh Mì Chợ</b><small>Quản lý cửa hàng</small></div></div><nav className="navlinks" aria-label="Điều hướng chính">{nav.map(([k,l,icon])=><button key={k} className={page===k?'active':''} onClick={()=>onSidebarNavigate(k)} aria-current={page===k?'page':undefined}>{icon}{l}</button>)}</nav><div className="sidefoot"><div><b>{userName}</b><small>Chủ tiệm</small></div><button title="Đăng xuất" onClick={()=>void onLogout()}><LogOut size={19}/></button></div></aside><main className="main"><header className="header"><div><p className="eyebrow">BẢNG ĐIỀU KHIỂN CỬA HÀNG</p><h1>{nav.find(([k])=>k===page)?.[1]}</h1></div><button className="reload" title="Tải lại" onClick={onRefresh}><RefreshCcw size={19}/></button></header><div className="stale"><AlertCircle size={17}/> {remote?'Dữ liệu Cloud có thể trễ; giá mới chỉ có hiệu lực khi Hub tại tiệm xác nhận.':'Chế độ POS nội bộ; dữ liệu tại quầy.'}</div>
 {children}
 </main><nav className="bottomnav" aria-label="Điều hướng di động">{nav.map(([k,l,icon])=><button key={k} className={page===k?'active':''} onClick={()=>onBottomNavigate(k)} aria-current={page===k?'page':undefined}>{icon}<small>{l}</small></button>)}</nav></div>;
}
