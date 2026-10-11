import type {Employee,StaffDevice,PairingCode} from '@bmc/contracts';
import {useStaffQueries} from './queries';

/** OR-04a: Staff and Device UI only; server-side authorization remains in Hub. */
export type StaffDeviceProps={
 devices:StaffDevice[];
 deviceLabel:string;
 newPairing:PairingCode|null;
 busy:boolean;
 onDeviceLabelChange:(value:string)=>void;
 onIssuePairing:()=>void|Promise<void>;
 onRevokeDevice:(device:StaffDevice)=>void|Promise<void>;
};
export function StaffDevicesSection({devices,deviceLabel,newPairing,busy,onDeviceLabelChange,onIssuePairing,onRevokeDevice}:StaffDeviceProps){
 return (<section className="panel" style={{marginBottom:18}}><h2>Thiết bị nhân viên</h2><p className="muted">Tạo mã ghép 16 ký tự dùng một lần, có hiệu lực 3 phút. Chỉ cung cấp trực tiếp cho nhân viên đang đứng tại quầy.</p><div className="panelhead"><input value={deviceLabel} onChange={e=>onDeviceLabelChange(e.target.value)} maxLength={80} placeholder="Tên thiết bị (VD: Điện thoại NV 01)" aria-label="Tên thiết bị"/><button className="primary" disabled={busy||deviceLabel.trim().length<3} onClick={()=>void onIssuePairing()}>Tạo mã ghép</button></div>{newPairing&&<div className="info" role="status">Mã ghép: <strong style={{letterSpacing:2}}>{newPairing.pairing_code}</strong><div>Hết hạn: {new Date(newPairing.expires_at).toLocaleTimeString('vi-VN')}</div></div>}<div className="records">{devices.map(d=><div className="record" key={d.id}><div><b>{d.label}</b><small>{d.user_id} · {d.revoked_at?'Đã thu hồi':'Đang được phép sử dụng'}</small></div>{!d.revoked_at&&<button className="textbutton" disabled={busy} onClick={()=>void onRevokeDevice(d)}>Thu hồi</button>}</div>)}{devices.length===0&&<p className="muted">Chưa ghép thiết bị nhân viên nào.</p>}</div></section>);
}

export type StaffEmployeeProps={
 employees:Employee[];
 empId:string;
 empName:string;
 empPin:string;
 empRole:'STAFF'|'CASHIER';
 busy:boolean;
 onEmpIdChange:(value:string)=>void;
 onEmpNameChange:(value:string)=>void;
 onEmpPinChange:(value:string)=>void;
 onEmpRoleChange:(role:'STAFF'|'CASHIER')=>void;
 onCreateEmployee:()=>void|Promise<void>;
 onToggleEmployee:(employee:Employee)=>void|Promise<void>;
};
export function StaffEmployeesSection({
 employees,empId,empName,empPin,empRole,busy,onEmpIdChange,onEmpNameChange,
 onEmpPinChange,onEmpRoleChange,onCreateEmployee,onToggleEmployee,
}:StaffEmployeeProps){
 return (<div className="twocol"><section className="panel"><h2>Tài khoản tại tiệm</h2><p className="muted">Mỗi nhân viên sử dụng mã đăng nhập riêng để truy vết đơn.</p>{employees.map(e=><div className="record" key={e.id}><div><b>{e.name}</b><small>{e.id} · {e.role==='CASHIER'?'Thu ngân':e.role==='OWNER'?'Chủ tiệm':'Nhận đơn'} · {e.active?'Hoạt động':'Đã khóa'}</small></div>{e.role!=='OWNER'&&<button className="textbutton" onClick={()=>void onToggleEmployee(e)}>{e.active?'Khóa':'Mở lại'}</button>}</div>)}</section><section className="panel"><h2>Thêm nhân viên</h2><label>Mã nhân viên</label><input value={empId} onChange={e=>onEmpIdChange(e.target.value)} placeholder="nv01" autoCapitalize="none"/><label>Tên hiển thị</label><input value={empName} onChange={e=>onEmpNameChange(e.target.value)} placeholder="Nguyễn A"/><label>Vai trò</label><select value={empRole} onChange={e=>onEmpRoleChange(e.target.value as 'STAFF'|'CASHIER')}><option value="STAFF">Nhận đơn</option><option value="CASHIER">Thu ngân</option></select><label>PIN (từ 6 ký tự)</label><input type="password" value={empPin} onChange={e=>onEmpPinChange(e.target.value)} autoComplete="new-password"/><button className="primary" disabled={busy||empPin.length<6||empId.length<2||!empName.trim()} onClick={()=>void onCreateEmployee()}>Tạo tài khoản</button></section></div>);
}

/** Cloud Owner may view reports but cannot operate local staff/device controls. */
export function StaffPage({remote,ownerId,deviceProps,employeeProps}:{
 remote:boolean;
 ownerId:string;
 deviceProps:Omit<StaffDeviceProps,'devices'>;
 employeeProps:Omit<StaffEmployeeProps,'employees'>;
}){
 const {devices,employees}=useStaffQueries(ownerId);
 if(remote)return (<section className="panel"><h2>Nhân viên</h2><p className="muted">Quản lý nhân viên chỉ được thao tác từ POS nội bộ; trang cloud chỉ hiển thị báo cáo.</p></section>);
 return <>
  {devices.isPending&&<p className="muted" role="status">Đang tải thiết bị…</p>}
  {devices.isError&&<p className="alert" role="alert">Không tải được thiết bị. <button className="textbutton" type="button" onClick={()=>void devices.refetch()}>Thử lại thiết bị</button></p>}
  {devices.isSuccess&&<StaffDevicesSection {...deviceProps} devices={devices.data}/>}
  {employees.isPending&&<p className="muted" role="status">Đang tải nhân viên…</p>}
  {employees.isError&&<p className="alert" role="alert">Không tải được danh sách nhân viên. <button className="textbutton" type="button" onClick={()=>void employees.refetch()}>Thử lại nhân viên</button></p>}
  {employees.isSuccess&&<StaffEmployeesSection {...employeeProps} employees={employees.data}/>}
 </>;
}
