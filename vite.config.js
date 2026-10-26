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
        const files = ['app.v4.js', 'app.v5.js', 'secretariat.js', 'urgence.js', 'urgence-orders.js', 'flux.js', 'style.css', 'manifest.json', 'icon-192.svg', 'sw.js', 'supabase/functions/generate-monthly-pdf/template.html', 'dist-package.json', 'dist-vercel.json', 'api/dae.js'];
        files.forEach(file => {
          if (existsSync(file)) {
            const parts = file.split('/');
            if (parts.length > 1) {
              const dir = `dist/${parts.slice(0, -1).join('/')}`;
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            }
            const target = file === 'dist-package.json' ? 'dist/package.json'
              : file === 'dist-vercel.json' ? 'dist/vercel.json'
              : `dist/${file}`;
            copyFileSync(file, target);
          }
        });
      }
    }
  ]
})