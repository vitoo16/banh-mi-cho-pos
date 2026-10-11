import React,{memo,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,KeyboardAvoidingView,Platform,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View,Alert,useWindowDimensions} from 'react-native';
import {SafeAreaProvider,useSafeAreaInsets} from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import {loadPending,stagePending,clearPending,type PendingOrder} from './src/pendingOrders';
import {colors,visual} from './src/ui/designTokens';
import {HubClient,formatVnd,classifyOrderCreateFailure,type Product,type Catalog,type PaymentMethod,type Order,type Session} from '@bmc/contracts';

const url=process.env.EXPO_PUBLIC_HUB_URL||'';
const tokenRef:{current:string|null}={current:null};
const deviceRef:{current:string|null}={current:null};
const api=new HubClient(url,()=>tokenRef.current||undefined,()=>deviceRef.current||undefined);
const deviceKey='bmc_staff_device_token_v1';
const newKey=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
type CartRecord={qty:number;note:string};
function Staff(){
 const insets=useSafeAreaInsets(),screen=useWindowDimensions();
 const [staffId,setStaffId]=useState('staff'),[pairingCode,setPairingCode]=useState(''),[credentialsReady,setCredentialsReady]=useState(false);
 useEffect(()=>{let active=true;SecureStore.getItemAsync(deviceKey).then(token=>{if(active)deviceRef.current=token}).catch(()=>{if(active)setError('Không đọc được bảo mật thiết bị. Vui lòng kiểm tra ứng dụng.')}).finally(()=>{if(active)setCredentialsReady(true)});return()=>{active=false}},[]);
 const [session,setSession]=useState<Session|null>(null),[pin,setPin]=useState(''),[screenName,setScreen]=useState<'menu'|'review'|'saved'|'history'|'recovery'>('menu'),[catalog,setCatalog]=useState<Catalog|null>(null);
 const [cart,setCart]=useState<Record<string,CartRecord>>({}),[orderNote,setOrderNote]=useState(''),[method,setMethod]=useState<PaymentMethod>('CASH'),[search,setSearch]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[priceChanged,setPriceChanged]=useState(false),[confirmed,setConfirmed]=useState<Order|null>(null),[recent,setRecent]=useState<Order[]>([]),[unknown,setUnknown]=useState(false);
 const pendingKey=useRef<string|null>(null);
 const [pending,setPending]=useState<PendingOrder|null>(null);
 const requestLock=useRef(false);
 const selected=useMemo(()=>catalog?.products.filter(p=>(cart[p.id]?.qty||0)>0)||[],[catalog,cart]);
 const count=useMemo(()=>selected.reduce((a,p)=>a+(cart[p.id]?.qty||0),0),[selected,cart]);
 const total=useMemo(()=>selected.reduce((a,p)=>a+p.price_vnd*(cart[p.id]?.qty||0),0),[selected,cart]);
 const products=useMemo(()=>catalog?.products.filter(p=>p.name.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN')))||[],[catalog,search]);
 const load=async()=>{try{setCatalog(await api.catalog());setError('')}catch(e){setError((e as Error).message)}};
 async function login(){
  if(!credentialsReady)return;
  setBusy(true);setError('');
  try{
   const s=await api.login(pin,staffId.trim().toLowerCase(),pairingCode.trim().toUpperCase()||undefined);
   if(s.device_token){await SecureStore.setItemAsync(deviceKey,s.device_token);deviceRef.current=s.device_token}
   tokenRef.current=s.token;
   const unfinished=await loadPending();
   if(unfinished&&unfinished.staff_id!==s.user.id){
    await api.logout().catch(()=>{});tokenRef.current=null;
    throw new Error('Máy còn đơn chưa xác nhận của nhân viên '+unfinished.staff_id+'. Người đó cần đăng nhập và kiểm tra đơn trước.');
   }
   setSession(s);setPin('');setPairingCode('');
   if(unfinished){setPending(unfinished);pendingKey.current=unfinished.key;setUnknown(true);setScreen('recovery')}
   else {setPending(null);setUnknown(false);setScreen('menu')}
   await load();
  }catch(e){tokenRef.current=null;setError((e as Error).message)}
  finally{setBusy(false)}
 }
 async function logout(){try{await api.logout()}catch{}finally{tokenRef.current=null;setSession(null);setCart({});setRecent([]);setConfirmed(null);setScreen('menu');setPin('');setError('')}}
 const adjust=useCallback((id:string,delta:number)=>{setCart(old=>({...old,[id]:{qty:Math.max(0,(old[id]?.qty||0)+delta),note:old[id]?.note||''}}))},[]);
 async function commitPending(draft:PendingOrder,lockHeld=false){
  if(!lockHeld){if(requestLock.current)return;requestLock.current=true}
  setBusy(true);setError('');
  try{
   const o=await api.createOrder(draft.body,draft.key);
   let cleanupWarning='';
   try{await clearPending(draft.key)}catch{cleanupWarning='POS đã xác nhận đơn, nhưng điện thoại chưa xóa được yêu cầu lưu. Nếu hiện lại, hãy kiểm tra cùng mã yêu cầu.'}
   setPending(null);pendingKey.current=null;setUnknown(false);setPriceChanged(false);
   setConfirmed(o);setScreen('saved');setCart({});setOrderNote('');setMethod('CASH');
   if(cleanupWarning)setError(cleanupWarning);
  }catch(e){
   const disposition=classifyOrderCreateFailure(e);
   if(disposition!=='UNKNOWN_KEEP_DRAFT'){
    try{await clearPending(draft.key)}catch{
     setUnknown(true);setScreen('recovery');
     setError('Không xóa được bản nháp an toàn. Đừng tạo đơn khác; hãy kiểm tra lại trên POS.');
     return;
    }
    setPending(null);pendingKey.current=null;setUnknown(false);
    if(disposition==='PRICE_REFRESH'){await load();setPriceChanged(true)}
    setScreen('review');setError((e as Error).message);
   }else{
    // A 409 is NOT necessarily a stale catalog. It may mean an older
    // idempotency record whose order was already committed before migration.
    // Preserve the exact persisted request and key for human reconciliation.
    setUnknown(true);setScreen('recovery');
    setError('Không chắc đơn đã được lưu. Giữ nguyên bản ghi và mã chống trùng; kiểm tra cùng mã đơn trên POS trước khi thử lại.');
   }
  }finally{requestLock.current=false;setBusy(false)}
 }
 const save=async()=>{
  if(busy||requestLock.current||count===0||!catalog||!session||pending||unknown||priceChanged)return;
  requestLock.current=true;setBusy(true);
  const draft:PendingOrder={
   key:pendingKey.current||newKey(),
   staff_id:session.user.id,
   body:{catalog_version:catalog.version,requested_payment_method:method,items:selected.map(p=>({product_id:p.id,qty:cart[p.id].qty,note:cart[p.id].note})),note:orderNote},
   created_at:Date.now()
  };
  try{
   await stagePending(draft); // commit locally BEFORE any HTTP attempt
   setPending(draft);pendingKey.current=draft.key;
  }catch(e){setError('Không lưu được bản ghi an toàn trên điện thoại: '+(e as Error).message);requestLock.current=false;setBusy(false);return}
  await commitPending(draft,true);
 };
 async function resolveUnknown(){if(pending)await commitPending(pending)}
 async function showHistory(){setScreen('history');try{setRecent(await api.orders())}catch(e){setError((e as Error).message)}}
 const changeNote=(id:string,note:string)=>setCart(c=>({...c,[id]:{qty:c[id]?.qty||0,note}}));
 const rootPadding=Math.max(insets.bottom,12);
 if(!url)return <View style={s.center}><Text style={s.heading}>Thiếu địa chỉ máy POS</Text><Text style={s.desc}>Cấu hình EXPO_PUBLIC_HUB_URL trong file .env và build lại ứng dụng.</Text></View>;
 if(!url.startsWith('https://')&&!(typeof __DEV__!=='undefined'&&__DEV__&&process.env.EXPO_PUBLIC_ALLOW_INSECURE_DEV==='1'))
   return <View style={s.center}><Text style={s.heading}>Cần HTTPS để kết nối POS</Text><Text style={s.desc}>Liên hệ chủ tiệm để sử dụng địa chỉ Store Hub HTTPS có chứng chỉ được điện thoại tin cậy. HTTP chỉ dành cho development có bật cờ rõ ràng.</Text></View>;
 if(!session)return <KeyboardAvoidingView style={s.login} behavior={Platform.OS==='ios'?'padding':undefined}><StatusBar barStyle="dark-content"/><View style={s.logo}><Text style={s.logoText}>BMC</Text></View><Text style={s.kicker}>BÁNH MÌ CHỢ</Text><Text style={s.loginTitle}>Bắt đầu nhận đơn</Text><Text style={s.desc}>Nhập mã PIN do chủ tiệm cấp.</Text><Text style={s.label}>Mã nhân viên</Text><TextInput accessibilityLabel="Mã nhân viên" autoCapitalize="none" autoCorrect={false} value={staffId} onChangeText={setStaffId} style={s.input}/><Text style={s.label}>Mã PIN nhân viên</Text><TextInput accessibilityLabel="Mã PIN nhân viên" secureTextEntry value={pin} onChangeText={setPin} style={s.input} autoCorrect={false} keyboardType="numeric"/><Text style={s.label}>Mã ghép thiết bị (chỉ nhập lần đầu hoặc sau khi bị thu hồi)</Text><TextInput accessibilityLabel="Mã ghép thiết bị" autoCapitalize="characters" autoCorrect={false} value={pairingCode} onChangeText={setPairingCode} maxLength={16} style={s.input} placeholder="16 ký tự do chủ tiệm cung cấp"/><Pressable style={s.primary} disabled={busy||!credentialsReady||pin.length<6} onPress={()=>void login()}><Text style={s.primaryText}>Đăng nhập</Text></Pressable>{error&&<Text style={s.error}>{error}</Text>}</KeyboardAvoidingView>;
 const body=<View style={s.root}>
  <View style={s.header}><View><Text style={s.kicker}>BÁNH MÌ CHỢ</Text><Text style={s.title}>{screenName==='menu'?'Nhận đơn mới':screenName==='review'?'Kiểm tra đơn':screenName==='saved'?'Đã lưu đơn':screenName==='recovery'?'Kiểm tra đơn đang gửi':'Đơn của tôi'}</Text></View><Pressable accessibilityRole="button" onPress={()=>screenName==='menu'?void showHistory():pending?setScreen('recovery'):setScreen('menu')} style={s.historyButton}><Text style={s.historyLabel}>{screenName==='menu'?'Đơn của tôi':pending?'Đơn đang chờ':'← Trở lại'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Đăng xuất" onPress={()=>void logout()} style={s.historyButton}><Text style={s.historyLabel}>Thoát</Text></Pressable></View>
  {screenName==='menu'&&<><View style={s.searchWrap}><TextInput placeholder="Tìm tên món…" placeholderTextColor="#849085" value={search} onChangeText={setSearch} style={s.searchInput}/></View>
    <FlatList data={products} keyExtractor={p=>p.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:16,paddingBottom:100}} ListEmptyComponent={<Text style={s.desc}>Chưa có món. Chủ tiệm cần thêm món vào danh mục.</Text>} renderItem={({item})=><ProductRow item={item} qty={cart[item.id]?.qty||0} adjust={adjust}/>}/>
    <View style={[s.footer,{paddingBottom:rootPadding}]}><View style={{flex:1,minWidth:0}}><Text style={s.footerLabel}>{count} món</Text><Text style={s.footerAmount}>{formatVnd(total)}</Text></View><Pressable accessibilityRole="button" disabled={count===0} onPress={()=>setScreen('review')} style={[s.footerAction,count===0&&{opacity:.45}]}><Text style={s.footerActionText}>Xem đơn →</Text></Pressable></View>
  </>}
  {screenName==='review'&&<KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={{padding:16,paddingBottom:25}} keyboardShouldPersistTaps="handled">
    <Text style={s.sectionLabel}>MÓN ĐÃ CHỌN</Text>{selected.map(p=><View key={p.id} style={s.cartItem}><View style={s.itemHead}><Text style={[s.productName,{flex:1}]}>{p.name}</Text><Text style={s.productPrice}>{formatVnd(p.price_vnd*cart[p.id].qty)}</Text></View><View style={s.itemFoot}><Stepper qty={cart[p.id].qty} onMinus={()=>adjust(p.id,-1)} onPlus={()=>adjust(p.id,1)}/></View><TextInput placeholder="Ghi chú cho món (nếu có)" placeholderTextColor="#879189" value={cart[p.id].note} onChangeText={n=>changeNote(p.id,n)} style={s.noteInput}/></View>)}
    <Text style={s.sectionLabel}>GHI CHÚ CHO ĐƠN</Text><TextInput placeholder="Ví dụ: khách lấy sau…" placeholderTextColor="#879189" value={orderNote} onChangeText={setOrderNote} multiline style={s.noteInput}/>
    <Text style={[s.sectionLabel,{marginTop:24}]}>KHÁCH THANH TOÁN BẰNG</Text><View style={{gap:10}}>{([['CASH','Tiền mặt'],['BANK','Chuyển khoản ngân hàng']] as const).map(([m,title])=><Pressable key={m} style={[s.method,method===m&&s.methodActive]} onPress={()=>setMethod(m)} accessibilityRole="radio" accessibilityState={{checked:method===m}}><View style={[s.radio,method===m&&s.radioOn]}/><Text style={s.methodText}>{title}</Text></Pressable>)}</View>
   {error&&<Text style={s.error}>{error}</Text>}{priceChanged&&<View style={s.tip}><Text style={s.tipText}>Giá món đã thay đổi. Kiểm tra tổng tiền mới trước khi lưu.</Text><Pressable accessibilityRole="button" style={s.primary} onPress={()=>{pendingKey.current=null;setPriceChanged(false)}}><Text style={s.primaryText}>Đã xem giá mới</Text></Pressable></View>}{unknown&&<Text style={s.warning}>Chưa biết Store Hub đã nhận được đơn hay chưa. Kiểm tra lại với cùng mã yêu cầu, không tạo đơn mới.</Text>}
   </ScrollView><View style={[s.footer,{paddingBottom:rootPadding}]}><View style={{flex:1}}><Text style={s.footerLabel}>TỔNG TẠM TÍNH</Text><Text style={s.footerAmount}>{formatVnd(total)}</Text></View><Pressable style={[s.footerAction,busy&&{opacity:.5}]} disabled={busy||count===0||priceChanged} onPress={()=>void (unknown?resolveUnknown():save())}><Text style={s.footerActionText}>{busy?'Đang xử lý…':unknown?'Kiểm tra lại đơn':'LƯU ĐƠN'}</Text></Pressable></View></KeyboardAvoidingView>}
  {screenName==='recovery'&&pending&&<View style={s.saved}><View style={s.savedIcon}><Text style={{fontSize:30,color:colors.accent}}>!</Text></View><Text style={s.kicker}>CẦN KIỂM TRA TRẠNG THÁI</Text><Text style={s.loginTitle}>Đơn đang chờ xác nhận</Text><Text style={s.desc}>Điện thoại đã lưu an toàn yêu cầu của nhân viên {pending.staff_id} gồm {pending.body.items.reduce((sum,item)=>sum+item.qty,0)} món. POS có thể đã nhận đơn trước khi kết nối bị gián đoạn.</Text><View style={s.tip}><Text style={s.tipText}>Không tạo đơn mới. Bấm kiểm tra lại để gửi lại CHÍNH XÁC yêu cầu trước đó bằng cùng mã chống trùng.</Text></View><Pressable style={[s.primary,busy&&{opacity:.5}]} disabled={busy} onPress={()=>void resolveUnknown()}><Text style={s.primaryText}>{busy?'Đang kiểm tra…':'Kiểm tra lại đơn với POS'}</Text></Pressable>{error&&<Text style={s.error}>{error}</Text>}</View>}
  {screenName==='saved'&&confirmed&&<View style={s.saved}><View style={s.savedIcon}><Text style={{fontSize:34,color:colors.green}}>✓</Text></View><Text style={s.kicker}>ĐÃ GHI NHẬN VÀO POS</Text><Text style={s.savedCode}>#{confirmed.display_code}</Text><Text style={s.savedAmount}>{formatVnd(confirmed.total_vnd)}</Text><Text style={s.desc}>Khách chọn: {confirmed.requested_payment_method==='BANK'?'Chuyển khoản':'Tiền mặt'} · Chưa xác nhận thu tiền</Text><View style={s.tip}><Text style={s.tipText}>Báo miệng đơn cho người chuẩn bị bánh bên trong.</Text></View><Pressable style={s.primary} onPress={()=>{setConfirmed(null);setScreen('menu')}}><Text style={s.primaryText}>Tạo đơn tiếp</Text></Pressable></View>}
  {screenName==='history'&&<FlatList data={recent} keyExtractor={o=>o.order_id} contentContainerStyle={{padding:16}} ListEmptyComponent={<Text style={s.desc}>Chưa có đơn gần đây.</Text>} renderItem={({item:o})=><View style={s.historyRow}><View><Text style={s.productName}>#{o.display_code}</Text><Text style={s.desc}>{new Date(o.created_at).toLocaleTimeString('vi-VN')}</Text></View><View style={{alignItems:'flex-end'}}><Text style={s.productPrice}>{formatVnd(o.total_vnd)}</Text><Text style={o.payment_status==='PAID'?s.paidText:s.pendingText}>{o.status==='VOIDED'?'Đã hủy':o.payment_status==='REFUNDED'?'Đã hoàn tiền':o.payment_status==='PAID'?'Đã thu tiền':'Chưa thu tiền'}</Text></View></View>}/>}
 </View>;
 return <>{body}</>;
}
const Stepper=memo(({qty,onMinus,onPlus}:{qty:number;onMinus:()=>void;onPlus:()=>void})=><View style={s.stepper}><Pressable onPress={onMinus} disabled={qty===0} accessibilityLabel="Giảm số lượng" style={[s.stepBtn,qty===0&&{opacity:.35}]}><Text style={s.stepText}>−</Text></Pressable><Text style={s.qty}>{qty}</Text><Pressable onPress={onPlus} accessibilityLabel="Tăng số lượng" style={s.stepBtn}><Text style={s.stepText}>+</Text></Pressable></View>);
const ProductRow=memo(({item,qty,adjust}:{item:Product;qty:number;adjust:(id:string,delta:number)=>void})=><View style={s.productRow}><View style={s.productInfo}><Text style={s.productName}>{item.name}</Text><Text style={s.productPrice}>{formatVnd(item.price_vnd)}</Text></View><Stepper qty={qty} onMinus={()=>adjust(item.id,-1)} onPlus={()=>adjust(item.id,1)}/></View>);
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:colors.bg},center:{flex:1,justifyContent:'center',padding:30},heading:{fontSize:22,fontWeight:'700',color:colors.ink},header:{padding:16,paddingTop:17,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,backgroundColor:colors.paper,borderBottomWidth:1,borderBottomColor:colors.line},kicker:{fontSize:11,fontWeight:'800',letterSpacing:2,color:colors.accent},title:{fontSize:25,fontWeight:'800',color:colors.ink,marginTop:3},historyButton:{backgroundColor:'#F5F2ED',paddingHorizontal:13,paddingVertical:12,borderRadius:visual.radiusControl,minHeight:44,justifyContent:'center'},historyLabel:{color:colors.ink,fontWeight:'700',fontSize:12},login:{flex:1,justifyContent:'center',padding:24,backgroundColor:colors.bg},logo:{backgroundColor:colors.accent,width:58,height:58,borderRadius:17,alignItems:'center',justifyContent:'center',marginBottom:22},logoText:{color:'#fff',fontWeight:'900',fontSize:19},loginTitle:{fontSize:30,color:colors.ink,fontWeight:'800',marginTop:8,marginBottom:8},desc:{fontSize:13,color:colors.sub,lineHeight:21},label:{fontSize:14,color:colors.sub,fontWeight:'700',marginTop:26,marginBottom:10},input:{borderRadius:12,borderWidth:1,borderColor:colors.line,backgroundColor:'#fff',padding:14,fontSize:18,minHeight:55,color:colors.ink},primary:{backgroundColor:colors.accent,borderRadius:12,padding:18,alignItems:'center',marginTop:18},primaryText:{color:'#fff',fontSize:16,fontWeight:'800'},searchWrap:{backgroundColor:'#fff',paddingHorizontal:16,paddingBottom:14},searchInput:{minHeight:46,borderRadius:10,backgroundColor:'#F7F7F3',paddingHorizontal:15,fontSize:16,color:colors.ink},productRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:18,borderBottomWidth:1,borderColor:colors.line,gap:10,minHeight:96},productInfo:{flex:1,minWidth:0,flexShrink:1},productName:{fontSize:17,color:colors.ink,fontWeight:'700',lineHeight:24},productPrice:{fontSize:17,color:colors.accent,fontWeight:'800',marginTop:5},stepper:{flexDirection:'row',alignItems:'center',gap:5},stepBtn:{width:visual.minTouch,height:visual.minTouch,borderRadius:visual.radiusControl,backgroundColor:colors.paper,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},stepText:{fontSize:25,color:colors.ink,fontWeight:'500'},qty:{minWidth:21,fontSize:16,textAlign:'center',color:colors.ink,fontWeight:'800'},footer:{flexDirection:'row',alignItems:'center',gap:10,paddingTop:12,paddingHorizontal:16,backgroundColor:colors.paper,borderTopWidth:1,borderColor:colors.line},footerLabel:{fontSize:11,fontWeight:'700',color:colors.sub},footerAmount:{fontSize:22,fontWeight:'900',color:colors.ink,marginTop:4},footerAction:{backgroundColor:colors.accent,minWidth:125,minHeight:53,borderRadius:11,alignItems:'center',justifyContent:'center',paddingHorizontal:16},footerActionText:{color:'#fff',fontWeight:'800',fontSize:15},sectionLabel:{fontSize:11,fontWeight:'800',letterSpacing:1.4,color:colors.sub,marginBottom:12},cartItem:{backgroundColor:colors.paper,borderRadius:13,borderWidth:1,borderColor:colors.line,padding:14,marginBottom:11},itemHead:{flexDirection:'row',gap:10},itemFoot:{alignItems:'flex-end',marginTop:9},noteInput:{borderColor:colors.line,borderWidth:1,backgroundColor:colors.paper,borderRadius:9,minHeight:46,padding:12,fontSize:16,color:colors.ink,marginTop:10},method:{minHeight:55,backgroundColor:colors.paper,borderRadius:12,borderWidth:1,borderColor:colors.line,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14},methodActive:{backgroundColor:colors.pale,borderColor:colors.accent,borderWidth:2},radio:{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:'#99A59B'},radioOn:{borderWidth:6,borderColor:colors.accent,backgroundColor:'#fff'},methodText:{fontSize:15,fontWeight:'700',color:colors.ink},error:{color:colors.bad,fontSize:13,marginTop:12,lineHeight:21},warning:{color:colors.warning,backgroundColor:'#FFF3DD',padding:12,borderRadius:9,fontSize:13,marginTop:12},saved:{flex:1,alignItems:'center',justifyContent:'center',padding:20},savedIcon:{width:80,height:80,borderRadius:40,alignItems:'center',justifyContent:'center',backgroundColor:'#E6F6E8',marginBottom:25},savedCode:{fontSize:44,color:colors.ink,fontWeight:'900',letterSpacing:-1,marginVertical:10},savedAmount:{fontSize:29,fontWeight:'800',color:colors.accent,marginBottom:10},tip:{backgroundColor:colors.pale,borderRadius:12,padding:17,marginTop:28,width:'100%'},tipText:{fontSize:14,color:'#8B410D',fontWeight:'700',textAlign:'center',lineHeight:22},historyRow:{backgroundColor:'#fff',borderWidth:1,borderColor:colors.line,borderRadius:12,padding:16,marginBottom:10,flexDirection:'row',justifyContent:'space-between',gap:12},paidText:{fontSize:12,color:colors.green,fontWeight:'700',marginTop:6},pendingText:{fontSize:12,color:colors.warning,fontWeight:'700',marginTop:6}
});
export default function App(){return <SafeAreaProvider><Staff/></SafeAreaProvider>}
