import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],resolve:{dedupe:['react','react-dom','react/jsx-runtime']},server:{port:5173,host:'127.0.0.1',proxy:{'/v1':{target:'http://127.0.0.1:4400',changeOrigin:true}}},build:{target:'es2022'}});
