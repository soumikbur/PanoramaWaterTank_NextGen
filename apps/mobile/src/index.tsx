import { AppRegistry } from 'react-native';
import 'leaflet/dist/leaflet.css';
import App from './App';

AppRegistry.registerComponent('PanoramaWaterTank', () => App);
AppRegistry.runApplication('PanoramaWaterTank', {
  initialProps: {},
  rootTag: document.getElementById('root'),
});
