import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      },
      external: ['app.js']
    }
  },
  publicDir: 'public',
  plugins: [
    {
      name: 'copy-files',
      closeBundle() {
        const files = ['app.v2.js', 'style.css', 'manifest.json', 'icon-192.svg', 'sw.js'];
        files.forEach(file => {
          if (existsSync(file)) {
            let destFile = file;
            if (file === 'app.v2.js') {
              destFile = 'app.v4.js';
            }
            copyFileSync(file, `dist/${destFile}`);
          }
        });
      }
    }
  ]
})