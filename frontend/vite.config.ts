import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "recharts", test: "node_modules/recharts" },
            {
              name: "victory-vendor",
              test: "node_modules/victory-vendor",
            },
            { name: "d3-array", test: "node_modules/d3-array" },
            { name: "d3-scale", test: "node_modules/d3-scale" },
            { name: "d3-shape", test: "node_modules/d3-shape" },
            { name: "d3-time", test: "node_modules/d3-time" },
            { name: "d3-color", test: "node_modules/d3-color" },
            { name: "d3-format", test: "node_modules/d3-format" },
            {
              name: "react-redux",
              test: "node_modules/react-redux",
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3333',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
