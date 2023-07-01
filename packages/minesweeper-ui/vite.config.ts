import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['generateMineLocations-lib'],
  },
  build: {
    commonjsOptions: {
      include: [/generateMineLocations-lib/, /node_modules/],
    },
  },
})
