import React,{createContext,useContext} from 'react';
import {ActivityIndicator,StyleSheet,Text as NativeText,TextInput as NativeTextInput,View,
 type TextProps,type TextInputProps,type TextStyle} from 'react-native';
import {useFonts} from 'expo-font';
import {colors} from './designTokens';

// Static require() calls make Metro package the font assets into the offline native bundle.
const localFaces={
 'BMC-Regular':require('../../assets/fonts/BeVietnamPro-Regular.ttf'),
 'BMC-Medium':require('../../assets/fonts/BeVietnamPro-Medium.ttf'),
 'BMC-SemiBold':require('../../assets/fonts/BeVietnamPro-SemiBold.ttf'),
 'BMC-Bold':require('../../assets/fonts/BeVietnamPro-Bold.ttf'),
};
const FontReady=createContext(false);
function familyFor(style:TextProps['style']|TextInputProps['style']){
 const weight=(StyleSheet.flatten(style) as TextStyle|undefined)?.fontWeight;
 const n=weight==='bold'?700:weight==='normal'?400:Number(weight||400);
 if(n>=700)return 'BMC-Bold';
 if(n>=600)return 'BMC-SemiBold';
 if(n>=500)return 'BMC-Medium';
 return 'BMC-Regular';
}
/** Explicit fallback on load failure: never block offline order entry because of typography. */
export function BmcFontsProvider({children}:{children:React.ReactNode}){
 const [loaded,error]=useFonts(localFaces);
 if(!loaded&&!error)return <View style={styles.loading} accessibilityLabel="Đang tải phông chữ">
  <ActivityIndicator color={colors.accent}/>
 </View>;
 return <FontReady.Provider value={loaded}>{children}</FontReady.Provider>;
}
export function BmcText({style,...rest}:TextProps){
 const ready=useContext(FontReady);
 return <NativeText {...rest} style={[style,ready?{fontFamily:familyFor(style),fontWeight:'normal'}:undefined]}/>;
}
export function BmcTextInput({style,...rest}:TextInputProps){
 const ready=useContext(FontReady);
 return <NativeTextInput {...rest} style={[style,ready?{fontFamily:familyFor(style),fontWeight:'normal'}:undefined]}/>;
}
const styles=StyleSheet.create({loading:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.bg}});
