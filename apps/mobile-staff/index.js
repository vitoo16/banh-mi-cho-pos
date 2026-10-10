import {registerRootComponent} from 'expo';
import App from './App';

// Explicit workspace-relative entrypoint. Resolves when npm hoists Expo under root node_modules.
registerRootComponent(App);
